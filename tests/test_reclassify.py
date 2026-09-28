"""End-to-end tests for pipeline/reclassify_catalog.py (W2 §1.3).

Builds a minimal 12-field packed index + Tier-2 shard, runs the CLI, and
checks: churn histogram, churn gate (exit 2), keyword label swap, template
card regeneration, curated card preservation, 13-field rows with margin, and
lossless topics round-trip.
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
from taxonomy_engine import generate_beginner_context  # noqa: E402

SCRIPT = os.path.join(PIPELINE, "reclassify_catalog.py")
OLD_DOM = "Operating Systems & Low-Level"
OLD_SUB = "General Operating Systems"
OLD_ART = "Application / Service"


def make_fixture(base_dir):
    """3 rows: 1 wrong-domain template card, 1 correct cloud row, 1 curated card."""
    os.makedirs(os.path.join(base_dir, "data", "details"))
    topics_mover = ["web-framework", "api"]
    # deliberate v1-style wrong label: a web framework parked under OS
    cards = generate_beginner_context("webby", OLD_DOM, OLD_SUB, "Python")
    rows = [
        # id, name, owner, stars, forks, lang, dom, sub, art, license, primitives, hook
        [101, "webby", "acme", 5000, 10, 0, 0, 0, 0, "MIT", ["python"], "A blazing fast web framework"],
        [102, "srvapp", "acme", 6000, 20, 1, 1, 1, 1, "MIT", [], "A cloud native web-server"],
        [103, "curateddb", "acme", 7000, 30, 0, 2, 2, 2, "MIT", [], "A curated database"],
    ]
    packed = {
        "domains": {0: OLD_DOM, 1: "Cloud & Infrastructure", 2: "Databases & Storage"},
        "subsystems": {0: OLD_SUB, 1: "General Cloud", 2: "General Databases"},
        "languages": {0: "Python", 1: "Go", 2: "Rust"},
        "artifacts": {0: OLD_ART, 1: "Application / Service", 2: "Application / Service"},
        "rows": rows,
    }
    with open(os.path.join(base_dir, "catalog-packed.json"), "w") as fh:
        json.dump(packed, fh)

    shard = {
        "101": {
            "id": 101, "name": "webby", "owner": "acme",
            "description": "A blazing fast web framework for the API era",
            "topics": topics_mover,
            "beginner_intel": cards,  # exact v2 template for the OLD labels
            "keywords": [OLD_SUB, OLD_ART, OLD_DOM, "python", "web-framework"],
        },
        "102": {
            "id": 102, "name": "srvapp", "owner": "acme",
            "description": "The cloud native web-server with observability",
            "topics": ["web-server", "cloud-native", "kubernetes"],
            "beginner_intel": generate_beginner_context(
                "srvapp", "Cloud & Infrastructure", "General Cloud", "Go"),
            "keywords": ["General Cloud", "Application / Service",
                         "Cloud & Infrastructure"],
        },
        "103": {
            "id": 103, "name": "curateddb", "owner": "acme",
            "description": "A curated database of things",
            "topics": ["database"],
            "beginner_intel": {"what_it_does": "CURATED ELI5 COPY — never touched"},
            "keywords": ["General Databases", "Application / Service",
                         "Databases & Storage"],
        },
    }
    with open(os.path.join(base_dir, "data", "details", "web-platforms-and-frameworks.json"),
              "w") as fh:
        json.dump(shard, fh)


def run_cli(base_dir, *extra):
    return subprocess.run(
        [sys.executable, SCRIPT, "--base-dir", base_dir, *extra],
        capture_output=True, text=True, cwd=os.path.join(HERE, ".."))


class TestReclassify(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="reclassify-")
        make_fixture(self.tmp)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def packed_rows(self):
        with open(os.path.join(self.tmp, "catalog-packed.json")) as fh:
            return json.load(fh)

    def read_shard(self):
        path = os.path.join(self.tmp, "data", "details",
                            "web-platforms-and-frameworks.json")
        with open(path) as fh:
            return json.load(fh)

    def test_dry_run_reports_and_exits_zero(self):
        report_path = os.path.join(self.tmp, "report.json")
        proc = run_cli(self.tmp, "--dry-run", "--report-out", report_path)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("domain churn", proc.stdout)
        self.assertIn("top domain transitions", proc.stdout)
        self.assertIn("[dry run] no files written", proc.stdout)
        with open(report_path) as fh:
            report = json.load(fh)
        self.assertEqual(report["total"], 3)
        # only the mover changes domain -> 33% churn
        self.assertEqual(report["domain_changed"], 1)
        self.assertAlmostEqual(report["domain_changed_pct"], 33.33, places=1)
        # packed index untouched in dry-run
        self.assertEqual(len(self.packed_rows()["rows"][0]), 12)

    def test_gate_fails_without_allow_churn(self):
        proc = run_cli(self.tmp)  # 33% > default 20%
        self.assertEqual(proc.returncode, 2, proc.stdout + proc.stderr)
        self.assertIn("exceeds", proc.stderr)
        # nothing written
        self.assertEqual(len(self.packed_rows()["rows"][0]), 12)

    def test_apply_swaps_labels_and_rewrites_rows(self):
        report_path = os.path.join(self.tmp, "report.json")
        proc = run_cli(self.tmp, "--allow-churn", "--report-out", report_path)
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertIn("reclassify complete", proc.stdout)

        packed = self.packed_rows()
        doms = {int(k): v for k, v in packed["domains"].items()}
        # 13-field rows (margin only) or 15-field rows (margin + topics +
        # compatibility — W3 §2.2 when the fixture carries topics)
        for row in packed["rows"]:
            self.assertIn(len(row), (13, 15))
            self.assertGreaterEqual(row[12], 0)
            self.assertLessEqual(row[12], 9)
            if len(row) == 15:
                self.assertIsInstance(row[13], list)
                self.assertIsInstance(row[14], list)
        # mover: OS -> Web Platforms & Frameworks
        mover = next(r for r in packed["rows"] if r[1] == "webby")
        self.assertEqual(doms[mover[6]], "Web Platforms & Frameworks")
        # cloud row unchanged
        srv = next(r for r in packed["rows"] if r[1] == "srvapp")
        self.assertEqual(doms[srv[6]], "Cloud & Infrastructure")

        shard = self.read_shard()
        # template card regenerated against the new labels
        new_bi = shard["101"]["beginner_intel"]
        self.assertNotEqual(new_bi.get("what_it_does"), "")
        from taxonomy_engine import classify_domain_and_subsystem
        new_dom, new_sub, _ = classify_domain_and_subsystem(
            "webby", "A blazing fast web framework for the API era",
            ["web-framework", "api"], "Python")
        self.assertEqual(new_dom, "Web Platforms & Frameworks")
        expect = generate_beginner_context("webby", new_dom, new_sub, "Python")
        self.assertEqual(new_bi, expect)
        # curated card byte-identical (it moved to its own domain shard file)
        with open(os.path.join(self.tmp, "data", "details",
                               "databases-and-storage.json")) as fh:
            db_shard = json.load(fh)
        self.assertEqual(db_shard["103"]["beginner_intel"]["what_it_does"],
                         "CURATED ELI5 COPY — never touched")
        # keyword swap preserved the topic entries and dropped old labels
        kws = shard["101"]["keywords"]
        self.assertNotIn(OLD_DOM, kws)
        self.assertNotIn(OLD_SUB, kws)
        self.assertIn("web-framework", kws)   # topic preserved
        self.assertIn("python", kws)          # non-label preserved
        self.assertIn("Web Platforms & Frameworks", kws)
        # topics round-trip losslessly into the rewritten shard (§1.4)
        self.assertEqual(shard["101"]["topics"], ["web-framework", "api"])

    def test_gate_open_with_small_churn(self):
        # second run over the already-migrated fixture: churn is 0 -> applies
        proc = run_cli(self.tmp, "--allow-churn")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        proc2 = run_cli(self.tmp)  # no allow needed now
        self.assertEqual(proc2.returncode, 0, proc2.stderr)
        self.assertRegex(proc2.stdout, r"domain churn\s+:\s+0\b")

    def test_topics_coverage_gate(self):
        # strip stored topics -> coverage 0% -> --min-topics-pct 50 fails with exit 3
        path = os.path.join(self.tmp, "data", "details",
                            "web-platforms-and-frameworks.json")
        shard = self.read_shard()
        for rec in shard.values():
            rec["topics"] = []
        with open(path, "w") as fh:
            json.dump(shard, fh)
        proc = run_cli(self.tmp, "--min-topics-pct", "50")
        self.assertEqual(proc.returncode, 3, proc.stdout + proc.stderr)
        self.assertIn("topics coverage", proc.stdout)
        self.assertIn("FAIL", proc.stderr)
        # default (flag off) still runs
        proc2 = run_cli(self.tmp, "--dry-run")
        self.assertEqual(proc2.returncode, 0, proc2.stdout)


if __name__ == "__main__":
    unittest.main()
