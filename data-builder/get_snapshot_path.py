import os

# The downloaded wiki pages that data/ is built from. Committed, so the build
# can be rerun against the same pages without reaching the wiki.
SNAPSHOT_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', 'wiki-snapshot'))


def get_snapshot_path(*parts: str) -> str:
    return os.path.join(SNAPSHOT_DIR, *parts)


if __name__ == "__main__":
    print(f"Snapshot path: {get_snapshot_path()}")
