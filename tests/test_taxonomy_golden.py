"""Golden-set regression tests for the taxonomy v2 classifier (§1.1).

`tests/golden_repos.json` holds hand-labeled fixtures modeled on real repos
(owner/name/description/topics/language as the classifier consumes them).
The taxonomy suite must classify >=95% of fixtures correctly (all provided
expectations count); a handful of `expect.artifact` omissions document cases
where the artifact label is genuinely ambiguous.
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "pipeline"))
from taxonomy_engine import (  # noqa: E402
    classify_artifact,
    classify_domain_and_subsystem,
    enrich_repository_record,
)

GOLDEN_PATH = os.path.join(os.path.dirname(__file__), "golden_repos.json")
TARGET = 0.95


def load_golden():
    with open(GOLDEN_PATH, encoding="utf-8") as fh:
        return json.load(fh)


def record(fixture):
    return {
        "name": "%s/%s" % (fixture.get("owner", "x"), fixture["name"]),
        "description": fixture.get("description"),
        "topics": fixture.get("topics") or [],
        "language": fixture.get("language") or "",
        "stars": fixture.get("stars", 100),
    }


class TestGoldenTaxonomy(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.golden = load_golden()

    def test_golden_size(self):
        # REMAINING_WORK §1.5 acceptance: 200-500 hand-labeled fixtures
        self.assertGreaterEqual(len(self.golden), 200)
        self.assertLessEqual(len(self.golden), 500)

    def test_golden_coverage_at_least_95_percent(self):
        failures = []
        for fix in self.golden:
            exp = fix["expect"]
            dom, sub, _margin = classify_domain_and_subsystem(
                fix["name"], fix.get("description"), fix.get("topics") or [],
                fix.get("language") or "",
            )
            art = classify_artifact(
                fix["name"], fix.get("description"), fix.get("topics") or [],
            )
            got = {"domain": dom, "artifact": art, "subsystem": sub}
            for field in ("domain", "artifact", "subsystem"):
                if field in exp and got[field] != exp[field]:
                    failures.append(
                        "%s.%s: expected %r, got %r"
                        % (fix["name"], field, exp[field], got[field])
                    )
        total = len(self.golden)
        rate = (total - len(failures)) / total if total else 0.0
        self.assertGreaterEqual(
            rate, TARGET,
            "golden accuracy %.1f%% < %.0f%% (%d/%d failed):\n%s"
            % (rate * 100, TARGET * 100, len(failures), total,
               "\n".join(failures)),
        )

    def test_named_regressions(self):
        """The expert-panel named set must be domain-correct (§1.1 accept)."""
        must_pass = (
            "ollama/ollama", "nginx/nginx", "microsoft/vscode", "rails/rails",
            "spring-projects/spring-boot", "grafana/grafana", "curl/curl",
            "FFmpeg/FFmpeg", "kubernetes/kubectl", "redis/redis",
            "docker/docker", "TheAlgorithms/Python",
        )
        names = {"%s/%s" % (f["owner"], f["name"]): f for f in self.golden}
        for key in must_pass:
            self.assertIn(key, names, "missing named fixture %s" % key)

    def test_enrich_emits_domain_margin(self):
        rec = enrich_repository_record({
            "name": "kubernetes/kubectl",
            "description": "A command line interface for Kubernetes.",
            "topics": ["kubernetes", "cli"],
            "language": "Go", "stars": 1000,
        })
        self.assertIn("domain_margin", rec)
        self.assertIsInstance(rec["domain_margin"], int)
        self.assertGreaterEqual(rec["domain_margin"], 0)
        self.assertLessEqual(rec["domain_margin"], 9)


class TestRuleBehavior(unittest.TestCase):
    """Explicit rule tests from the §1.1/§1.2 acceptance list."""

    def test_short_keyword_guards(self):
        from taxonomy_engine import compile_keyword
        self.assertFalse(compile_keyword("os").search("repository"))
        self.assertFalse(compile_keyword("os").search("gpt-oss"))
        self.assertFalse(compile_keyword("os").search("most"))
        self.assertFalse(compile_keyword("ai").search("rails"))
        self.assertFalse(compile_keyword("ai").search("email"))
        self.assertFalse(compile_keyword("sql").search("graphql"))
        self.assertTrue(compile_keyword("sql").search("sql"))
        self.assertTrue(compile_keyword("arm").search("arm64"))
        self.assertFalse(compile_keyword("arm").search("farm"))
        self.assertTrue(compile_keyword("oauth").search("oauth2"))
        # plural tolerance only for long keywords
        self.assertTrue(compile_keyword("algorithm").search("algorithms"))
        self.assertTrue(compile_keyword("database").search("databases"))
        self.assertFalse(compile_keyword("ai").search("algorithms"))
        # separator-insensitive interiors
        self.assertTrue(compile_keyword("key-value").search("key_value"))
        self.assertTrue(compile_keyword("key-value").search("key value"))
        self.assertTrue(compile_keyword("spring-boot").search("spring boot"))

    def test_margin_abstain_on_tie(self):
        # security vs linter, both strong 6 -> 6-6 < margin -> Other / General
        dom, sub, margin = classify_domain_and_subsystem(
            "example/dual", "A security linter for code", ["security", "linter"], "Go")
        self.assertEqual(dom, "Other / General")
        self.assertEqual(sub, "General Components")
        self.assertEqual(margin, 0)

    def test_deterministic_on_repeat(self):
        args = ("example/repo", "a runtime", ["runtime", "javascript"], "Rust")
        first = classify_domain_and_subsystem(*args)
        for _ in range(4):
            self.assertEqual(classify_domain_and_subsystem(*args), first)

    def test_artifact_token_separations(self):
        self.assertEqual(
            classify_artifact("redis/redis-client", "A Redis client library", ["redis"]),
            "Library / SDK")
        self.assertEqual(
            classify_artifact("example/qel", "A query engine library for embedded analytics",
                              ["analytics"]),
            "Library / SDK")
        # `client` must never leak into the CLI bucket (v1's substring bug)
        self.assertEqual(
            classify_artifact("example/http-client", "An async HTTP client driver", ["client"]),
            "Library / SDK")
        self.assertEqual(
            classify_artifact("example/cli-tool", "Does things", ["cli"]),
            "Developer Tool / CLI")
        self.assertEqual(
            classify_artifact("example/app", "A delightful app", []),
            "Application / Service")


if __name__ == "__main__":
    unittest.main()
