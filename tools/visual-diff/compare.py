"""Compare two capture.py runs pixel for pixel.

    python compare.py shots/baseline shots/after

Exits non-zero if any screenshot differs, is missing, or changed size, and
writes a highlighted diff image for each difference to <after>/diff/. For a
pure refactor the expected result is zero differing pixels - any diff is a
defect to explain, not noise to tolerate.
"""
import argparse
import sys
from pathlib import Path

from PIL import Image, ImageChops


def compare(before_dir: Path, after_dir: Path) -> int:
    diff_dir = after_dir / 'diff'
    before = {p.name for p in before_dir.glob('*.png')}
    after = {p.name for p in after_dir.glob('*.png')}
    failures = 0

    for name in sorted(before ^ after):
        print(f'MISSING  {name} (only in {"before" if name in before else "after"})')
        failures += 1

    for name in sorted(before & after):
        a = Image.open(before_dir / name).convert('RGB')
        b = Image.open(after_dir / name).convert('RGB')
        if a.size != b.size:
            print(f'SIZE     {name}: {a.size} -> {b.size}')
            failures += 1
            continue
        delta = ImageChops.difference(a, b)
        bbox = delta.getbbox()
        if bbox is None:
            continue
        changed = sum(1 for px in delta.getdata() if px != (0, 0, 0))
        print(f'DIFF     {name}: {changed} px in box {bbox}')
        failures += 1
        diff_dir.mkdir(exist_ok=True)
        # The after image dimmed, with every changed pixel in solid magenta.
        mask = delta.convert('L').point(lambda v: 255 if v else 0)
        highlight = Image.blend(b, Image.new('RGB', b.size, 'white'), 0.6)
        highlight.paste(Image.new('RGB', b.size, (255, 0, 255)), mask=mask)
        highlight.save(diff_dir / name)

    print(f'{len(before & after)} compared, {failures} differing')
    return failures


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('before', type=Path)
    parser.add_argument('after', type=Path)
    args = parser.parse_args()
    sys.exit(1 if compare(args.before, args.after) else 0)


if __name__ == '__main__':
    main()
