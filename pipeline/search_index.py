"""Pack-time inverted index for ranked search (W3 §2.1 / §2.2).

`write_artifacts` (shared by `rebuild_catalog` and `reclassify_catalog`) calls
`write_search_index`, so both the backfill and reclassify paths regenerate
`web/public/search-index.json` together with the packed rows — ordinals in the
index are positions in the `rows` array, which the UI unpack preserves.

Design (deterministic, zero LLM, gzip-friendly JSON):

* **Tokenizer** — `[^a-z0-9]+` split on the lowered text; `web/src/search-core.mjs`
  implements the identical rule so the client query path and the builder agree.
* **Fields & bits** — bit i of each posting's field mask marks where the token
  occurred: name, owner, subsystem, domain, topics, primitives, compatibility,
  hook (description), language, license.
* **Kept tokens** — df <= N/10 (stop-words like `app` drop out), and either
  df >= 2 or the token appears in some row's name/owner (unique names are exactly
  how people search; `df == 1` body-only tokens are noise).
* **Posting** — flat pairs `[ord0, code0, delta, code, ...]`: the first ordinal is
  absolute, the rest are deltas from the previous one (ascending order, small,
  gzip-friendly). `code = (tf << 10) | field_mask`, tf capped at 7.
* **Weights** — mirrored in `search-core.mjs` as FIELD_WEIGHTS:
  name 5 > owner 4 > subsystem 3 > topics 2.5 > primitives 2 > compatibility 1.5
  > domain 1.5 > hook 1 > language 0.5 > license 0.5.
"""

from __future__ import annotations

import json
import math
import os
import re
from collections import Counter
from typing import Dict, List

TOKEN_RE = re.compile(r"[^a-z0-9]+")

# bit i == FIELDS[i] in the posting field mask; order is load-bearing (mirrored in JS)
FIELDS = ("name", "owner", "subsystem", "domain", "topics", "primitives",
          "compatibility", "hook", "language", "license")
WEIGHTS = (5.0, 4.0, 3.0, 1.5, 2.5, 2.0, 1.5, 1.0, 0.5, 0.5)

MAX_TF = 7          # tf saturates early in BM25-lite; 3 bits is plenty
HOOK_CAP = 400      # chars of description/hook indexed per row


def tokenize(text: str) -> List[str]:
    return [t for t in TOKEN_RE.split((text or "").lower()) if t]


def _doc_fields(rec: dict) -> List[str]:
    hook = (rec.get("description") or rec.get("hook") or "")[:HOOK_CAP]
    return [
        rec.get("name") or "",
        rec.get("owner") or "",
        rec.get("subsystem") or "",
        rec.get("domain") or "",
        " ".join(rec.get("topics") or []),
        " ".join(rec.get("primitives") or []),
        " ".join(rec.get("compatibility") or []),
        hook,
        rec.get("language") or "",
        rec.get("license") or "",
    ]


def build_search_index(records: List[dict]) -> dict:
    """Build the packed inverted index for `records` (row ordinal == list index)."""
    n = len(records)
    # pass 1: per-doc token -> packed (tf << 10 | field bits); name/owner token set
    docs: List[Dict[str, int]] = []
    name_owner_tokens = set()
    for rec in records:
        bits: Dict[str, int] = {}
        for field_idx, text in enumerate(_doc_fields(rec)):
            if not text:
                continue
            flag = 1 << field_idx
            for tok in tokenize(text):
                code = bits.get(tok, 0)
                tf = min(((code >> 10) & 0x7) + 1, MAX_TF)
                bits[tok] = (tf << 10) | (code & 0x3FF) | flag
            if field_idx in (0, 1):  # name / owner
                name_owner_tokens.update(tokenize(text))
        docs.append(bits)

    df = Counter()
    for bits in docs:
        df.update(bits.keys())

    cap = max(1, n // 10)
    keep = {t for t, c in df.items() if c <= cap and (c >= 2 or t in name_owner_tokens)}

    # pass 2: postings in ordinal order with delta-encoded ordinals.
    # `last_ord` tracks each token's previous absolute ordinal — indexing into
    # the flat pair list would read the previous *code*, not the previous ord.
    postings: Dict[str, List[int]] = {t: [] for t in keep}
    last_ord: Dict[str, int] = {}
    for ord_, bits in enumerate(docs):
        for tok, code in bits.items():
            if tok not in keep:
                continue
            lst = postings[tok]
            prev = last_ord.get(tok)
            if prev is None:
                lst.append(ord_)          # first ordinal: absolute
            else:
                lst.append(ord_ - prev)   # subsequent: delta from previous ordinal
            last_ord[tok] = ord_
            lst.append(code)

    tokens = sorted(keep)
    return {
        "n": n,
        "f": list(FIELDS),
        "w": list(WEIGHTS),
        "t": tokens,
        "d": [df[t] for t in tokens],
        "p": [postings[t] for t in tokens],
    }


def query_search_index(index: dict, query: str, stars: List[int]) -> List[tuple]:
    """Python mirror of `web/src/search-core.mjs` (tests assert parity behaviour).

    Returns [(ordinal, score), ...] ranked best-first: field-weighted BM25-lite;
    rows matching MORE query tokens always outrank rows matching fewer, then the
    coverage score bonus, log(stars), and ordinal as tie-breaks (mirrors
    `web/src/search-core.mjs`).
    """
    n = index["n"]
    weights = index["w"]
    token_pos = {t: i for i, t in enumerate(index["t"])}
    lut = [0.0] * (1 << len(index["f"]))
    for mask in range(1, len(lut)):
        low = mask & -mask
        lut[mask] = lut[mask ^ low] + weights[low.bit_length() - 1]

    scores: Dict[int, float] = {}
    matched: Dict[int, int] = {}
    for qt in tokenize(query):
        ti = token_pos.get(qt)
        if ti is None:
            continue
        idf = math.log(1.0 + n / index["d"][ti])
        if idf <= 0:
            continue
        pairs = index["p"][ti]
        if not pairs:
            continue
        pos = 0
        last = -1
        while pos < len(pairs):
            if pos == 0:
                last = pairs[0]
            else:
                last += pairs[pos]
            code = pairs[pos + 1]
            pos += 2
            tf = (code >> 10) & 0x7
            bits = code & 0x3FF
            s = idf * (tf / (1.0 + tf)) * lut[bits]
            scores[last] = scores.get(last, 0.0) + s
            matched[last] = matched.get(last, 0) + 1

    ranked = []
    for ord_, s in scores.items():
        m = matched[ord_]
        final = s * (1.0 + 0.5 * (m - 1))
        star_key = math.log(1.0 + (stars[ord_] if ord_ < len(stars) else 0))
        ranked.append((-m, -final, -star_key, ord_, final))
    ranked.sort()
    return [(r[3], r[4]) for r in ranked]


def write_search_index(records: List[dict], base_dir: str) -> int:
    """Build + write `search-index.json`; returns bytes written."""
    index = build_search_index(records)
    path = os.path.join(base_dir, "search-index.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(index, fh, separators=(",", ":"))
    size = os.path.getsize(path)
    print(f"Search index: {path} ({len(index['t'])} tokens, "
          f"{sum(len(p) // 2 for p in index['p']):,} postings, {size / 1e6:.2f} MB)")
    return size
