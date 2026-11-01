from download_wiki_pages import download_wiki_pages, clear_wiki_snapshot
from parse_set_page import parse_set_page
from parse_item_augment_page import parse_item_augment_page
from parse_items import parse_items
from parse_minor_artifacts import parse_minor_artifacts
from parse_essence_crafting import parse_essence_crafting
from build_affix_groups import build_affix_groups
from build_crafting import build_crafting
from build_synonyms import build_synonyms
from build_url_codec_dictionary import build_url_codec_dictionary
from get_data_stats import get_data_stats, diff_data_stats, get_data_stats_description, check_stats_thresholds
import argparse
from get_output_path import get_output_path
from get_snapshot_path import get_snapshot_path
from parse_item_types import parse_item_types
import requests
from parse_quests import parse_quests
import subprocess
import sys
import os
from datetime import datetime, timezone

from write_json import write_json
from write_preview import write_preview

DATA_BUILDER_DIR = os.path.dirname(os.path.abspath(__file__))


def ensure_data_builder_cwd():
    os.chdir(DATA_BUILDER_DIR)


def write_build_info():
    write_json({
        'builtAt': datetime.now(timezone.utc).isoformat(timespec='seconds')
    }, 'build-info')


def build_data(clearSnapshot, discordURL, previewDir=None, offline=False):
    ensure_data_builder_cwd()

    if offline and not os.path.isdir(get_snapshot_path()):
        print(f"--offline needs the committed wiki snapshot, and '{get_snapshot_path()}' doesn't exist.")
        raise SystemExit(1)

    # Run unit tests first; fail the build if tests fail.
    try:
        print('Running unit tests...')
        tests_dir = os.path.join(DATA_BUILDER_DIR, 'tests')
        test_env = os.environ.copy()
        test_env.pop('DDO_AFFIX_PROVENANCE', None)
        result = subprocess.run([sys.executable, '-m', 'pytest', tests_dir, '-q'], env=test_env)
        if result.returncode != 0:
            print('Unit tests failed. Aborting data build.')
            raise SystemExit(result.returncode)
        print('Unit tests passed.')
    except FileNotFoundError:
        # If pytest isn't available, surface a clear error
        print('pytest not found in environment. Ensure dependencies are installed.')
        raise

    oldStats = get_data_stats()

    if offline:
        print('#### Offline: building from the committed wiki snapshot')
    else:
        if clearSnapshot:
            clear_wiki_snapshot()

        download_wiki_pages()

        print('#### Download complete. Beginning data build')
    print(f"### Writing to '{get_output_path()}")
    build_synonyms()

    parse_essence_crafting()
    build_affix_groups()

    parse_set_page()
    parse_quests()

    # some crafting depends on the existence of sets
    # make sure to process crafting loop after sets
    build_crafting()

    parse_item_augment_page()
    parse_items()
    parse_minor_artifacts()

    parse_item_types()
    build_url_codec_dictionary()

    # builtAt records when the snapshot was fetched. An offline rebuild of the
    # same snapshot keeps it, so it reproduces data/ byte for byte.
    if not offline:
        write_build_info()

    newStats = get_data_stats()

    diffStats = diff_data_stats(newStats, oldStats)

    diffStr = get_data_stats_description(newStats, diffStats)

    # Before the threshold check, so a build it aborts still leaves its
    # output to inspect.
    if previewDir:
        write_preview(previewDir, diffStr)

    thresholdViolations = check_stats_thresholds(newStats, oldStats)
    if thresholdViolations:
        print('Data stats dropped more than expected compared to the previous build:')
        for violation in thresholdViolations:
            print(f" - {violation}")
        print('Aborting data build. If this drop is expected, investigate the parser output before re-running.')
        raise SystemExit(1)

    # A preview is not a published data change.
    if discordURL and not previewDir:
        message = "Data Changes:\n"
        message += diffStr

        requests.post(discordURL, data =
        {
            'content': message
        })


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--clear-snapshot', default=False, action='store_true',
                      help='delete wiki-snapshot/ and download every page again')
    mode.add_argument('--offline', default=False, action='store_true',
                      help='build from the committed wiki-snapshot/ without contacting the wiki')
    parser.add_argument('--discord')
    parser.add_argument('--preview-dir', help='write the build output, a diff and a summary here; skips Discord')
    args = parser.parse_args()

    # build_data changes into data-builder/, so resolve this first.
    previewDir = os.path.abspath(args.preview_dir) if args.preview_dir else None
    build_data(args.clear_snapshot, args.discord, previewDir, offline=args.offline)
