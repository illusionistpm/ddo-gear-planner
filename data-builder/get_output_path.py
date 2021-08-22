from pathlib import Path
import os

def get_output_path():
    path = f"{os.path.dirname(__file__)}/../site/src/assets"

    Path(path).mkdir(parents=True, exist_ok=True)

    return path


if __name__ == "__main__":
    print(f"Output path: {get_output_path()}")