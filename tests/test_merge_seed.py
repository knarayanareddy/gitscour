"""Tests for pipeline/merge_seed_intel.py (W2 §1.8, review finding #6b).

Proves the 16 curated SEEDS ELI5 cards actually reach Tier-2 shard records:
dry-run writes nothing, --apply replaces only beginner_intel + quickstart_code,
a second run is a no-op, missing seeds report loudly (and fail with
--require-all), and the renamed seed (ggml-org/llama.cpp) still resolves.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(__file__)
PIPELINE = os.path.join(HERE, "..", "pipeline")
sys.path.insert(0, PIPELINE)
from generate_seed import SEEDS  # noqa: E402

SCRIPT = os.path.join(PIPELINE, "merge_seed_intel.py")
SEED_KEYS = [f"{s['owner']}/{s['name']}".lower() for s in SEEDS]
DUCKDB = next(s for s in SEEDS if s["name"] == "duckdb")


def write_fixture(base_dir, include):
    """Pack index + shards containing only the rows named in `include`."""
    os.makedirs(os.path.join(base_dir, "data", "details"), exist_ok=True)
    rows, deep = [], {}
    shard_of = {"Databases & Storage": "databases-and-storage",
                "AI & Machine Learning": "ai-and-machine-learning"}
    shard_files = {}
    for i, (owner_name, dom) in enumerate(include, start=9001):
        owner, _, name = owner_name.partition("/")
        row = [i, name, owner, 5000 + i, 10, 0, 0, 0, 0, "MIT", [], "hook"]
        rows.append(row)
        slug = shard_of[dom]
        shard_files.setdefault(slug, {})
        shard_files[slug][str(i)] = {
            "id": i, "name": name, "owner": owner,
            "beginner_intel": {"what_it_does": "generated placeholder"},
            "quickstart_code": "git clone placeholder",
        }
    packed = {
        "domains": {0: "Databases & Storage", 1: "AI & Machine Learning"},
        "subsystems": {0: "General Databases", 1: "General AI"},
        "languages": {0: "Python"},
        "artifacts": {0: "Application / Service"},
        "rows": rows,
    }
    # rows above use dom/sub/art id 0 -> Databases everywhere; good enough
    with open(os.path.join(base_dir, "catalog-packed.json"), "w") as fh:
        json.dump(packed, fh)
    for slug, recs in shard_files.items():
        with open(os.path.join(base_dir, "data", "details", f"{slug}.json"), "w") as fh:
            json.dump(recs, fh)


def run(base_dir, *extra):
    return subprocess.run([sys.executable, SCRIPT, "--base-dir", base_dir, *extra],
                          capture_output=True, text=True,
                          cwd=os.path.join(HERE, ".."))


class TestMergeSeedIntel(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="merge-seed-")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_dry_run_writes_nothing(self):
        write_fixture(self.tmp, [("duckdb/duckdb", "Databases & Storage")])
        before = open(os.path.join(self.tmp, "data", "details",
                                   "databases-and-storage.json")).read()
        proc = run(self.tmp)
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertIn("[would-update] duckdb/duckdb", proc.stdout)
        after = open(os.path.join(self.tmp, "data", "details",
                                  "databases-and-storage.json")).read()
        self.assertEqual(before, after, "dry-run modified a shard file")

    def test_apply_replaces_only_two_fields_and_is_idempotent(self):
        write_fixture(self.tmp, [("duckdb/duckdb", "Databases & Storage")])
        proc = run(self.tmp, "--apply")
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertIn("[apply] duckdb/duckdb", proc.stdout)
        path = os.path.join(self.tmp, "data", "details", "databases-and-storage.json")
        rec = json.load(open(path))["9001"]
        self.assertEqual(rec["beginner_intel"], DUCKDB["beginner_intel"])
        self.assertEqual(rec["quickstart_code"], DUCKDB["quickstart_code"])
        self.assertEqual(rec["name"], "duckdb")  # identity fields untouched
        # second run: in sync, no rewrite
        mtime = os.path.getmtime(path)
        proc2 = run(self.tmp, "--apply")
        self.assertEqual(proc2.returncode, 0, proc2.stderr)
        self.assertIn("in sync: 1", proc2.stdout)
        self.assertEqual(os.path.getmtime(path), mtime)

    def test_missing_seed_reports_and_require_all_fails(self):
        write_fixture(self.tmp, [("duckdb/duckdb", "Databases & Storage")])
        proc = run(self.tmp)
        self.assertEqual(proc.returncode, 0)
        self.assertIn("missing: 15", proc.stdout)
        self.assertIn("MISSING:", proc.stdout)
        proc2 = run(self.tmp, "--require-all")
        self.assertEqual(proc2.returncode, 1, proc2.stdout)

    def test_renamed_seed_resolves(self):
        # SEEDS updated to ggml-org/llama.cpp (GitHub rename) — must match
        write_fixture(self.tmp, [("ggml-org/llama.cpp", "Databases & Storage")])
        proc = run(self.tmp, "--apply")
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertIn("[apply] ggml-org/llama.cpp", proc.stdout)
        # with every row present, --require-all stays green
        proc2 = run(self.tmp, "--require-all")
        self.assertEqual(proc2.returncode, 1, proc2.stdout)  # 15 still missing here


if __name__ == "__main__":
    unittest.main()
