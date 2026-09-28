"""W4 §3.2/§3.3 — snapshot diffs: added/removed/movers, ordering, empty state."""

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from history import (  # noqa: E402
    TOP_MOVERS,
    build_changelog,
    build_snapshot,
    diff_snapshots,
    load_snapshots,
    write_history,
)


def _rec(name, stars, language="Go", domain="Databases & Storage"):
    owner, repo = name.split("/")
    return {"owner": owner, "name": repo, "stars": stars,
            "language": language, "domain": domain}


META = {
    "a/alpha": {"stars": 9000, "language": "Go", "domain": "X"},
    "b/beta": {"stars": 1000, "language": "Rust", "domain": "Y"},
    "c/gamma": {"stars": 700, "language": "C", "domain": "Z"},
    "d/new": {"stars": 600, "language": "Py", "domain": "W"},
    "e/old": {"stars": 550, "language": "JS", "domain": "V"},
}


def _snap(day, stars):
    names = list(stars)
    return (day, {"date": day, "count": len(names), "names": names,
                  "stars": [stars[n] for n in names]})


class TestDiffSnapshots(unittest.TestCase):
    def test_added_removed_and_movers(self):
        old = {k: 100 for k in META if k != "d/new"}
        new = dict(old)
        new["a/alpha"] = 9000        # +8900 -> top mover
        new["b/beta"] = 800          # -200
        new["d/new"] = 600           # added
        del new["e/old"]             # removed
        out = diff_snapshots(_snap("2026-08-01", old)[1], _snap("2026-09-01", new)[1],
                             META, "2026-08-01", "2026-09-01")
        self.assertEqual(out["added_count"], 1)
        self.assertEqual(out["added"][0]["full_name"], "d/new")
        self.assertEqual(out["removed_count"], 1)
        self.assertEqual(out["removed"][0]["full_name"], "e/old")
        names = [m["full_name"] for m in out["top_movers"]]
        self.assertIn("a/alpha", names)
        self.assertIn("b/beta", names)
        # |delta| ordering
        deltas = [abs(m["delta"]) for m in out["top_movers"]]
        self.assertEqual(deltas, sorted(deltas, reverse=True))
        alpha = next(m for m in out["top_movers"] if m["full_name"] == "a/alpha")
        self.assertEqual(alpha["delta"], 8900)
        self.assertEqual(alpha["from"], 100)
        self.assertEqual(alpha["language"], "Go")

    def test_zero_delta_rows_never_appear(self):
        old = {"a/alpha": 9000, "c/gamma": 700}
        new = {"a/alpha": 9000, "c/gamma": 700}  # nothing moved
        out = diff_snapshots(_snap("o", old)[1], _snap("n", new)[1],
                             META, "o", "n")
        self.assertEqual(out["mover_count"], 0)
        # any non-zero delta counts (documented: no minimum-delta threshold)
        new["c/gamma"] = 701
        out = diff_snapshots(_snap("o", old)[1], _snap("n", new)[1],
                             META, "o", "n")
        self.assertEqual(out["mover_count"], 1)

    def test_tiny_rows_excluded_but_tier_crossing_counts(self):
        old = {"x/tiny": 300, "y/rising": 450, "a/alpha": 9000}
        new = {"x/tiny": 400, "y/rising": 4000, "a/alpha": 9100}
        # x/tiny: both sides < 500 -> noise, excluded
        # y/rising: lands >= 500 -> a genuine riser, included
        out = diff_snapshots(_snap("o", old)[1], _snap("n", new)[1],
                             META, "o", "n")
        names = [m["full_name"] for m in out["top_movers"]]
        self.assertEqual(names, ["y/rising", "a/alpha"])

    def test_movers_capped(self):
        stars_old = {f"r/{i:04d}": 600 for i in range(TOP_MOVERS + 20)}
        stars_new = {k: v + i + 1 for i, (k, v) in enumerate(stars_old.items())}
        out = diff_snapshots(_snap("o", stars_old)[1], _snap("n", stars_new)[1],
                             {}, "o", "n")
        self.assertEqual(len(out["top_movers"]), TOP_MOVERS)
        self.assertEqual(out["mover_count"], TOP_MOVERS + 20)

    def test_mover_series_across_snapshots(self):
        hist = [_snap("2026-07-01", {"a/alpha": 100}),
                _snap("2026-08-01", {"a/alpha": 300}),
                _snap("2026-09-01", {"a/alpha": 9000})]
        old, new = hist[1][1], hist[2][1]  # snapshot halves, as load_snapshots returns
        out = diff_snapshots(old, new, META, "2026-08-01", "2026-09-01", history=hist)
        alpha = next(m for m in out["top_movers"] if m["full_name"] == "a/alpha")
        self.assertEqual(alpha["series"],
                         [["2026-07-01", 100], ["2026-08-01", 300], ["2026-09-01", 9000]])

    def test_deterministic(self):
        old = dict.fromkeys(META, 100)
        new = dict(old, **{"a/alpha": 9000, "b/beta": 400})
        a = diff_snapshots(_snap("o", old)[1], _snap("n", new)[1], META, "o", "n")
        b = diff_snapshots(_snap("o", old)[1], _snap("n", new)[1], META, "o", "n")
        self.assertEqual(json.dumps(a, sort_keys=True), json.dumps(b, sort_keys=True))


