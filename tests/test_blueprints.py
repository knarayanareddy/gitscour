"""W4 §3.6 — blueprints.json validation.

Every curated blueprint names seed repos (`owner/name`) and required subsystems;
this suite pins them against the real packed catalog so a library edit can never
reference a repo that is not in the >=500-star corpus or a subsystem label that
does not exist. Also pins the four original template ids (regression) and the
goal/category vocabulary the InspirationGenerator UI offers.
"""
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GOALS = {"ai", "systems", "security"}
CATEGORIES = {"storage", "ai", "backend", "frontend", "devtools", "security"}
ORIGINAL_IDS = {
    "ai-rag-analytics",
    "edge-observability",
    "autonomous-coding-agent",
    "zero-trust-microservices",
}


def load_blueprints():
    with open(ROOT / "web" / "src" / "blueprints.json", encoding="utf-8") as f:
        return json.load(f)


def load_packed():
    with open(ROOT / "web" / "public" / "catalog-packed.json", encoding="utf-8") as f:
        return json.load(f)


class TestBlueprintsCatalog(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.doc = load_blueprints()
        cls.bps = cls.doc["blueprints"]
        cls.packed = load_packed()
        cls.repos = {
            f"{r[2]}/{r[1]}": r for r in cls.packed["rows"]
        }
        cls.subsystems = set(cls.packed["subsystems"].values())

    def test_document_shape(self):
        self.assertGreaterEqual(self.doc["version"], 1)
        self.assertGreaterEqual(len(self.bps), 6, "library must be > the original 4")

    def test_original_templates_preserved(self):
        ids = {b["id"] for b in self.bps}
        self.assertTrue(ORIGINAL_IDS <= ids, f"missing originals: {ORIGINAL_IDS - ids}")

    def test_ids_unique_and_goal_coverage(self):
        ids = [b["id"] for b in self.bps]
        self.assertEqual(len(ids), len(set(ids)))
        for goal in GOALS:
            n = sum(1 for b in self.bps if b["goal"] == goal)
            self.assertGreaterEqual(n, 2, f"goal {goal!r} needs >=2 blueprints")

    def test_every_role_is_well_formed(self):
        for b in self.bps:
            self.assertIn(b["goal"], GOALS, b["id"])
            self.assertGreaterEqual(len(b["roles"]), 3, b["id"])
            labels = [r["label"] for r in b["roles"]]
            self.assertEqual(len(labels), len(set(labels)), f"{b['id']}: dup labels")
            for r in b["roles"]:
                self.assertIn(r["category"], CATEGORIES, f"{b['id']}/{r['label']}")
                self.assertIsInstance(r.get("seeds", []), list)
                self.assertTrue(
                    r.get("requiredSubsystem") is None
                    or r["requiredSubsystem"] in self.subsystems,
                    f"{b['id']}/{r['label']}: unknown subsystem "
                    f"{r.get('requiredSubsystem')!r}",
                )

    def test_every_seed_exists_in_packed(self):
        missing = []
        for b in self.bps:
            for r in b["roles"]:
                for seed in r.get("seeds", []):
                    if seed not in self.repos:
                        missing.append(f"{b['id']}/{r['label']}: {seed}")
        self.assertEqual(missing, [], f"seeds absent from packed catalog: {missing}")

    def test_edges_reference_role_labels(self):
        for b in self.bps:
            labels = {r["label"] for r in b["roles"]}
            for a, c, _rel in b.get("edges", []):
                self.assertIn(a, labels, f"{b['id']}: edge {a!r}")
                self.assertIn(c, labels, f"{b['id']}: edge {c!r}")

    def test_required_text_fields(self):
        for b in self.bps:
            for field in ("title", "tagline", "whyItWorks", "tradeoffs", "starterCli"):
                self.assertTrue(b.get(field), f"{b['id']}: empty {field}")


if __name__ == "__main__":
    unittest.main()
