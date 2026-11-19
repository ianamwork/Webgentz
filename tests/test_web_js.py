"""Run the web/ JavaScript tests (tests/js/) with Node's built-in test runner."""

import os
import shutil
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NODE = shutil.which("node")


@unittest.skipIf(NODE is None, "node not on PATH; skipping JS tests")
class WebJsTests(unittest.TestCase):
    def test_node_suite(self):
        proc = subprocess.run(
            # Node expands the glob itself (newer Node rejects a bare directory).
            [NODE, "--test", "tests/js/*.test.mjs"],
            cwd=ROOT, capture_output=True, text=True, timeout=120,
        )
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)


if __name__ == "__main__":
    unittest.main()
