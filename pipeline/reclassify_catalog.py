"""Re-score every Tier-1 row with taxonomy v2 and rewrite all four artefacts.

W2 §1.3. The v1 -> v2 classifier change moves label decisions across the whole
catalogue, and regenerating the 310 MB artefact set is a CI/PR concern — this
script is what `backfill_123k.yml` runs after `rebuild_catalog.py` so the churn
lands in one reviewable PR instead of being silently baked in.

Pipeline (single-writer units imported from `rebuild_catalog`):

  load_packed -> load_shards -> attach_deep (full descriptions + stored topics)
  -> reclassify each record (labels, keywords swap, template cards)
  -> finalize_records -> churn histogram (+ optional machine-readable report)
  -> gate: domain churn > --max-churn-pct without --allow-churn => exit 2
  -> write_artifacts

`--dry-run` stops after the histogram and never writes (exit 0): it is the
local-evidence path, since the live 310 MB artefact regeneration only happens
in CI.

Reclassification rules
----------------------
* labels: `classify_domain_and_subsystem` (3-tuple) + `classify_artifact`,
  evaluated over the attached full description and stored topics.
* `keywords`: the three leading label entries (subsystem, artifact, domain)
  are swapped for the new ones; primitives / compatibility / usecases / topic
  entries are preserved in order.
* `beginner_intel`: regenerated **only** when the existing card is exactly one
  of the two deterministic templates (generated card or writer fallback card)
  for the *old* labels. Curated cards (SEEDS, future hand-written copy) never
  match a template and are therefore never touched.
* `topics` are never rewritten — only read.

Exit codes: 0 = applied or dry-run reported · 2 = live run over churn budget
without `--allow-churn`.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter, defaultdict

sys.path.append(os.path.dirname(__file__))
from taxonomy_engine import (  # noqa: E402
    classify_artifact,
    classify_domain_and_subsystem,
    generate_beginner_context,
)
from rebuild_catalog import (  # noqa: E402
    attach_deep,
    default_beginner_intel,
    finalize_records,
    load_packed,
    load_shards,
    normalise_topics,
    write_artifacts,
)


def reclassify_records(catalog: dict) -> dict:
    """Re-run v2 classifiers on every record in place.

    Returns {"transitions": {facet: Counter("old -> new": n)}, "margins": Counter}.
    Each record keeps a transient `_old_domain` for the histogram; callers pop it
    before writing artefacts.
    """
    transitions = defaultdict(Counter)
    margins: Counter = Counter()

    for rec in catalog.values():
        name = rec.get("name") or ""
        description = rec.get("description") or ""
        topics = normalise_topics(rec.get("topics"))
        language = rec.get("language") or "Other"
        old_dom = rec.get("domain") or "Other / General"
        old_sub = rec.get("subsystem") or "General Components"
        old_art = rec.get("artifact") or "Application / Service"

        new_dom, new_sub, margin = classify_domain_and_subsystem(
            name, description, topics, language)
        new_art = classify_artifact(name, description, topics)

        rec["_old_domain"] = old_dom
        rec["_old_subsystem"] = old_sub
        rec["_old_artifact"] = old_art
        margins[int(margin)] += 1
        if new_dom != old_dom:
            transitions["domain"][f"{old_dom} -> {new_dom}"] += 1
        if new_sub != old_sub:
            transitions["subsystem"][f"{old_sub} -> {new_sub}"] += 1
        if new_art != old_art:
            transitions["artifact"][f"{old_art} -> {new_art}"] += 1

        if (new_dom, new_sub, new_art) != (old_dom, old_sub, old_art):
            old_labels = {old_dom, old_sub, old_art}
            kept = [k for k in (rec.get("keywords") or []) if k not in old_labels]
            rec["keywords"] = list(dict.fromkeys([new_sub, new_art, new_dom] + kept))

        if new_dom != old_dom or new_sub != old_sub:
            card = rec.get("beginner_intel") or {}
            is_template = card in (
                generate_beginner_context(name, old_dom, old_sub, language),
                default_beginner_intel((rec.get("hook") or description or "")[:90], old_sub),
            )
            if is_template:
                rec["beginner_intel"] = generate_beginner_context(
                    name, new_dom, new_sub, language)

        rec["domain"] = new_dom
        rec["subsystem"] = new_sub
        rec["artifact"] = new_art
        rec["domain_margin"] = int(margin)

    return {"transitions": dict(transitions), "margins": margins}


def build_report(records: list, result: dict) -> dict:
    """Churn report computed from the finalized records (single source of truth)."""
    total = len(records)
    dom_changed = sum(1 for r in records if r.get("_old_domain") != r["domain"])
    sub_changed = sum(1 for r in records
                      if r.get("_old_subsystem", r.get("subsystem")) != r["subsystem"])
    art_changed = sum(1 for r in records
                      if r.get("_old_artifact", r.get("artifact")) != r["artifact"])

    old_counts = Counter(r.get("_old_domain") for r in records)
    new_counts = Counter(r["domain"] for r in records)
    out_counts = Counter(r["_old_domain"] for r in records
                         if r["_old_domain"] != r["domain"])
    in_counts = Counter(r["domain"] for r in records
                        if r["_old_domain"] != r["domain"])
    margins = Counter(int(r.get("domain_margin") or 0) for r in records)

    def pct(n):
        return round(100.0 * n / total, 2) if total else 0.0

    return {
        "total": total,
        "domain_changed": dom_changed,
        "domain_changed_pct": pct(dom_changed),
        "subsystem_changed": sub_changed,
        "subsystem_changed_pct": pct(sub_changed),
        "artifact_changed": art_changed,
        "artifact_changed_pct": pct(art_changed),
        "margin_distribution": {m: margins.get(m, 0) for m in range(10)},
        "per_domain": {
            d: {"stayed": old_counts[d] - out_counts[d],
                "out": out_counts[d], "in": in_counts[d]}
            for d in sorted(set(old_counts) | set(new_counts))
        },
        "top_transitions": {
            facet: dict(c.most_common(15))
            for facet, c in result["transitions"].items()
        },
    }


def print_histogram(report: dict, top_n: int = 15) -> None:
    print(f"\nrecords: {report['total']}")
    print(f"domain churn     : {report['domain_changed']:7d}  ({report['domain_changed_pct']}%)")
    print(f"subsystem churn  : {report['subsystem_changed']:7d}  ({report['subsystem_changed_pct']}%)")
    print(f"artifact churn   : {report['artifact_changed']:7d}  ({report['artifact_changed_pct']}%)")

    print("\nper-domain stayed/out/in:")
    by_new = sorted(report["per_domain"].items(), key=lambda kv: -kv[1]["in"] - kv[1]["stayed"])
    for domain, c in by_new:
        print(f"  {domain:40s} stayed {c['stayed']:7d}  out {c['out']:6d}  in {c['in']:6d}")

    print("\ntop domain transitions:")
    for t, n in sorted(report["top_transitions"].get("domain", {}).items(),
                       key=lambda kv: -kv[1])[:top_n]:
        print(f"  {t:84s} {n:7d}")

    print("\nmargin distribution (0..9):")
    step = max(1, report["total"] // 60)
    for m in range(10):
        n = report["margin_distribution"].get(m, 0)
        print(f"  {m:2d} {n:7d} {'#' * min(60, n // step)}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Re-score Tier-1 labels with taxonomy v2 (W2 §1.3)")
    parser.add_argument("--base-dir", default="web/public")
    parser.add_argument("--dry-run", action="store_true",
                        help="report churn only; write nothing; always exit 0")
    parser.add_argument("--max-churn-pct", type=float, default=20.0,
                        help="fail (exit 2) if domain churn exceeds this without --allow-churn")
    parser.add_argument("--allow-churn", action="store_true",
                        help="write artefacts even when churn exceeds --max-churn-pct")
    parser.add_argument("--report-out", default="",
                        help="write the machine-readable churn report to this path")
    parser.add_argument("--min-stars", type=int, default=500,
                        help="same floor rebuild_catalog applies")
    parser.add_argument("--min-topics-pct", type=float, default=0.0,
                        help="fail (exit 3) if fewer than this %% of records carry topics; "
                             "taxonomy v2 leans on topic evidence (golden set is calibrated "
                             "with topics) so a topicless reclassify must never ship")
    args = parser.parse_args()

    packed_path = os.path.join(args.base_dir, "catalog-packed.json")
    details_dir = os.path.join(args.base_dir, "data", "details")

    print(f"Loading Tier-1 packed index: {packed_path}")
    catalog = load_packed(packed_path)
    print(f"  {len(catalog)} records")
    print("Loading Tier-2 deep shards")
    deep = load_shards(details_dir)
    print(f"  {len(deep)} deep records")
    attached = attach_deep(catalog, deep)
    print(f"  re-attached deep intel to {attached} records")

    # Topic coverage is mission-critical evidence: without stored topics the
    # classifier only sees name + description and the margin rule abstains far
    # more often (local worst-case dry-run: 0% topics -> ~76% Other).
    with_topics = sum(1 for r in catalog.values() if r.get("topics"))
    topics_pct = (100.0 * with_topics / len(catalog)) if catalog else 0.0
    print(f"topics coverage: {with_topics:,}/{len(catalog):,} records ({topics_pct:.1f}%)")

    print("Re-classifying with taxonomy v2 ...")
    result = reclassify_records(catalog)

    records = finalize_records(catalog, args.min_stars, Counter())
    report = build_report(records, result)
    report["topics_coverage_pct"] = round(topics_pct, 2)
    print_histogram(report)

    if args.report_out:
        with open(args.report_out, "w", encoding="utf-8") as fh:
            json.dump(report, fh, indent=2)
        print(f"report written to {args.report_out}")

    if args.min_topics_pct and topics_pct < args.min_topics_pct:
        print(f"FAIL: only {topics_pct:.1f}% of records carry topics "
              f"(< {args.min_topics_pct}%); reclassifying now would abstain on most "
              f"rows. Did rebuild_catalog write topics into the shards?", file=sys.stderr)
        return 3

    if args.dry_run:
        print("[dry run] no files written")
        return 0

    if report["domain_changed_pct"] > args.max_churn_pct and not args.allow_churn:
        print(f"FAIL: domain churn {report['domain_changed_pct']}% exceeds "
              f"--max-churn-pct {args.max_churn_pct}% (re-run with --allow-churn "
              f"to apply deliberately)", file=sys.stderr)
        return 2

    for r in records:
        r.pop("_old_domain", None)
    write_artifacts(records, args.base_dir)
    print("reclassify complete")
    return 0


if __name__ == "__main__":
    sys.exit(main())
