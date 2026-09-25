"""W4 §3.8 — unit pins for web/src/synergy-core.mjs.

The scoring core is JavaScript, so the assertions live in
tests/test_synergy_core.mjs and run under `node` (same runtime as the UI
bundle). This wrapper folds them into the standard unittest gate:

  * G1 — score = mean over pairs (2-slot and 6-slot comparable)
  * G3 — protocol matrix derived from COMPATIBILITY_RULES labels
  * G5 — same language alone never yields "High Synergy"

Skipped (not failed) when node is unavailable; the web build + smoke gate
still exercises the same module in that case.
"""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")


@unittest.skipUnless(NODE, "node is required to run the JS synergy-core tests")
class TestSynergyCore(unittest.TestCase):
    def test_synergy_core_pins(self):
        proc = subprocess.run(
            [NODE, str(ROOT / "tests" / "test_synergy_core.mjs")],
            capture_output=True,
            text=True,
            cwd=str(ROOT),
            timeout=120,
        )
        self.assertEqual(
            proc.returncode, 0,
            f"synergy-core assertions failed\nstdout:\n{proc.stdout}\nstderr:\n{proc.stderr}",
        )
        self.assertIn("SYNERGY_CORE_OK", proc.stdout)


if __name__ == "__main__":
    unittest.main()
