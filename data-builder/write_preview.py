"""A preview of a data build, for checking scraper changes before they merge.

Collects everything the build wrote - the site's data/*.json and the
crafting-device cache - into one folder, with a git diff against the
checked-in versions and a Markdown summary. Wiki pages the build downloaded
that the committed snapshot doesn't have yet, or has an older copy of, are
copied in too, so a scraper can be checked against what the build fetched. The Data Auto Updater uploads
that folder when it runs on a branch instead of committing.
"""
import glob
import os
import shutil
import subprocess

from source_packs import SOURCE_PACKS_PATH
from get_output_path import get_output_path
from get_snapshot_path import SNAPSHOT_DIR


def get_build_outputs():
    """Every file a build writes, as absolute paths."""
    data_files = sorted(glob.glob(os.path.join(get_output_path(), '*.json')))
    return [os.path.abspath(path) for path in data_files + [SOURCE_PACKS_PATH]]


def get_new_snapshot_pages(repo_root):
    """Snapshot pages not in the committed snapshot, relative to the repo root."""
    snapshot = os.path.relpath(SNAPSHOT_DIR, repo_root)
    listing = _git(repo_root, 'ls-files', '--others', '--exclude-standard', '--', snapshot)
    return sorted(line for line in listing.splitlines() if line)


def get_changed_snapshot_pages(repo_root):
    """Committed snapshot pages the build downloaded a different copy of."""
    snapshot = os.path.relpath(SNAPSHOT_DIR, repo_root)
    listing = _git(repo_root, 'diff', '--name-only', '--diff-filter=M', '--', snapshot)
    return sorted(line for line in listing.splitlines() if line)


def _git(repo_root, *args):
    return subprocess.run(['git', *args], cwd=repo_root, capture_output=True, text=True, check=True).stdout


def write_preview(preview_dir, stats_description, title='Data preview'):
    outputs = get_build_outputs()
    repo_root = _git(os.path.dirname(SOURCE_PACKS_PATH), 'rev-parse', '--show-toplevel').strip()
    relative = [os.path.relpath(path, repo_root) for path in outputs]

    os.makedirs(preview_dir, exist_ok=True)
    for path, rel in zip(outputs, relative):
        destination = os.path.join(preview_dir, rel)
        os.makedirs(os.path.dirname(destination), exist_ok=True)
        shutil.copyfile(path, destination)

    new_pages = get_new_snapshot_pages(repo_root)
    changed_pages = get_changed_snapshot_pages(repo_root)
    for rel in new_pages + changed_pages:
        destination = os.path.join(preview_dir, rel)
        os.makedirs(os.path.dirname(destination), exist_ok=True)
        shutil.copyfile(os.path.join(repo_root, rel), destination)

    with open(os.path.join(preview_dir, 'data.diff'), 'w', encoding='utf8') as fh:
        fh.write(_git(repo_root, 'diff', '--', *relative))

    diff_stat = _git(repo_root, 'diff', '--stat', '--', *relative).rstrip() or 'No changes to checked-in files.'
    summary = (
        f'## {title}\n\n'
        'Not committed. The regenerated files and their full diff (`data.diff`) are in the preview folder.\n\n'
        f'{stats_description.rstrip()}\n\n'
        f'```\n{diff_stat}\n```\n'
    )
    if new_pages:
        summary += '\nNew wiki snapshot pages, copied into the preview:\n\n' + ''.join(f'- `{rel}`\n' for rel in new_pages)
    if changed_pages:
        summary += '\nChanged wiki snapshot pages, copied into the preview:\n\n' + ''.join(f'- `{rel}`\n' for rel in changed_pages)
    with open(os.path.join(preview_dir, 'summary.md'), 'w', encoding='utf8') as fh:
        fh.write(summary)

    print(f'Wrote data preview to {preview_dir}')
