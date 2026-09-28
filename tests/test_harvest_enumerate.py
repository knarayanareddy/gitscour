"""Deterministic unit tests for pipeline/harvest_enumerate.py (W1 guarantees).

No network access: every GitHub interaction is stubbed and ``time.sleep`` is
neutered for the duration of the module, so the suite is instant and CI-safe.

Run either way:
    python3 -m unittest discover -s tests -v      (stdlib, zero dependencies)
    python3 -m pytest tests/ -q                   (what both CI workflows run)
"""

from __future__ import annotations

import os
import re
import sys
import threading
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "pipeline"))

import harvest_enumerate as he  # noqa: E402
from harvest_enumerate import (  # noqa: E402
    Backoff,
    harvest_window,
    plan_windows,
    probe_count,
    window_clause,
)

_REAL_SLEEP = he.time.sleep


def setUpModule() -> None:
    # Planning/backoff paths sleep on Backoff; keep tests instant.
    he.time.sleep = lambda *_args, **_kwargs: None


def tearDownModule() -> None:
    he.time.sleep = _REAL_SLEEP


def _quiet(_msg: str) -> None:
    pass


def _star_span(clause: str) -> tuple[int, int]:
    m = re.search(r"stars:(\d+)(?:\.\.(\d+))?", clause)
    assert m, f"no stars qualifier in {clause!r}"
    lo = int(m.group(1))
    hi = int(m.group(2)) if m.group(2) else lo
    return lo, hi


class PlanGH:
    """Count-query stub. responder(clause) returns an int or raises/returns an Exception."""

    def __init__(self, responder):
        self.responder = responder
        self.clauses: list[str] = []
        self._lock = threading.Lock()

    def run(self, query, variables):
        if query != he.COUNT_QUERY:
            raise AssertionError(f"planner must only issue count queries, got {query[:40]!r}")
        clause = variables["q"]
        with self._lock:
            self.clauses.append(clause)
        result = self.responder(clause)
        if isinstance(result, Exception):
            raise result
        return {"search": {"repositoryCount": result}}


class SearchGH:
    """Page stub for SEARCH_QUERY. Each entry is a payload dict or an Exception.
    If entries run out, the last one repeats (handy for endless-page tests)."""

    def __init__(self, pages):
        self.pages = list(pages)
        self.calls = 0
        self._lock = threading.Lock()

    def run(self, query, variables):
        if query != he.SEARCH_QUERY:
            raise AssertionError(f"harvest must only issue search queries, got {query[:40]!r}")
        with self._lock:
            idx = min(self.calls, len(self.pages) - 1)
            self.calls += 1
        item = self.pages[idx]
        if isinstance(item, Exception):
            raise item
        return {"search": item}


def _page(nodes, has_next: bool, cursor=None) -> dict:
    return {"nodes": nodes, "pageInfo": {"hasNextPage": has_next, "endCursor": cursor}}


def _node(db_id=1, name="repo", owner="octo", stars=900) -> dict:
    return {
        "databaseId": db_id,
        "name": name,
        "owner": {"login": owner},
        "description": "a repository",
        "stargazerCount": stars,
        "forkCount": 10,
        "primaryLanguage": {"name": "Go"},
        "licenseInfo": {"spdxId": "MIT"},
        "repositoryTopics": {"nodes": []},
        "pushedAt": "2026-01-01T00:00:00Z",
    }


WINDOW = {"star_lo": 500, "star_hi": 500, "fork_lo": None, "fork_hi": None}


class WindowClauseTests(unittest.TestCase):
    def test_open_ended_fork_axis_uses_gte(self):
        # The exact-match bug: this used to emit `forks:1001`, silently losing
        # every repo with >1,001 forks at that star value (review finding #2d).
        self.assertEqual(
            window_clause(500, 500, 1001, None),
            "stars:500 forks:>=1001 sort:stars-desc",
        )

    def test_exact_and_range_fork_clauses(self):
        self.assertEqual(window_clause(500, 500, 50, 50), "stars:500 forks:50 sort:stars-desc")
        self.assertEqual(window_clause(500, 500, 0, 1000), "stars:500 forks:0..1000 sort:stars-desc")

    def test_star_only_clauses(self):
        self.assertEqual(window_clause(500, 500, None, None), "stars:500 sort:stars-desc")
        self.assertEqual(window_clause(500, 999, None, None), "stars:500..999 sort:stars-desc")


class ProbeCountTests(unittest.TestCase):
    def test_runtime_error_returns_none_not_zero(self):
        # count 0 would make the planner skip the star range entirely (finding #2b)
        gh = PlanGH(lambda _c: RuntimeError("boom"))
        self.assertIsNone(probe_count(gh, "stars:500", retries=2))

    def test_backoff_exhaustion_returns_none(self):
        gh = PlanGH(lambda _c: Backoff("rate limited"))
        self.assertIsNone(probe_count(gh, "stars:500", retries=3))

    def test_success_returns_count(self):
        gh = PlanGH(lambda _c: 42)
        self.assertEqual(probe_count(gh, "stars:500", retries=2), 42)


