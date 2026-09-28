"""W5 F (O.6) pins: the legacy archive and the grep gate that fences it.

Nine reference-only harvest-era scripts moved from ``pipeline/`` to
``legacy/`` so ``pipeline/`` contains only live code.  These pins keep that
boundary honest:

* ``legacy/`` contains exactly those nine files plus its README;
* ``pipeline/`` contains none of them;
* outside ``legacy/`` and the docs tree, the only mentions of an archived
  file are pointers to its ``legacy/`` location (no live path references,
  no imports of archived modules);
* the README runbook never instructs running an archived script.

Self-safety: this file names every archived script, so it is exempt from its
own scan (the standard self-exemption used by the other guard tests).
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEGACY = ROOT / "legacy"
PIPELINE = ROOT / "pipeline"

# The nine reference-only files of W5 O.6 (ingest + eight harvesters/writers).
ARCHIVED = (
    "ingest.py",
    "harvest_scale.py",
    "backfill_worker.py",
    "scale_50k.py",
    "pack_index.py",
    "shard_manager.py",
    "harvest_20k.py",
    "harvest_phase1.py",
    "fast_harvest.py",
)
STEMS = tuple(name[: -len(".py")] for name in ARCHIVED)

SCAN_SUFFIXES = {".py", ".js", ".jsx", ".mjs", ".yml", ".yaml"}
SKIP_DIRS = {"__pycache__", "node_modules", "dist", ".git"}
SELF = Path(__file__).name


def iter_code_files():
    """Every scannable file in code trees + workflows, excluding this one."""
    bases = [ROOT / "pipeline", ROOT / "web", ROOT / "tests", ROOT / ".github"]
    for base in bases:
        if not base.exists():
            continue
        for file in sorted(base.rglob("*")):
            if (
                file.suffix in SCAN_SUFFIXES
                and file.is_file()
                and not (SKIP_DIRS & set(file.parts))
                and file.name != SELF
            ):
                yield file
    for file in sorted(ROOT.iterdir()):
        if file.suffix in SCAN_SUFFIXES and file.is_file() and file.name != SELF:
            yield file


class TestLegacyArchive(unittest.TestCase):
    def test_legacy_contains_exactly_the_nine_archived_files(self):
        actual = {p.name for p in LEGACY.iterdir() if p.is_file()}
        expected = set(ARCHIVED) | {"README.md"}
        self.assertEqual(
            actual, expected,
            f"legacy/ contents drifted: unexpected={sorted(actual - expected)}, "
            f"missing={sorted(expected - actual)}",
        )

    def test_pipeline_contains_only_live_code(self):
        offenders = [
            p.name for p in PIPELINE.iterdir()
            if p.is_file() and p.name in ARCHIVED
        ]
        self.assertEqual(
            offenders, [],
            f"archived scripts are back in pipeline/: {offenders}",
        )

    def test_no_references_outside_legacy_except_legacy_pointers(self):
        """No bare reference to an archived file outside legacy/ + docs.

        A mention is allowed only as an explicit ``legacy/<file>`` pointer
        (strip those, then nothing remains) and never as an import.
        """
        offenders = []
        for file in iter_code_files():
            text = file.read_text(encoding="utf-8", errors="replace")
            for name in ARCHIVED:
                stripped = text.replace(f"legacy/{name}", "")
                if name in stripped:
                    for lineno, line in enumerate(stripped.splitlines(), 1):
                        if name in line:
                            rel = file.relative_to(ROOT)
                            offenders.append(f"{rel}:{lineno}: {line.strip()[:110]}")
                stem = name[: -len(".py")]
                for match in re.finditer(
                    r"\b(?:import|from)\s+" + re.escape(stem) + r"\b", stripped
                ):
                    lineno = stripped[: match.start()].count("\n") + 1
                    rel = file.relative_to(ROOT)
                    offenders.append(
                        f"{rel}:{lineno}: import of archived module '{stem}'"
                    )
        self.assertEqual(
            offenders, [],
            "references to archived scripts outside legacy/ + docs "
            "(only 'legacy/<file>' pointers are allowed):\n  "
            + "\n  ".join(offenders),
        )

    def test_readme_runbook_only_instructs_live_scripts(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        # No runbook instruction may name an archived script.
        offenders = []
        for name in ARCHIVED:
            for lineno, line in enumerate(readme.splitlines(), 1):
                if re.search(r"python3\s+pipeline/" + re.escape(name), line):
                    offenders.append(f"README.md:{lineno}: {line.strip()[:110]}")
        self.assertEqual(
            offenders, [],
            f"README runbook still instructs archived scripts: {offenders}",
        )
        # The artefact table rows for moved scripts now point at legacy/.
        self.assertIn("| `legacy/", readme, "README table rows not moved to legacy/")
        self.assertIn("`legacy/README.md`", readme)

    def test_workflows_do_not_reference_archived_scripts(self):
        offenders = []
        for wf in sorted((ROOT / ".github" / "workflows").glob("*.yml")):
            text = wf.read_text(encoding="utf-8", errors="replace")
            for name in ARCHIVED:
                if name in text.replace(f"legacy/{name}", ""):
                    offenders.append(f"{wf.name}: mentions {name} not via legacy/")
        self.assertEqual(offenders, [], f"workflow references drifted: {offenders}")


if __name__ == "__main__":
    unittest.main()
