"""W5 O.1 — checkpoint resume guarantees (pipeline/harvest_enumerate.Checkpoint).

Pins the two resume bugs fixed in chunk A:

1. Manifest identity = **search clause only** (`star_lo/star_hi/fork_lo/fork_hi`).
   The planner's probe ``count`` and ``truncated`` verdict are volatile across
   runs; keying on them made a completed window look pending after any drift.
   Legacy full-dict manifest lines must re-key on load so an interrupted CI run
   resumes across the upgrade.
2. ``Checkpoint.seen`` is reloaded by streaming the output JSONL at startup, so
   a crash-resume never re-appends records already on disk — using the exact
   same ``key()`` (lowercased ``owner/name``) the writer dedupes with.

No network, stdlib only, tmp dirs per test:

    python3 -m unittest discover -s tests -q   (stdlib gate)
    python3 -m pytest tests/ -q                (CI gate)
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "pipeline"))

from harvest_enumerate import CLAUSE_KEYS, Checkpoint, clause_key  # noqa: E402

WINDOW = {"star_lo": 500, "star_hi": 600, "fork_lo": None, "fork_hi": None, "count": 987}
DRIFTED = {"star_lo": 500, "star_hi": 600, "fork_lo": None, "fork_hi": None,
           "count": 1000, "truncated": True}
OTHER_CLAUSE = {"star_lo": 601, "star_hi": 700, "fork_lo": None, "fork_hi": None, "count": 50}

REC_A = {"owner": "Octo", "name": "Cat", "stars": 10}
REC_B = {"owner": "alpha", "name": "beta", "stars": 20}


def pending_for(ckpt: Checkpoint, windows: list[dict]) -> list[dict]:
    """Replicates the main() pending computation verbatim."""
    return [w for w in windows if clause_key(w) not in ckpt.done]


class TestClauseKey(unittest.TestCase):
    def test_identity_ignores_volatile_fields(self):
        self.assertEqual(clause_key(WINDOW), clause_key(DRIFTED))

    def test_identity_covers_exactly_the_clause_fields(self):
        parsed = json.loads(clause_key(WINDOW))
        self.assertEqual(set(parsed), set(CLAUSE_KEYS))

    def test_different_clauses_differ(self):
        self.assertNotEqual(clause_key(WINDOW), clause_key(OTHER_CLAUSE))


class TestManifestResume(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.out = os.path.join(self._tmp.name, "raw_repos.jsonl")
        self.manifest = os.path.join(self._tmp.name, "windows_done.jsonl")

    def _write_manifest(self, lines):
        with open(self.manifest, "w", encoding="utf-8") as fh:
            for line in lines:
                fh.write(line + "\n")

    def test_resume_ignores_volatile_count(self):
        # A run completed the window at count=987; the next day's probe says
        # 1000 and flags truncated. Same clause => zero re-harvest.
        self._write_manifest([json.dumps(WINDOW, sort_keys=True)])
        ckpt = Checkpoint(self.out, self.manifest)
        self.assertEqual(pending_for(ckpt, [DRIFTED, OTHER_CLAUSE]), [OTHER_CLAUSE])

    def test_new_clause_only_manifest_lines_match(self):
        self._write_manifest([clause_key(WINDOW)])
        ckpt = Checkpoint(self.out, self.manifest)
        self.assertEqual(pending_for(ckpt, [WINDOW]), [])

    def test_legacy_and_new_lines_for_same_clause_dedupe(self):
        self._write_manifest([
            json.dumps(WINDOW, sort_keys=True),       # legacy full-dict line
            json.dumps(DRIFTED, sort_keys=True),      # legacy with drifted count
            clause_key(WINDOW),                       # new clause-only line
        ])
        ckpt = Checkpoint(self.out, self.manifest)
        self.assertEqual(len(ckpt.done), 1)
        self.assertEqual(ckpt.harvest_count(), 1)

    def test_unfinished_window_stays_pending_after_restart(self):
        self._write_manifest([json.dumps(WINDOW, sort_keys=True)])
        first = Checkpoint(self.out, self.manifest)
        self.assertEqual(pending_for(first, [OTHER_CLAUSE]), [OTHER_CLAUSE])
        # Simulated crash + restart: still pending, never checkpointed.
        second = Checkpoint(self.out, self.manifest)
        self.assertEqual(pending_for(second, [OTHER_CLAUSE]), [OTHER_CLAUSE])

    def test_corrupt_manifest_line_skipped_not_fatal(self):
        self._write_manifest(["not json at all", clause_key(WINDOW)])
        ckpt = Checkpoint(self.out, self.manifest)
        self.assertEqual(pending_for(ckpt, [WINDOW, OTHER_CLAUSE]), [OTHER_CLAUSE])

    def test_complete_writes_clause_only_line(self):
        ckpt = Checkpoint(self.out, self.manifest)
        ckpt.complete(DRIFTED)  # window carries count + truncated
        with open(self.manifest, encoding="utf-8") as fh:
            lines = [json.loads(l) for l in fh if l.strip()]
        self.assertEqual(len(lines), 1)
        self.assertEqual(set(lines[0]), set(CLAUSE_KEYS))
        self.assertNotIn("count", lines[0])
        self.assertNotIn("truncated", lines[0])
        # ...and that line immediately resumes the drifted re-plan.
        fresh = Checkpoint(self.out, self.manifest)
        self.assertEqual(pending_for(fresh, [WINDOW]), [])


class TestSeenReload(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.out = os.path.join(self._tmp.name, "raw_repos.jsonl")
        self.manifest = os.path.join(self._tmp.name, "windows_done.jsonl")

    def _line_count(self):
        with open(self.out, encoding="utf-8") as fh:
            return sum(1 for l in fh if l.strip())

    def test_restart_does_not_reappend_existing_records(self):
        first = Checkpoint(self.out, self.manifest)
        first.write_records([REC_A, REC_B])
        self.assertEqual(self._line_count(), 2)

        # Crash + restart: same records arrive again (window re-delivered).
        second = Checkpoint(self.out, self.manifest)
        self.assertIn("octo/cat", second.seen)
        self.assertIn("alpha/beta", second.seen)
        second.write_records([REC_A, REC_B])
        self.assertEqual(self._line_count(), 2)

    def test_scan_uses_the_same_key_as_the_writer(self):
        first = Checkpoint(self.out, self.manifest)
        first.write_records([{"owner": "Octo", "name": "Cat", "stars": 10}])
        second = Checkpoint(self.out, self.manifest)
        # Different casing, different stars — same owner/name key => deduped.
        second.write_records([{"owner": "octo", "name": "cat", "stars": 9999}])
        self.assertEqual(self._line_count(), 1)
        with open(self.out, encoding="utf-8") as fh:
            self.assertEqual(json.loads(fh.readline())["stars"], 10)

    def test_malformed_output_lines_survive_the_scan(self):
        with open(self.out, "w", encoding="utf-8") as fh:
            fh.write("garbage not json\n")
            fh.write(json.dumps({"owner": "a"}) + "\n")   # missing name
            fh.write(json.dumps(REC_A) + "\n")
        ckpt = Checkpoint(self.out, self.manifest)
        self.assertEqual(ckpt.seen, {"octo/cat"})  # malformed lines skipped
        ckpt.write_records([REC_A])
        # REC_A survived the scan, so the re-append is deduped: still 3 lines.
        self.assertEqual(self._line_count(), 3)

    def test_appended_lines_are_flushed_before_any_restart(self):
        ckpt = Checkpoint(self.out, self.manifest)
        ckpt.write_records([REC_A])
        ckpt.complete(WINDOW)
        # write_records/complete flush, so an immediate restart sees both.
        again = Checkpoint(self.out, self.manifest)
        self.assertIn("octo/cat", again.seen)
        self.assertEqual(pending_for(again, [WINDOW]), [])


if __name__ == "__main__":
    unittest.main()
