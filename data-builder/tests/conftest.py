import os
import sys

# Ensure the parent data-builder directory is importable for tests
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