class PlanWindowsTests(unittest.TestCase):
    def test_aborts_after_repeated_probe_failures(self):
        # Never silently skip a star range: 3 failed probes -> RuntimeError.
        gh = PlanGH(lambda _c: RuntimeError("api down"))
        logs = []
        with self.assertRaises(RuntimeError) as ctx:
            plan_windows(gh, 500, 1000, concurrency=2, log=logs.append)
        self.assertIn("aborting rather than silently skipping", str(ctx.exception))

    def test_skips_genuinely_empty_ranges(self):
        gh = PlanGH(lambda _c: 0)
        self.assertEqual(plan_windows(gh, 500, 1000, concurrency=2, log=_quiet), [])

    def test_split_arithmetic_is_gap_free(self):
        # 600 repos/star forces splits all the way to atomic star windows;
        # the leaves must cover [500..503] exactly once — no gaps, no overlaps.
        def responder(clause):
            lo, hi = _star_span(clause)
            return (hi - lo + 1) * 600

        gh = PlanGH(responder)
        leaves = plan_windows(gh, 500, 503, concurrency=2, log=_quiet)
        star_values = sorted(w["star_lo"] for w in leaves)
        self.assertEqual(star_values, [500, 501, 502, 503])
        self.assertTrue(all(w["star_lo"] == w["star_hi"] for w in leaves))
        self.assertFalse(any(w.get("truncated") for w in leaves))

    def test_atomic_star_splits_on_fork_axis_with_gte_clause(self):
        # Atomic star value over the cap -> fork split; the open-ended bucket
        # must probe with forks:>=1001 (not exact forks:1001).
        def responder(clause):
            if "forks" in clause:
                return 700
            lo, hi = _star_span(clause)
            self.assertEqual((lo, hi), (500, 500))
            return 1500

        gh = PlanGH(responder)
        leaves = plan_windows(gh, 500, 500, concurrency=2, log=_quiet)
        self.assertEqual(len(leaves), 2)
        self.assertTrue(
            any("forks:>=1001" in c for c in gh.clauses),
            f"open-ended fork bucket was not probed with forks:>=1001: {gh.clauses}",
        )
        open_ended = [w for w in leaves if w["fork_lo"] == 1001]
        self.assertEqual(len(open_ended), 1)
        self.assertIsNone(open_ended[0]["fork_hi"])
        lower = [w for w in leaves if w["fork_lo"] == 0]
        self.assertEqual(len(lower), 1)
        self.assertEqual(lower[0]["fork_hi"], 1000)


class HarvestWindowTests(unittest.TestCase):
    def test_clean_window_returns_records(self):
        gh = SearchGH([_page([_node(name="a", stars=901)], has_next=False)])
        window, records, retries = harvest_window(gh, dict(WINDOW))
        self.assertEqual(window, WINDOW)
        self.assertEqual(retries, 0)
        self.assertEqual(len(records), 1)
        rec = records[0]
        self.assertEqual(rec["license"], "MIT")
        self.assertEqual(rec["stars"], 901)
        self.assertEqual(rec["language"], "Go")

    def test_mid_pagination_failure_raises_partial_never_returned(self):
        # Old behaviour: break -> caller checkpointed a partial window as done
        # forever (review finding #2a). Now it must raise.
        gh = SearchGH([
            _page([_node(db_id=1)], has_next=True, cursor="c1"),
            RuntimeError("page 2 died"),
        ])
        with self.assertRaises(RuntimeError) as ctx:
            harvest_window(gh, dict(WINDOW))
        self.assertIn("page 2 died", str(ctx.exception))
        # Exactly one successful page was fetched; nothing beyond it.
        self.assertEqual(gh.calls, 2)

    def test_page_cap_overflow_raises(self):
        # Window outgrew the 1,000-result cap between plan and harvest: the old
        # code looped out and returned the first 1,000 silently (finding #2c).
        gh = SearchGH([_page([_node()], has_next=True, cursor="c")])
        with self.assertRaises(RuntimeError) as ctx:
            harvest_window(gh, dict(WINDOW))
        self.assertIn("outgrew the search cap", str(ctx.exception))
        self.assertEqual(gh.calls, he.MAX_RESULTS_PER_QUERY // he.PAGE_SIZE)

    def test_backoff_then_success(self):
        gh = SearchGH([
            Backoff("rate limited"),
            _page([_node(name="after-backoff")], has_next=False),
        ])
        _window, records, retries = harvest_window(gh, dict(WINDOW))
        self.assertEqual(retries, 1)
        self.assertEqual(records[0]["name"], "after-backoff")


if __name__ == "__main__":
    unittest.main(verbosity=2)
