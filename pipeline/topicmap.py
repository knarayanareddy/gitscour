"""Pack-time topic co-occurrence map for the Ecosystems tab (W4 §3.5).

`write_artifacts` calls `write_topic_map`, so backfill/reclassify regenerate
`web/public/topic-map.json` alongside the rows. Zero LLM: pure counting over
the Tier-2 topics already stored in the catalog (they land with the backfill;
local trees legitimately produce an empty map until then — the UI shows an
honest empty state).

Shape (deterministic, sorted everywhere):

    {
      "min_count": 25,          # topic df floor to enter the map
      "min_pair": 10,           # co-occurrence floor for an edge
      "topics": [{"name", "count", "edges": [[other, count], ...]}, ...],
      "pairs_considered": N
    }

`topics` is sorted by (-df, name); each topic's `edges` by (-count, name) and
capped at TOP_EDGES — so byte-identical inputs give byte-identical files.
"""

from __future__ import annotations

import json
import os
from collections import Counter, defaultdict
from typing import Dict, List, Tuple

MIN_TOPIC_DF = 25
MIN_PAIR_COUNT = 10
TOP_EDGES = 10


def build_topic_map(records: List[dict],
                    min_count: int = MIN_TOPIC_DF,
                    min_pair: int = MIN_PAIR_COUNT) -> dict:
    df: Counter = Counter()
    pairs: Counter = Counter()
    for rec in records:
        topics = sorted(set(rec.get("topics") or []))
        for t in topics:
            df[t] += 1
        for i, a in enumerate(topics):
            for b in topics[i + 1:]:
                pairs[(a, b)] += 1

    kept = {t for t, c in df.items() if c >= min_count}
    edges: Dict[str, List[Tuple[str, int]]] = defaultdict(list)
    for (a, b), c in pairs.items():
        if a in kept and b in kept and c >= min_pair:
            edges[a].append((b, c))
            edges[b].append((a, c))

    out_topics = []
    for name in sorted(kept, key=lambda t: (-df[t], t)):
        top = sorted(edges.get(name, []), key=lambda x: (-x[1], x[0]))[:TOP_EDGES]
        out_topics.append({
            "name": name,
            "count": df[name],
            "edges": [[other, c] for other, c in top],
        })
    return {
        "min_count": min_count,
        "min_pair": min_pair,
        "topics": out_topics,
        "pairs_considered": len(pairs),
    }


def write_topic_map(records: List[dict], base_dir: str) -> int:
    """Build + write `topic-map.json`; returns bytes written."""
    data = build_topic_map(records)
    path = os.path.join(base_dir, "topic-map.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, separators=(",", ":"))
    size = os.path.getsize(path)
    n_edges = sum(len(t["edges"]) for t in data["topics"])
    print(f"Topic map: {path} ({len(data['topics'])} topics, {n_edges} edges, "
          f"{size / 1e6:.2f} MB)")
    return size
