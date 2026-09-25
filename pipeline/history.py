"""W4 §3.2/§3.3 — star-delta history snapshots and the changelog diff.

Every Tier-1 rebuild writes ``web/public/history/<date>-stars.json`` (a
baseline of ``owner/name -> stars``) and diffs the two most recent snapshots
into ``web/public/changelog.json``:

* first-ever snapshot  -> changelog carries an empty ``top_movers`` plus a
  ``note`` naming the baseline (honest empty state, no fabricated deltas);
* later rebuilds       -> added / removed / top_movers (|delta| order) with
  stars, language and domain joined from the CURRENT packed rows.

All arithmetic is deterministic; zero LLM.
"""

from __future__ import annotations

import json
import os
from datetime import date
from typing import Dict, List, Optional, Tuple

HISTORY_DIR = "history"
SNAPSHOT_SUFFIX = "-stars.json"
# UI/PR bodies show the head of the list; the changelog stores a bounded top.
TOP_MOVERS = 100
MIN_MOVERS_STARS = 500  # rows below this (legacy tier) never appear as movers


def snapshot_path(base_dir: str, day: str) -> str:
    return os.path.join(base_dir, HISTORY_DIR, f"{day}{SNAPSHOT_SUFFIX}")


def build_snapshot(records: List[dict], day: str) -> dict:
    """Baseline of stars for one pack date. Row order = catalog order."""
    return {
        "date": day,
        "count": len(records),
        "names": [f"{r.get('owner')}/{r.get('name')}" for r in records],
        "stars": [int(r.get("stars") or 0) for r in records],
    }


def load_snapshots(base_dir: str) -> List[Tuple[str, dict]]:
    """All snapshots sorted by date ascending (filename stem = ISO date)."""
    hist = os.path.join(base_dir, HISTORY_DIR)
    out = []
    if not os.path.isdir(hist):
        return out
    for fname in sorted(os.listdir(hist)):
        if not fname.endswith(SNAPSHOT_SUFFIX):
            continue
        day = fname[: -len(SNAPSHOT_SUFFIX)]
        try:
            with open(os.path.join(hist, fname), "r", encoding="utf-8") as fh:
                out.append((day, json.load(fh)))
        except (OSError, ValueError):
            continue
    out.sort(key=lambda kv: kv[0])
    return out


def _map(snap: dict) -> Dict[str, int]:
    return dict(zip(snap.get("names", []), snap.get("stars", [])))


def diff_snapshots(old: dict, new: dict, meta: Dict[str, dict],
                   old_date: str, new_date: str,
                   history: Optional[List[Tuple[str, Dict[str, int]]]] = None) -> dict:
    """added/removed/top_movers between two snapshots.

    ``meta`` maps full_name -> {stars, language, domain} from the CURRENT
    packed rows; movers not in the current catalog use snapshot stars and
    null taxonomy (still listed — they existed in history).

    ``history`` (optional) is every snapshot as (date, name->stars); when
    given, each mover carries ``series: [[date, stars], ...]`` for the modal
    sparkline (W4 §3.2).
    """
    o, n = _map(old), _map(new)
    added = [k for k in n if k not in o]
    removed = [k for k in o if k not in n]

    def entry(name: str, stars: int) -> dict:
        m = meta.get(name) or {}
        return {
            "full_name": name,
            "stars": stars,
            "language": m.get("language"),
            "domain": m.get("domain"),
        }

    movers = []
    for name, to in n.items():
        frm = o.get(name)
        if frm is None:
            continue
        delta = to - frm
        if delta == 0:
            continue
        if max(to, frm) < MIN_MOVERS_STARS:
            continue
        pct = (delta / frm * 100.0) if frm > 0 else 100.0
        row = entry(name, to)
        row.update({
            "from": frm,
            "to": to,
            "delta": delta,
            "pct": round(pct, 1),
        })
        if history:
            maps = [(d, _map(m)) for d, m in history]
            row["series"] = [[d, mp[name]] for d, mp in maps if name in mp]
        movers.append(row)
    movers.sort(key=lambda r: (-abs(r["delta"]), r["full_name"]))

    return {
        "period": {"from": old_date, "to": new_date},
        "added": sorted((entry(k, n[k]) for k in added),
                        key=lambda r: -r["stars"])[:TOP_MOVERS],
        "removed": sorted((entry(k, o[k]) for k in removed),
                          key=lambda r: -r["stars"])[:TOP_MOVERS],
        "added_count": len(added),
        "removed_count": len(removed),
        "top_movers": movers[:TOP_MOVERS],
        "mover_count": len(movers),
    }


def build_changelog(snapshots: List[Tuple[str, dict]], meta: Dict[str, dict],
                    generated: str) -> dict:
    if len(snapshots) < 2:
        seeded = snapshots[-1][0] if snapshots else None
        return {
            "generated": generated,
            "period": None,
            "added": [], "removed": [],
            "added_count": 0, "removed_count": 0,
            "top_movers": [], "mover_count": 0,
            "note": (f"Baseline star snapshot seeded on {seeded}; the next "
                     f"monthly backfill diffs it into the first movers list."
                     if seeded else "No star snapshots yet."),
        }
    (old_date, old), (new_date, new) = snapshots[-2], snapshots[-1]
    out = diff_snapshots(old, new, meta, old_date, new_date, history=snapshots)
    out["generated"] = generated
    out["note"] = None
    return out


def write_history(base_dir: str, records: List[dict], today: Optional[str] = None) -> dict:
    """Snapshot today's stars, regenerate changelog.json, return the changelog.

    Same-day re-runs overwrite the snapshot with identical bytes (stars do not
    change within a pack), keeping the tree deterministic.
    """
    day = today or date.today().isoformat()
    hist = os.path.join(base_dir, HISTORY_DIR)
    os.makedirs(hist, exist_ok=True)

    snap = build_snapshot(records, day)
    path = snapshot_path(base_dir, day)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(snap, fh, ensure_ascii=False, separators=(",", ":"), sort_keys=False)
        fh.write("\n")

    snapshots = load_snapshots(base_dir)
    meta = {
        f"{r.get('owner')}/{r.get('name')}": {
            "stars": int(r.get("stars") or 0),
            "language": r.get("language"),
            "domain": r.get("domain"),
        }
        for r in records
    }
    changelog = build_changelog(snapshots, meta, day)
    with open(os.path.join(base_dir, "changelog.json"), "w", encoding="utf-8") as fh:
        json.dump(changelog, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    return changelog
