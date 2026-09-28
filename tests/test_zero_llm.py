"""W5 section 5 — zero-LLM guardrail pins (pipeline/check_zero_llm.py).

Enforces the standing constraint: no provider SDK wiring anywhere in the
scanned trees.  Two layers run in CI: the workflow step (both workflows, next
to verify_catalog) and this unit test inside the pytest/unittest lane.

Triggers are assembled by string concatenation at runtime so this file itself
never contains a matching call form — the clean-tree test scans tests/ too.

    python3 -m unittest discover -s tests -q   (stdlib gate)
    python3 -m pytest tests/ -q                (CI gate)
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import check_zero_llm as z  # noqa: E402

# Assembled at runtime: the source bytes never form a matching line.
SDK_IMPORT = "import " + "openai"
SDK_REQUIRE = "require(" + "'openai')"
SDK_CONSTRUCTOR = "OpenAI" + "("
SITE = "api." + "openai" + ".com"
GENAI_SITE = "generative" + "language" + ".googleapis.com"


class TestCleanTree(unittest.TestCase):
    def test_repository_sources_are_clean(self):
        hits = z.scan([ROOT / "pipeline", ROOT / "web" / "src", ROOT / "tests"])
        self.assertEqual(
            hits, [],
            "zero-LLM violation(s):\n" +
            "\n".join(f"  {v.path}:{v.lineno} [{v.rule}] {v.snippet}" for v in hits),
        )

    def test_default_cli_is_clean(self):
        self.assertEqual(z.main([]), 0)


class TestDetection(unittest.TestCase):
    def _one(self, text, rule):
        hits = z.scan_text(text, "fixture")
        self.assertEqual(len(hits), 1, f"expected exactly one hit in {text!r}: {hits}")
        self.assertEqual(hits[0].rule, rule)
        self.assertEqual(hits[0].lineno, 1)

    def test_sdk_import_line(self):
        self._one(SDK_IMPORT + " as client", "sdk-import")

    def test_sdk_require_call(self):
        self._one("const c = " + SDK_REQUIRE, "sdk-import")

    def test_constructor_call(self):
        self._one("client = " + SDK_CONSTRUCTOR + ")", "sdk-constructor")

    def test_provider_site(self):
        self._one("url = 'https://" + SITE + "/v1'", "provider-site")

    def test_genai_site(self):
        self._one("url = 'https://" + GENAI_SITE + "/v1beta'", "provider-site")

    def test_flagged_even_in_commented_code(self):
        # Strict by design: commented-out wiring is still wiring intent —
        # delete it instead of parking it in a comment.
        self._one("# " + SDK_IMPORT, "sdk-import")

    def test_reports_lineno(self):
        hits = z.scan_text("clean line\n" + SDK_IMPORT, "fixture")
        self.assertEqual(hits[0].lineno, 2)


class TestLexiconStringsAllowed(unittest.TestCase):
    """Static lexicons name providers legitimately; call forms are the gate."""

    def test_compat_rule_labels_pass(self):
        text = "RULES = [\n  ['OpenAI API Compatible', /openai api|openai-compatible|chat completions/i],\n]\n"
        self.assertEqual(z.scan_text(text, "lexicon"), [])

    def test_taxonomy_term_lists_pass(self):
        text = "TERMS = {'gpt-4', 'langchain templates', 'openai compatible tools'}\n"
        self.assertEqual(z.scan_text(text, "lexicon"), [])

    def test_prose_passes(self):
        text = "The scanner never calls a hosted model; everything stays local.\n"
        self.assertEqual(z.scan_text(text, "prose"), [])

    def test_regex_word_boundary_form_passes(self):
        text = "r'\\b" + "openai" + "\\b|\\b" + "gpt" + "\\b'  # lexicon\n"
        self.assertEqual(z.scan_text(text, "lexicon"), [])


class TestCLI(unittest.TestCase):
    def test_exit_1_on_violation_and_0_clean(self):
        with tempfile.TemporaryDirectory() as tmp:
            bad = Path(tmp) / "bad.py"
            bad.write_text(SDK_IMPORT + "\n", encoding="utf-8")
            proc = subprocess.run(
                [sys.executable, str(ROOT / "pipeline" / "check_zero_llm.py"), str(bad)],
                capture_output=True, text=True, timeout=60,
            )
            self.assertEqual(proc.returncode, 1, proc.stdout + proc.stderr)
            self.assertIn("sdk-import", proc.stdout)

            good = Path(tmp) / "good.py"
            good.write_text("x = 1  # fully local\n", encoding="utf-8")
            proc = subprocess.run(
                [sys.executable, str(ROOT / "pipeline" / "check_zero_llm.py"), str(good)],
                capture_output=True, text=True, timeout=60,
            )
            self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
            self.assertIn("clean", proc.stdout)


if __name__ == "__main__":
    unittest.main()