class TestBuildChangelog(unittest.TestCase):
    def test_single_snapshot_note(self):
        snap = _snap("2026-09-25", {"a/alpha": 9000})
        out = build_changelog([snap], META, "2026-09-25")
        self.assertIsNone(out["period"])
        self.assertEqual(out["top_movers"], [])
        self.assertIn("Baseline star snapshot seeded on 2026-09-25", out["note"])

    def test_two_snapshots_period(self):
        s1 = _snap("2026-08-25", {"a/alpha": 100})
        s2 = _snap("2026-09-25", {"a/alpha": 5000})
        out = build_changelog([s1, s2], META, "2026-09-25")
        self.assertEqual(out["period"], {"from": "2026-08-25", "to": "2026-09-25"})
        self.assertIsNone(out["note"])
        self.assertEqual(out["top_movers"][0]["full_name"], "a/alpha")

    def test_picks_last_two_of_three(self):
        s = [_snap("2026-07-01", {"a/alpha": 100}),
             _snap("2026-08-01", {"a/alpha": 200}),
             _snap("2026-09-01", {"a/alpha": 300})]
        out = build_changelog(s, META, "2026-09-01")
        self.assertEqual(out["period"]["from"], "2026-08-01")


class TestWriteHistory(unittest.TestCase):
    def test_roundtrip_and_same_day_determinism(self):
        tmp = tempfile.mkdtemp()
        try:
            records = [_rec("a/alpha", 9000), _rec("b/beta", 1000)]
            write_history(tmp, records, today="2026-09-25")
            write_history(tmp, records, today="2026-09-25")  # overwrite
            snaps = load_snapshots(tmp)
            self.assertEqual(len(snaps), 1)
            day, snap = snaps[0]
            self.assertEqual(day, "2026-09-25")
            self.assertEqual(snap["names"], ["a/alpha", "b/beta"])
            self.assertEqual(snap["stars"], [9000, 1000])
            cl = json.loads((Path(tmp) / "changelog.json").read_text())
            self.assertEqual(cl["top_movers"], [])
            # second day -> real diff
            records2 = [_rec("a/alpha", 9500), _rec("b/beta", 1000)]
            write_history(tmp, records2, today="2026-10-25")
            cl = json.loads((Path(tmp) / "changelog.json").read_text())
            self.assertEqual(cl["period"], {"from": "2026-09-25", "to": "2026-10-25"})
            self.assertEqual(cl["top_movers"][0]["delta"], 500)
        finally:
            shutil.rmtree(tmp)

    def test_snapshot_alignment(self):
        snap = build_snapshot([_rec("a/b", 500)], "2026-09-25")
        self.assertEqual(len(snap["names"]), len(snap["stars"]))


if __name__ == "__main__":
    unittest.main()
