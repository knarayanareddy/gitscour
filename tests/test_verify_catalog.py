"""Unit tests for pipeline/verify_catalog.py gates (W2 §1.7).

Proves: a happy fixture passes (12- and 13-field rows); a misplaced deep
record fails check #4; hooks > 90 fail; bad arity / bad margin fail.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(__file__)
SCRIPT = os.path.join(HERE, "..", "pipeline", "verify_catalog.py")


def write_fixture(base_dir, *, row13=True, hook="short", misplaced=False,
                  margin=4, arity=None):
    os.makedirs(os.path.join(base_dir, "data", "details"), exist_ok=True)
    # two domains so a misplaced record is possible
    row_a = [1, "webby", "acme", 900, 10, 0, 0, 0, 0, "MIT", [], hook]
    row_b = [2, "clouder", "acme", 800, 20, 1, 1, 1, 1, "MIT", [], hook]
    if arity is not None:
        row_a = row_a[: arity] if arity <= 12 else row_a + ["x"] * (arity - 12)
    elif row13:
        row_a = row_a + [margin]
        row_b = row_b + [4]
    packed = {
        "domains": {0: "Web Platforms & Frameworks", 1: "Cloud & Infrastructure"},
        "subsystems": {0: "General Web Platforms", 1: "General Cloud"},
        "languages": {0: "Python", 1: "Go"},
        "artifacts": {0: "Application / Service", 1: "Framework"},
        "rows": [row_a, row_b],
    }
    with open(os.path.join(base_dir, "catalog-packed.json"), "w") as fh:
        json.dump(packed, fh)
    index = [
        {"id": 1, "name": "webby", "owner": "acme"},
        {"id": 2, "name": "clouder", "owner": "acme"},
    ]
    for fname in ("catalog-index.json", "repos.json"):
        with open(os.path.join(base_dir, fname), "w") as fh:
            json.dump(index, fh)

    web_recs = {"1": {"id": 1, "name": "webby", "owner": "acme"}}
    cloud_recs = {"2": {"id": 2, "name": "clouder", "owner": "acme"}}
    if misplaced:
        # record for the cloud row parked inside the web shard
        web_recs["2"] = {"id": 2, "name": "clouder", "owner": "acme"}
        cloud_recs = {}
    with open(os.path.join(base_dir, "data", "details",
                           "web-platforms-and-frameworks.json"), "w") as fh:
        json.dump(web_recs, fh)
    with open(os.path.join(base_dir, "data", "details",
                           "cloud-and-infrastructure.json"), "w") as fh:
        json.dump(cloud_recs, fh)


def run(base_dir, *extra):
    return subprocess.run([sys.executable, SCRIPT, "--base-dir", base_dir, *extra],
                          capture_output=True, text=True,
                          cwd=os.path.join(HERE, ".."))


class TestVerifyCatalog(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="verify-")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_happy_path_13_field_rows(self):
        write_fixture(self.tmp, row13=True, margin=7)
        proc = run(self.tmp)
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertIn("OK:", proc.stdout)

    def test_happy_path_12_field_rows(self):
        write_fixture(self.tmp, row13=False)
        proc = run(self.tmp)
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)

    def test_misplaced_record_fails_gate(self):
        write_fixture(self.tmp, misplaced=True)
        proc = run(self.tmp)
        self.assertEqual(proc.returncode, 1, proc.stdout + proc.stderr)
        self.assertIn("misplaced", proc.stdout)
        self.assertIn("does not match", proc.stdout)

    def test_hook_over_90_fails(self):
        write_fixture(self.tmp, hook="x" * 91)
        proc = run(self.tmp)
        self.assertEqual(proc.returncode, 1, proc.stdout + proc.stderr)
        self.assertIn("longer than 90", proc.stdout)

    def test_bad_arity_fails(self):
        write_fixture(self.tmp, arity=11)
        proc = run(self.tmp)
        self.assertEqual(proc.returncode, 1, proc.stdout + proc.stderr)
        self.assertIn("expected 12 or 13", proc.stdout)

    def test_bad_margin_fails(self):
        write_fixture(self.tmp, row13=True, margin=15)
        proc = run(self.tmp)
        self.assertEqual(proc.returncode, 1, proc.stdout + proc.stderr)
        self.assertIn("domain_margin outside 0..9", proc.stdout)


if __name__ == "__main__":
    unittest.main()
