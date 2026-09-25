"""W4 §3.4 — Signal score: bounds, monotonicity, term behaviour, determinism.

The formula lives in pipeline/signals.py and is documented in README.md:
    signal = round(45*stars_pct + 25*push_recency + 20*fork_ratio_pct + 10*has_release)
"""

import math
import random
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from signals import (  # noqa: E402
    RECENCY_HALF_LIFE_DAYS,
    UNKNOWN_RECENCY,
    WEIGHTS,
    _percentiles,
    build_signals,
    has_release,
    signal_breakdown,
)


def _rec(stars=1000, forks=10, quickstart="git clone https://example.com/x.git"):
    return {"name": "x", "stars": stars, "forks": forks, "quickstart_code": quickstart}


NOW = 1_700_000_000


class TestFormulaTerms(unittest.TestCase):
    def test_weights_sum_to_100(self):
        self.assertAlmostEqual(sum(WEIGHTS.values()), 100.0)

    def test_percentiles_bounds_and_spread(self):
        pct = _percentiles([3.0, 1.0, 2.0])
        self.assertTrue(all(0 < p <= 1 for p in pct))
        self.assertLess(pct[1], pct[2])   # lowest value -> lowest percentile
        self.assertLess(pct[2], pct[0])

    def test_percentile_ties_share_rank(self):
        pct = _percentiles([5.0, 5.0])
        self.assertEqual(pct[0], pct[1])

    def test_has_release_install_commands(self):
        self.assertEqual(has_release("pip install foxglove"), 1)
        self.assertEqual(has_release("npm install -g kubernetes"), 1)
        self.assertEqual(has_release("cargo install ripgrep"), 1)
        self.assertEqual(has_release("git clone https://github.com/a/b.git"), 0)
        self.assertEqual(has_release(None), 0)

    def test_recency_decay_shape(self):
        fresh = build_signals([_rec()], [[0, NOW - 30 * 86400, None]], NOW)[0]
        stale = build_signals([_rec()], [[0, NOW - 1000 * 86400, None]], NOW)[0]
        unknown = build_signals([_rec()], [[0, None, None]], NOW)[0]
        self.assertGreater(fresh, stale)
        # unknown maps to the neutral 0.5 -> matches a push of 548*ln2 days
        mid = build_signals([_rec()],
                            [[0, NOW - int(RECENCY_HALF_LIFE_DAYS * math.log(2) * 86400), None]],
                            NOW)[0]
        self.assertEqual(unknown, mid)

    def test_breakdown_sums_to_score(self):
        rec = _rec(stars=5000, quickstart="npm install thing")
        act = [0, NOW - 100 * 86400, None]
        b = signal_breakdown(rec, act, NOW, stars_pct=0.8, fork_pct=0.7)
        self.assertAlmostEqual(sum(b.values()), 45 * 0.8 + 25 * math.exp(-100 / 548)
                               + 20 * 0.7 + 10, places=6)


class TestBuildSignals(unittest.TestCase):
    def _rows(self, n=40, seed=7):
        rng = random.Random(seed)
        recs, acts = [], []
        for i in range(n):
            stars = rng.randint(10, 500000)
            recs.append(_rec(stars=stars, forks=rng.randint(0, stars // 10 + 1),
                             quickstart=("pip install x" if i % 3 == 0 else "git clone y")))
            age = rng.randint(0, 3000)
            acts.append([0, NOW - age * 86400, None])
        return recs, acts

    def test_bounds(self):
        recs, acts = self._rows()
        out = build_signals(recs, acts, NOW)
        self.assertEqual(len(out), len(recs))
        self.assertTrue(all(isinstance(v, int) and 0 <= v <= 100 for v in out))

    def test_monotonic_in_stars(self):
        # identical except stars: the richer row must not score lower
        low = build_signals([_rec(stars=1000)], [[0, NOW - 400 * 86400, None]], NOW)[0]
        high = build_signals([_rec(stars=200000)], [[0, NOW - 400 * 86400, None]], NOW)[0]
        self.assertGreaterEqual(high, low)

    def test_monotonic_in_recency(self):
        a = build_signals([_rec()], [[0, NOW - 2000 * 86400, None]], NOW)[0]
        b = build_signals([_rec()], [[0, NOW - 10 * 86400, None]], NOW)[0]
        self.assertGreater(b, a)

    def test_install_bonus(self):
        clone = build_signals([_rec(quickstart="git clone z")], [[0, NOW - 50 * 86400, None]], NOW)[0]
        pip = build_signals([_rec(quickstart="pip install z")], [[0, NOW - 50 * 86400, None]], NOW)[0]
        self.assertEqual(pip - clone, 10)

    def test_deterministic(self):
        recs, acts = self._rows(30)
        self.assertEqual(build_signals(recs, acts, NOW), build_signals(recs, acts, NOW))

    def test_empty(self):
        self.assertEqual(build_signals([], [], NOW), [])

    def test_single_row_max_or_near_max(self):
        # with only itself, percentiles are 1.0; fresh push + install = 100
        out = build_signals([_rec(quickstart="npm i x")], [[0, NOW, None]], NOW)
        self.assertEqual(out[0], 100)


if __name__ == "__main__":
    unittest.main()
