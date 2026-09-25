"""Pack-time kNN neighbour edges for the graph + "Similar repositories" (W3 §2.4).

`write_artifacts` calls `write_edges`, so backfill and reclassify regenerate
`web/public/edges.json` alongside the rows (ordinals == `rows[]` positions).

Algorithm (deterministic, zero LLM):

* **Evidence** per row: topics set (weight 3), primitives set (2), compatibility
  set (1), subsystem (1.5 — but any pair where either side's subsystem starts
  with `General` gets 0 subsystem weight: the General* fallback buckets are 74%
  of the v1 labels and would otherwise clique thousands of rows together).
* **Candidate generation** without O(N²): inverted lists per evidence value.
  Values seen in more than ``MAX_FEAT_DF`` rows are skipped during candidate
  generation (too common to be informative — `python` has 30k rows) but still
  count when *scoring* a candidate pair.
* **Score** = weighted Jaccard over the four evidence groups; top-K (K=8) kept,
  tie-broken by ordinal.
* **Fallback**: rows whose evidence yields no (or too few) neighbours are joined
  to their ordinal-window neighbours (i±1..i±8) at a fixed 0.1 weight, so every
  node has >= 1 edge and the graph stays connected across the catalog order.

`edges[i]` = ``[[neighbor_ord, weight], ...]`` (weight rounded to 2 decimals).
Reason strings are derived at render time from the shared sets — not stored.
"""

from __future__ import annotations

import json
import os
from collections import Counter, defaultdict
from typing import Dict, List, Set, Tuple

K = 8
MAX_FEAT_DF = 1500      # candidate-generation skip threshold for common values
CAND_CAP = 64           # candidates pre-scored per row (by shared-feature count)
WINDOW = 8              # ordinal-window fallback half-width
FALLBACK_WEIGHT = 0.1

GROUP_WEIGHTS = {"topics": 3.0, "primitives": 2.0, "compatibility": 1.0,
                 "subsystem": 1.5, "language": 1.0, "artifact": 1.0}


def _is_general(subsystem: str) -> bool:
    return subsystem.startswith("General")


def _evidence(rec: dict):
    topics = set(rec.get("topics") or [])
    primitives = set(rec.get("primitives") or [])
    compat = set(rec.get("compatibility") or [])
    subsystem = rec.get("subsystem") or ""
    language = rec.get("language") or ""
    artifact = rec.get("artifact") or ""
    return topics, primitives, compat, subsystem, language, artifact


