"""A preview of a data build, for checking scraper changes before they merge.

Collects everything the build wrote - the site's data/*.json and the
crafting-device cache - into one folder, with a git diff against the
checked-in versions and a Markdown summary. The Data Auto Updater uploads
that folder when it runs on a branch instead of committing.
"""
import glob
import os
import shutil
import subprocess

from crafting_device_packs import DEVICE_PACKS_PATH
from get_output_path import get_output_path


def get_build_outputs():
    """Every file a build writes, as absolute paths."""
    data_files = sorted(glob.glob(os.path.join(get_output_path(), '*.json')))
    return [os.path.abspath(path) for path in data_files + [DEVICE_PACKS_PATH]]


def _git(repo_root, *args):
    return subprocess.run(['git', *args], cwd=repo_root, capture_output=True, text=True, check=True).stdout


def write_preview(preview_dir, stats_description, title='Data preview'):
    outputs = get_build_outputs()
    repo_root = _git(os.path.dirname(DEVICE_PACKS_PATH), 'rev-parse', '--show-toplevel').strip()
    relative = [os.path.relpath(path, repo_root) for path in outputs]

    os.makedirs(preview_dir, exist_ok=True)
    for path, rel in zip(outputs, relative):
        destination = os.path.join(preview_dir, rel)
        os.makedirs(os.path.dirname(destination), exist_ok=True)
        shutil.copyfile(path, destination)

    with open(os.path.join(preview_dir, 'data.diff'), 'w', encoding='utf8') as fh:
        fh.write(_git(repo_root, 'diff', '--', *relative))

    diff_stat = _git(repo_root, 'diff', '--stat', '--', *relative).rstrip() or 'No changes to checked-in files.'
    summary = (
        f'## {title}\n\n'
        'Not committed. The full diff (`data.diff`) and every regenerated file are in this folder.\n\n'
        f'{stats_description.rstrip()}\n\n'
        f'```\n{diff_stat}\n```\n'
    )
    with open(os.path.join(preview_dir, 'summary.md'), 'w', encoding='utf8') as fh:
        fh.write(summary)

    print(f'Wrote data preview to {preview_dir}')
