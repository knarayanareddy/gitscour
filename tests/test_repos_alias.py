"""W5 O.4 — the `repos.json` 63 MB twin is gone.

`web/public/repos.json` was a byte-identical copy of `catalog-index.json`
(verified with `cmp` at W5 baseline): 63 MB rewritten into git on every
backfill for zero distinct readers.  This suite pins the removal:

  * the file is absent from the shipped artifacts;
  * `verify_catalog` still passes with the fallback-index parity covering
    `catalog-index.json` alone;
  * no code path outside the nine legacy-bound files (moving to ``legacy/``
    in W5 F) mentions the removed name.

Matching note: `(?<![A-Za-z0-9_])repos\\.json\\b` deliberately ignores
``raw_repos.jsonl`` (harvest output), ``evanli_repos.json`` and
``graphql_gap_repos.json`` (legacy inputs) — different files.

    python3 -m unittest discover -s tests -q   (stdlib gate)
    python3 -m pytest tests/ -q                (CI gate)
"""

from __future__ import annotations

import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "web" / "public"

# W5 F moved every reference-only harvester/artefact writer to legacy/, so
# nothing under the scanned trees mentions the twin any more; the grep-pin is
# now absolute (kept empty deliberately — tests/test_legacy_archive.py pins the
# archive itself).
LEGACY_BOUND = set()

TWIN_NAME = re.compile(r"(?<![A-Za-z0-9_])repos\.json\b")
CODE_SUFFIXES = {".py", ".js", ".jsx", ".mjs"}

# This file must name the twin to forbid it (absence + stdout assertions), so
# it is exempt from its own scan — the standard self-scan exemption. Explanatory
# code lines elsewhere keep the real name behind a visible `# twin-name-ok`
# marker instead of being reworded into vagueness.
SCAN_EXEMPT = {Path(__file__).name}


def iter_code_files():
    for base in (ROOT / "pipeline", ROOT / "web" / "src", ROOT / "tests", ROOT / "web"):
        if not base.exists():
            continue
        for file in sorted(base.rglob("*")):
            if file.suffix not in CODE_SUFFIXES or not file.is_file():
                continue
            if "__pycache__" in file.parts or "node_modules" in file.parts:
                continue
            if file.name in SCAN_EXEMPT:
                continue
            yield file


class TestTwinRemoved(unittest.TestCase):
    def test_alias_file_absent(self):
        self.assertFalse(
            (PUBLIC / "repos.json").exists(),
            "web/public/repos.json is back — W5 O.4 removed the byte-identical twin",
        )

    def test_verify_catalog_passes_over_index_alone(self):
        proc = subprocess.run(
            [sys.executable, str(ROOT / "pipeline" / "verify_catalog.py"),
             "--base-dir", str(PUBLIC)],
            capture_output=True, text=True, timeout=300,
        )
        self.assertEqual(
            proc.returncode, 0,
            f"verify_catalog failed without the alias\nstdout:\n{proc.stdout}\n"
            f"stderr:\n{proc.stderr}",
        )
        self.assertIn("catalog-index.json", proc.stdout)
        self.assertNotIn("repos.json", proc.stdout.replace("raw_repos.jsonl", ""))

    def test_no_live_references_outside_legacy_bound_files(self):
        offenders = []
        for file in iter_code_files():
            if file.name in LEGACY_BOUND:
                continue
            for lineno, line in enumerate(
                file.read_text(encoding="utf-8", errors="replace").splitlines(), 1
            ):
                if "twin-name-ok" in line:
                    continue  # reviewed, visible suppression on explanatory lines
                if TWIN_NAME.search(line):
                    rel = file.relative_to(ROOT)
                    offenders.append(f"{rel}:{lineno}: {line.strip()[:110]}")
        self.assertEqual(
            offenders, [],
            "code outside the W5-F legacy archive set still references the "
            "removed twin:\n  " + "\n  ".join(offenders),
        )

    def test_allowlist_exactly_matches_remaining_mentions(self):
        # The allowlist must track reality: every legacy-bound file still
        # mentions the twin today, and nothing else may. After W5 F moves the
        # archive out of pipeline/, `actual` becomes empty and this assertion
        # forces LEGACY_BOUND to be emptied in the same commit (the grep-pin
        # then becomes absolute).
        actual = set()
        for file in iter_code_files():
            text = file.read_text(encoding="utf-8", errors="replace")
            if any(TWIN_NAME.search(line) and "twin-name-ok" not in line
                   for line in text.splitlines()):
                actual.add(file.name)
        self.assertEqual(
            actual, LEGACY_BOUND,
            f"allowlist drift: actual referencers={sorted(actual)}, "
            f"LEGACY_BOUND={sorted(LEGACY_BOUND)}",
        )


if __name__ == "__main__":
    unittest.main()
