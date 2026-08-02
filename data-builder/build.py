from download_wiki_pages import download_wiki_pages, clear_wiki_cache
from parse_set_page import parse_set_page
from parse_item_augment_page import parse_item_augment_page
from parse_items import parse_items
from parse_minor_artifacts import parse_minor_artifacts
from parse_essence_crafting import parse_essence_crafting
from build_affix_groups import build_affix_groups
from build_crafting import build_crafting
from build_synonyms import build_synonyms
from get_data_stats import get_data_stats, diff_data_stats, get_data_stats_description
import argparse
from get_output_path import get_output_path
from parse_item_types import parse_item_types
import requests
from parse_quests import parse_quests
import subprocess
import sys
import os
from datetime import datetime, timezone

from write_json import write_json

DATA_BUILDER_DIR = os.path.dirname(os.path.abspath(__file__))


def ensure_data_builder_cwd():
    os.chdir(DATA_BUILDER_DIR)


def write_build_info():
    write_json({
        'builtAt': datetime.now(timezone.utc).isoformat(timespec='seconds')
    }, 'build-info')


def build_data(clearCache, discordURL):
    ensure_data_builder_cwd()

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

    if clearCache:
        clear_wiki_cache()

    download_wiki_pages()

    print('#### Download complete. Beginning data build')
    print(f"### Writing to '{get_output_path()}")
    build_synonyms()

    parse_essence_crafting()
    build_affix_groups()

    parse_set_page()

    # some crafting depends on the existence of sets
    # make sure to process crafting loop after sets
    build_crafting()

    parse_item_augment_page()
    parse_items()
    parse_minor_artifacts()

    parse_item_types()

    parse_quests()

    write_build_info()

    newStats = get_data_stats()

    diffStats = diff_data_stats(newStats, oldStats)

    diffStr = get_data_stats_description(newStats, diffStats)

    if discordURL:
        message = "Data Changes:\n"
        message += diffStr

        requests.post(discordURL, data =
        {
            'content': message
        })


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--clear-cache', default=False, action='store_true')
    parser.add_argument('--discord')
    args = parser.parse_args()

    build_data(args.clear_cache, args.discord)
