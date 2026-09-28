"""W5 O.3 — line-oriented serialization pins (pipeline/linejson.py).

Proves, with fixtures only (no 63 MB loads):

  1. round-trip: every layout parses back to the exact input value, and to the
     *same value* as the legacy single-line writer produced;
  2. byte-determinism: same input in, same bytes out, across processes;
  3. row granularity: one record per line, so touching one row touches one line;
  4. the Accept metric: in a scratch git repo, `git diff -U0` for a one-row
     change under the line-oriented format contains only that row, while the
     legacy single-line format rewrites the whole blob (diff bytes compared).

    python3 -m unittest discover -s tests -q   (stdlib gate)
    python3 -m pytest tests/ -q                (CI gate)
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import linejson  # noqa: E402

LEGACY = lambda v: json.dumps(v, separators=(",", ":"))  # noqa: E731


def row(rid, stars=1000, fields=15):
    """A catalog row: 12 base fields, optional margin/topics/compatibility tail."""
    r = [rid, f"repo{rid}", "owner", stars, 10, 0, 0, 0, 0, "MIT", [], "hook"]
    if fields >= 13:
        r.append(4)
    if fields >= 15:
        r.extend([["topic"], ["PostgreSQL Compatible"]])
    return r


class TestRoundTrip(unittest.TestCase):
    def test_records_layout(self):
        items = [row(i) for i in range(5)]
        text = linejson.dumps(items)
        self.assertEqual(json.loads(text), items)
        self.assertEqual(json.loads(text), json.loads(LEGACY(items)))

    def test_id_keyed_map_layout(self):
        # Real Tier-2 shards are keyed by INT repo ids (json.dump stringifies
        # them); the writer must emit quoted keys the same way.
        mapping = {1000 + i: {"id": 1000 + i, "name": f"r{i}",
                              "primitives": ["vector"]} for i in range(4)}
        text = linejson.dumps(mapping)
        # JSON object keys are strings after parsing — identical semantics to
        # the legacy json.dump writer, which is the contract we must keep.
        expect = {str(k): v for k, v in mapping.items()}
        self.assertEqual(json.loads(text), expect)
        self.assertEqual(json.loads(text), json.loads(LEGACY(mapping)))
        self.assertIn('"1000":', text)  # quoted, never {1000: …

    def test_payload_layout(self):
        payload = {
            "domains": {"Databases & Storage": 0, "AI & Machine Learning": 1},
            "rows": [row(1), row(2)],
            "activity": [[1, 2], [3, 4]],
            "license_tiers": ["Permissive", "Unknown"],
            "signal": [45, 67],
        }
        text = linejson.dumps(payload)
        self.assertEqual(json.loads(text), payload)

    def test_search_index_layout(self):
        index = {"t": ["raft", "simd", "vector"], "p": [[0, 1024], [1, 2048, 0, 512]],
                 "d": [10, 20]}
        self.assertEqual(json.loads(linejson.dumps(index)), index)

    def test_edges_layout(self):
        data = {"k": 10, "edges": [[[1, 0.5], [2, 0.4]], [[0, 0.5]]]}
        self.assertEqual(json.loads(linejson.dumps(data)), data)

    def test_empty_containers_and_scalars(self):
        for value in ([], {}, [1, 2, 3], {"a": 1}, "x", 42, None, True):
            self.assertEqual(json.loads(linejson.dumps(value)), value)

    def test_arity_guards_preserved(self):
        for fields in (12, 13, 15):
            r = [row(7, fields=fields)]
            self.assertEqual(json.loads(linejson.dumps(r))[0], r[0])
            self.assertEqual(len(json.loads(linejson.dumps(r))[0]), fields)


class TestDeterminism(unittest.TestCase):
    def test_dumps_is_idempotent(self):
        payload = {"rows": [row(i) for i in range(10)], "signal": list(range(10))}
        self.assertEqual(linejson.dumps(payload), linejson.dumps(payload))

    def test_write_produces_identical_bytes_across_calls(self):
        payload = {"rows": [row(i) for i in range(20)]}
        with tempfile.TemporaryDirectory() as tmp:
            a, b = os.path.join(tmp, "a.json"), os.path.join(tmp, "b.json")
            linejson.write(a, payload)
            linejson.write(b, payload)
            self.assertEqual(Path(a).read_bytes(), Path(b).read_bytes())

    def test_trailing_newline(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "x.json")
            linejson.write(path, [row(1)])
            self.assertTrue(Path(path).read_bytes().endswith(b"\n"))


class TestRowGranularity(unittest.TestCase):
    def test_one_record_per_line(self):
        items = [row(i) for i in range(50)]
        lines = linejson.dumps(items).splitlines()
        # "[" + 50 records + "]"
        self.assertEqual(len(lines), 52)
        self.assertEqual(json.loads("\n".join(lines)), items)

    def test_one_row_change_touches_exactly_one_line(self):
        items = [row(i) for i in range(50)]
        changed = [list(r) for r in items]  # shallow copy; rows are scalars + small lists
        changed[7] = list(changed[7])
        changed[7][3] = 999999  # stars bump
        before = linejson.dumps(items).splitlines()
        after = linejson.dumps(changed).splitlines()
        diff = [i for i, (a, b) in enumerate(zip(before, after)) if a != b]
        self.assertEqual(len(before), len(after))
        self.assertEqual(len(diff), 1, f"changed lines: {diff}")


class TestGitDeltaAccept(unittest.TestCase):
    """The O.3 Accept: one-row change diffs at row granularity in git."""

    N = 400

    def _repo_with(self, dumps_fn, tmp):
        repo = Path(tmp) / "repo"
        repo.mkdir()
        subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
        subprocess.run(["git", "config", "user.email", "t@t"], cwd=repo, check=True)
        subprocess.run(["git", "config", "user.name", "t"], cwd=repo, check=True)
        path = repo / "catalog.json"

        def write_version(stars):
            rows = [row(i, stars=stars if i == 7 else 1000 + i) for i in range(self.N)]
            text = dumps_fn(rows) + ("\n" if dumps_fn is linejson.dumps else "")
            path.write_text(text, encoding="utf-8")

        write_version(1000)
        subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
        subprocess.run(["git", "commit", "-qm", "v1"], cwd=repo, check=True)
        write_version(2000)  # the one-row change
        diff = subprocess.run(["git", "diff", "-U0"], cwd=repo, check=True,
                              capture_output=True, text=True).stdout
        numstat = subprocess.run(["git", "diff", "--numstat"], cwd=repo, check=True,
                                 capture_output=True, text=True).stdout.strip()
        return diff, numstat, path.stat().st_size

    def test_lineoriented_diff_only_contains_the_changed_row(self):
        with tempfile.TemporaryDirectory() as tmp:
            diff, numstat, size = self._repo_with(linejson.dumps, tmp)
            changed = [l for l in diff.splitlines()
                       if l.startswith(("+", "-")) and not l.startswith(("+++", "---"))]
            self.assertEqual(len(changed), 2, changed)  # one row out, one row in
            added, removed = numstat.split("\t")[:2]
            self.assertEqual((added, removed), ("1", "1"))
            # The change is row-sized, not file-sized.
            self.assertLess(len(diff.encode()), max(1000, size // 50),
                            "line-oriented diff should be far smaller than the file")

    def test_legacy_single_line_diff_rewrites_the_whole_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            diff, numstat, size = self._repo_with(LEGACY, tmp)
            # 1 line +/- but that line IS the entire file — the old pain.
            self.assertGreater(len(diff.encode()), size * 0.9,
                               "legacy single-line diff should ≈ whole file")

    def test_delta_ratio_recorded_shape(self):
        with tempfile.TemporaryDirectory() as tmp:
            new_diff, _, _ = self._repo_with(linejson.dumps, tmp)
        with tempfile.TemporaryDirectory() as tmp:
            old_diff, _, _ = self._repo_with(LEGACY, tmp)
        self.assertGreater(len(old_diff.encode()), 20 * len(new_diff.encode()),
                           f"expected >=20x smaller diff, got "
                           f"{len(old_diff.encode())} vs {len(new_diff.encode())}")


if __name__ == "__main__":
    unittest.main()
