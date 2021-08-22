import tempfile
from pathlib import Path

def get_output_path():
    path = f"{tempfile.gettempdir()}/ddo-gear-planner-data-build"

    Path(path).mkdir(parents=True, exist_ok=True)

    return path


if __name__ == "__main__":
    print(f"Output path: {get_output_path()}")