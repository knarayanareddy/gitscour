"""Pack-time facet counts for filter chips with live numbers (W3 §2.8).

`write_artifacts` calls `write_facets`, so backfill/reclassify regenerate
`web/public/facets.json` with the rows. Counts are exact (deterministic,
zero LLM) — the UI renders `Name (count)` directly instead of guessing.
"""

from __future__ import annotations

import json
import os
from collections import Counter
from typing import List


def _pairs(counter: Counter, key: str, limit: int = 0, extra=None) -> List[dict]:
    out = []
    for name, count in (counter.most_common(limit) if limit else counter.most_common()):
        item = {"name": name, "count": count}
        if extra:
            item.update(extra(name))
        out.append(item)
    return out


def build_facets(records: List[dict]) -> dict:
    domains = Counter(r.get("domain") or "Other / General" for r in records)
    subsystems = Counter(
        (r.get("subsystem") or "General Components", r.get("domain") or "")
        for r in records
    )
    artifacts = Counter(r.get("artifact") or "Application / Service" for r in records)
    languages = Counter(r.get("language") or "Other" for r in records)
    topics: Counter = Counter()
    primitives: Counter = Counter()
    compatibility: Counter = Counter()
    licenses = Counter(r.get("license") or "Unknown" for r in records)
    for r in records:
        topics.update(r.get("topics") or [])
        primitives.update(r.get("primitives") or [])
        compatibility.update(r.get("compatibility") or [])
    return {
        "total": len(records),
        "domains": _pairs(domains, "domain"),
        "subsystems": [
            {"name": name, "domain": dom, "count": count}
            for (name, dom), count in subsystems.most_common()
        ],
        "artifacts": _pairs(artifacts, "artifact"),
        "languages": _pairs(languages, "language"),
        "topics": _pairs(topics, "topic", limit=60),
        "primitives": _pairs(primitives, "primitive"),
        "compatibility": _pairs(compatibility, "compatibility"),
        "licenses": _pairs(licenses, "license", limit=40),
    }


def write_facets(records: List[dict], base_dir: str) -> int:
    facets = build_facets(records)
    path = os.path.join(base_dir, "facets.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(facets, fh, separators=(",", ":"), sort_keys=False)
    size = os.path.getsize(path)
    print(f"Facets: {path} ({len(facets['domains'])} domains, "
          f"{len(facets['subsystems'])} subsystems, {len(facets['topics'])} topics, "
          f"{size / 1e6:.2f} MB)")
    return size
