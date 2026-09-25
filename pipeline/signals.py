"""Pack-time Signal score (W4 §3.4) — arithmetic anyone can audit.

`write_artifacts` writes `payload["signal"]`, one 0..100 integer per row
(aligned with `rows`, like `activity` / `license_tiers`). The formula is
documented in README.md and pinned by tests/test_signal.py:

    signal = round(45 * stars_pct + 25 * push_recency + 20 * fork_ratio_pct
                   + 10 * has_release)

Term definitions (all deterministic, zero LLM):

* ``stars_pct``       — percentile rank of the row's stars among all rows
                        (stars-desc storage: row i of N gets (N-i)/N).
* ``push_recency``    — ``exp(-age_days / 548)`` over the packed
                        ``activity`` push epoch (2-year decay); rows without
                        push data score 0.5 — unknown, never assumed dead
                        (same rule as maturity v2).
* ``fork_ratio_pct``  — percentile rank of the fork/stars ratio (forks+1)/(stars+1).
* ``has_release``     — 1 when the curated quickstart carries a real install
                        command (pip/npm/cargo/go/brew/apt/docker/gem/helm/
                        kubectl), 0 for the default ``git clone`` stub.
"""

from __future__ import annotations

import math
from typing import Dict, List, Optional

WEIGHTS = {"stars_pct": 45.0, "push_recency": 25.0, "fork_ratio_pct": 20.0, "has_release": 10.0}
RECENCY_HALF_LIFE_DAYS = 548.0  # exp decay scale (~2 years)
UNKNOWN_RECENCY = 0.5           # neutral: missing data is not "dead"

INSTALL_RE = __import__("re").compile(
    r"\b(pip3? install|npm (?:install|ci|i )|yarn add|pnpm add|cargo install|go get|"
    r"brew install|apt(-get)? install|gem install|helm install|kubectl apply|"
    r"docker (?:pull|run)|composer require|conda install|poetry install)\b",
    __import__("re").IGNORECASE,
)


def has_release(quickstart_code: Optional[str]) -> int:
    """1 when the quickstart shows a real install/release command."""
    if not quickstart_code or not isinstance(quickstart_code, str):
        return 0
    return 1 if INSTALL_RE.search(quickstart_code) else 0


def _percentiles(values: List[float]) -> List[float]:
    """Rank-based percentile in [1/N, 1] — ties share the average rank."""
    n = len(values)
    order = sorted(range(n), key=lambda i: values[i])
    pct = [0.0] * n
    i = 0
    while i < n:
        j = i
        while j + 1 < n and values[order[j + 1]] == values[order[i]]:
            j += 1
        avg_rank = (i + j) / 2.0  # 0-based
        for k in range(i, j + 1):
            pct[order[k]] = (avg_rank + 1.0) / n
        i = j + 1
    return pct


def build_signals(records: List[dict], activity: List[list], now_ts: int) -> List[int]:
    """One 0..100 integer per record (aligned with rows/activity)."""
    n = len(records)
    if n == 0:
        return []
    stars = [float(r.get("stars") or 0) for r in records]
    fork_ratio = [
        (float(r.get("forks") or 0) + 1.0) / (s + 1.0) for r, s in zip(records, stars)
    ]
    stars_pct = _percentiles(stars)
    fork_pct = _percentiles(fork_ratio)

    out: List[int] = []
    for i, rec in enumerate(records):
        act = activity[i] if i < len(activity) else None
        pushed = act[1] if (isinstance(act, list) and len(act) > 1) else None
        if pushed:
            age_days = max(0.0, (now_ts - int(pushed)) / 86400.0)
            recency = math.exp(-age_days / RECENCY_HALF_LIFE_DAYS)
        else:
            recency = UNKNOWN_RECENCY
        signal = (
            WEIGHTS["stars_pct"] * stars_pct[i]
            + WEIGHTS["push_recency"] * recency
            + WEIGHTS["fork_ratio_pct"] * fork_pct[i]
            + WEIGHTS["has_release"] * has_release(rec.get("quickstart_code"))
        )
        out.append(int(round(min(100.0, max(0.0, signal)))))
    return out


def signal_breakdown(record: dict, activity_row: Optional[list], now_ts: int,
                     stars_pct: float, fork_pct: float) -> Dict[str, float]:
    """Auditable per-row term contributions (used by tests and future UI)."""
    act = activity_row
    pushed = act[1] if (isinstance(act, list) and len(act) > 1) else None
    recency = (math.exp(-max(0.0, (now_ts - int(pushed)) / 86400.0) / RECENCY_HALF_LIFE_DAYS)
               if pushed else UNKNOWN_RECENCY)
    return {
        "stars_pct": WEIGHTS["stars_pct"] * stars_pct,
        "push_recency": WEIGHTS["push_recency"] * recency,
        "fork_ratio_pct": WEIGHTS["fork_ratio_pct"] * fork_pct,
        "has_release": WEIGHTS["has_release"] * has_release(record.get("quickstart_code")),
    }
