"""Line-oriented JSON writers for the big catalog artefacts (W5 O.3).

Why: the pack-time artefacts used to be *single-line* JSON, so every backfill
rewrote ~341 MB of un-diffable blobs into git — a one-row change produced a
full-file replacement in history.  The same bytes are now written with array
elements and object entries on their own lines, which keeps the file valid
JSON (every reader — `json.load`, `JSON.parse`, the smoke test, verify_catalog
— is untouched) while giving git real, row-granular deltas.

Layout rules (all deterministic — output depends only on input order):

  * top-level array   -> one compact element per line
    (tier-1 index rows, edge lists);
  * top-level object  -> one ``"key": <value>`` entry per line, where a
    *list* value keeps one element per line (packed ``rows``, ``signal``,
    search postings per token, ...) and any other value stays compact and
    inline (id-keyed shard records stay one record per line);
  * everything is emitted with the same compact separators and ASCII
    escaping as the previous ``json.dump(..., separators=(",", ":"))`` calls,
    plus a trailing newline (friendlier for line-based tools).

Byte-determinism: ``dumps(x) == dumps(x)`` for equal inputs, and rebuilding
the same records twice yields identical files (pinned in
tests/test_linejson.py).  Zero-LLM: pure stdlib formatting.
"""

from __future__ import annotations

import json

SEPARATORS = (",", ":")


def dumps(value) -> str:
    """Serialize `value` line-oriented; result parses back to `value`."""
    if isinstance(value, list):
        if not value:
            return "[]"
        return "[\n" + ",\n".join(
            json.dumps(item, separators=SEPARATORS) for item in value
        ) + "\n]"
    if isinstance(value, dict):
        if not value:
            return "{}"
        parts = []
        for key, val in value.items():
            # json.dump stringifies scalar object keys (Tier-2 shards are
            # keyed by int repo ids); mirror that here — a raw int would
            # emit an unquoted key and break every parser.
            enc_key = json.dumps(str(key), separators=SEPARATORS)
            if isinstance(val, list):
                parts.append(f"{enc_key}: {dumps(val)}")
            else:
                # dicts (id-keyed shards, label maps) and scalars stay inline:
                # one record / one map per line.
                parts.append(f"{enc_key}: {json.dumps(val, separators=SEPARATORS)}")
        return "{\n" + ",\n".join(parts) + "\n}"
    return json.dumps(value, separators=SEPARATORS)


def write(path: str, value) -> int:
    """Write `value` to `path` line-oriented with a trailing newline.

    Returns bytes written.
    """
    text = dumps(value) + "\n"
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
    return len(text.encode("utf-8"))
