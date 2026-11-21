import os
import sys

# Ensure the parent data-builder directory is importable for tests
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))


import pytest  # noqa: E402

import provenance_io  # noqa: E402


@pytest.fixture(autouse=True)
def _no_leftover_tooltip_capture():
    """A test that runs build_data mustn't leave capture on: later tests' affixes would grow provenance keys."""
    yield
    provenance_io.stop_tooltip_capture()