def build_edges(records: List[dict]) -> dict:
    n = len(records)
    ev = [_evidence(r) for r in records]

    # ---- candidate generation: value -> row ordinals (only values with df <= cap)
    lists: Dict[str, List[int]] = defaultdict(list)
    for i, (topics, primitives, compat, subsystem, language, artifact) in enumerate(ev):
        for v in topics:
            lists[f"t:{v}"].append(i)
        for v in primitives:
            lists[f"p:{v}"].append(i)
        for v in compat:
            lists[f"c:{v}"].append(i)
        if subsystem and not _is_general(subsystem):
            lists[f"s:{subsystem}"].append(i)
        if language and language != "Other":
            lists[f"l:{language}"].append(i)
        if artifact:
            lists[f"a:{artifact}"].append(i)

    # Per-row candidate counting: same shared-feature scores as the classic
    # inverted-index pair materialization, but only ever holds ONE row's count
    # dict (the eager version OOM'd at this catalog size: a single 4k-value
    # list expands to millions of pair entries held simultaneously).
    feat_keys: List[List[str]] = []
    for topics, primitives, compat, subsystem, language, artifact in ev:
        keys = [f"t:{v}" for v in sorted(topics)]
        keys += [f"p:{v}" for v in sorted(primitives)]
        keys += [f"c:{v}" for v in sorted(compat)]
        if subsystem and not _is_general(subsystem):
            keys.append(f"s:{subsystem}")
        if language and language != "Other":
            keys.append(f"l:{language}")
        if artifact:
            keys.append(f"a:{artifact}")
        feat_keys.append(keys)

    pairs_by_row: List[Dict[int, int]] = [dict() for _ in range(n)]
    for i in range(n):
        counts: Dict[int, int] = {}
        for key in feat_keys[i]:
            ords = lists.get(key)
            if not ords or len(ords) > MAX_FEAT_DF:
                continue
            for j in ords:
                if j != i:
                    counts[j] = counts.get(j, 0) + 1
        if counts:
            top = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:CAND_CAP]
            pairs_by_row[i] = dict(top)

    # ---- score candidates (weighted Jaccard over the four groups)
    edges: List[List[List[float]]] = []
    fallback_edges = 0
    bucket_counter: Counter = Counter()
    for i in range(n):
        ti, pi, ci, si, li, ai = ev[i]
        cands = pairs_by_row[i]
        if cands:
            # pre-cap: strongest shared-feature counts first, deterministic
            top = sorted(cands.items(), key=lambda kv: (-kv[1], kv[0]))[:CAND_CAP]
            scored = []
            for j, _shared in top:
                tj, pj, cj, sj, lj, aj = ev[j]
                num = den = 0.0
                for w, a, b in ((GROUP_WEIGHTS["topics"], ti, tj),
                                (GROUP_WEIGHTS["primitives"], pi, pj),
                                (GROUP_WEIGHTS["compatibility"], ci, cj)):
                    if a or b:
                        inter = len(a & b)
                        num += w * inter
                        den += w * (len(a) + len(b) - inter)
                if si and sj and not _is_general(si) and not _is_general(sj):
                    inter = 1 if si == sj else 0
                    w = GROUP_WEIGHTS["subsystem"]
                    num += w * inter
                    den += w * (2 - inter)
                for w, a, b in ((GROUP_WEIGHTS["language"], li, lj),
                                (GROUP_WEIGHTS["artifact"], ai, aj)):
                    if a and b:
                        inter = 1 if a == b else 0
                        num += w * inter
                        den += w * (2 - inter)
                if den <= 0:
                    continue
                score = num / den
                if score > 0:
                    scored.append((j, score))
            scored.sort(key=lambda x: (-x[1], x[0]))
            picked = [(j, round(s, 2)) for j, s in scored[:K] if s >= 0.05]
        else:
            picked = []
        # ---- ordinal-window fallback: guarantees >= 1 edge, skips General* clique
        if len(picked) < K:
            have = {j for j, _ in picked}
            for j in range(max(0, i - WINDOW), min(n, i + WINDOW + 1)):
                if j == i or j in have:
                    continue
                picked.append((j, FALLBACK_WEIGHT))
                have.add(j)
                fallback_edges += 1
                if len(picked) >= K:
                    break
        edges.append(picked)
        for j, _w in picked:
            bucket_counter[ev[j][3] or "General Components"] += 1

    total_edges = sum(len(e) for e in edges)
    top_bucket, top_n = (bucket_counter.most_common(1) or [("?", 0)])[0]
    report = {
        "n": n,
        "k": K,
        "total_edges": total_edges,
        "rows_no_evidence": sum(1 for t, p, c, s, l, a in ev
                                if not (t or p or c or (s and not _is_general(s)) or l or a)),
        "fallback_edges": fallback_edges,
        "fallback_pct": round(100.0 * fallback_edges / max(1, total_edges), 2),
        "min_degree": min(len(e) for e in edges) if edges else 0,
        "top_bucket": {"subsystem": top_bucket, "edges": top_n,
                       "pct": round(100.0 * top_n / max(1, total_edges), 2)},
    }
    return {"k": K, "edges": edges, "report": report}


def write_edges(records: List[dict], base_dir: str) -> dict:
    data = build_edges(records)
    path = os.path.join(base_dir, "edges.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump({"k": data["k"], "edges": data["edges"]}, fh, separators=(",", ":"))
    size = os.path.getsize(path)
    r = data["report"]
    print(f"Edges: {path} ({r['total_edges']:,} edges, min degree {r['min_degree']}, "
          f"fallback {r['fallback_pct']}%, top bucket {r['top_bucket']['pct']}% "
          f"({r['top_bucket']['subsystem']}), {size / 1e6:.2f} MB)")
    return {"bytes": size, **r}
