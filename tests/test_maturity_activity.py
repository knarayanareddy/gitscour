"""W3 §2.6 — maturity v2 and pack-time activity (zero LLM, deterministic)."""

import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "pipeline"))

from rebuild_catalog import (  # noqa: E402
    FABRICATED_PUSHED_AT,
    build_activity,
    real_pushed_at,
)
from taxonomy_engine import classify_maturity  # noqa: E402


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


NOW = datetime.now(timezone.utc)
RECENT = iso(NOW - timedelta(days=40))
OLD = iso(NOW - timedelta(days=6 * 365))


class MaturityV2Test(unittest.TestCase):
    def test_recent_popular_with_forks_is_battle_tested(self):
        m = classify_maturity(25000, 3000, RECENT)
        self.assertEqual(m["rating"], "Production Battle-Tested")
        self.assertEqual(m["level"], "tier-2")

    def test_low_fork_viral_repo_demoted(self):
        m = classify_maturity(25000, 120, RECENT)
        self.assertNotEqual(m["rating"], "Production Battle-Tested")
        self.assertEqual(m["level"], "tier-3")
        self.assertIn("fork", m["desc"].lower())

    def test_long_dormant_never_battle_tested(self):
        # the pre-v2 bug: a 10-year-dormant 25k-star repo claimed production
        m = classify_maturity(25000, 3000, OLD)
        self.assertIn("Dormant Legacy", m["rating"])
        self.assertEqual(m["level"], "tier-4")

    def test_unknown_push_date_is_not_dormant(self):
        # missing data must not be assumed dead — stars path still applies
        m = classify_maturity(25000, 3000, None)
        self.assertEqual(m["rating"], "Production Battle-Tested")

    def test_parsable_junk_date_is_not_dormant(self):
        m = classify_maturity(25000, 3000, "not-a-date")
        self.assertEqual(m["rating"], "Production Battle-Tested")

    def test_mid_tier_unchanged(self):
        self.assertEqual(classify_maturity(7000, 400, RECENT)["level"], "tier-3")
        self.assertEqual(classify_maturity(600, 10, RECENT)["level"], "tier-4")


class ActivityTest(unittest.TestCase):
    def test_sentinel_treated_as_missing(self):
        self.assertIsNone(real_pushed_at({"pushed_at": FABRICATED_PUSHED_AT}))
        self.assertIsNone(real_pushed_at({}))
        self.assertEqual(real_pushed_at({"pushed_at": "2024-01-02T00:00:00Z"}),
                         "2024-01-02T00:00:00Z")

    def test_build_activity_statuses(self):
        now_ts = int(NOW.timestamp())
        records = [
            {"pushed_at": iso(NOW - timedelta(days=10))},          # active
            {"pushed_at": iso(NOW - timedelta(days=900))},         # idle
            {"pushed_at": FABRICATED_PUSHED_AT},                   # sentinel -> unknown
            {"pushed_at": RECENT, "is_archived": True},            # archived wins
            {},                                                    # unknown
        ]
        act = build_activity(records, now_ts)
        self.assertEqual([a[0] for a in act],
                         ["active", "idle", None, "archived", None])
        self.assertIsNotNone(act[0][1])
        self.assertIsNone(act[2][1])
        self.assertIsNone(act[4][1])
        # aligned with records order for row-index joins
        self.assertEqual(len(act), len(records))

    def test_build_activity_deterministic_within_run(self):
        now_ts = 1_700_000_000
        records = [{"pushed_at": "2023-05-04T10:00:00Z"}]
        self.assertEqual(build_activity(records, now_ts), build_activity(records, now_ts))


if __name__ == "__main__":
    unittest.main()
