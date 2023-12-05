from download_wiki_pages import download_wiki_pages, clear_wiki_cache
from parse_set_page import parse_set_page
from parse_items import parse_items
from parse_minor_artifacts import parse_minor_artifacts
from parse_cannith import parse_cannith
from build_affix_groups import build_affix_groups
from build_crafting import build_crafting
from build_synonyms import build_synonyms
from get_data_stats import get_data_stats, diff_data_stats, get_data_stats_description
import argparse
from get_output_path import get_output_path
from parse_item_types import parse_item_types
import requests
from parse_quests import parse_quests

def build_data(clearCache, discordURL):
    oldStats = get_data_stats()

    if clearCache:
        clear_wiki_cache()

    download_wiki_pages()

    print('#### Download complete. Beginning data build')
    print(f"### Writing to '{get_output_path()}")
    build_synonyms()

    parse_cannith()
    build_affix_groups()
    build_crafting()

    parse_set_page()
    parse_items()
    parse_minor_artifacts()

    parse_item_types()

    parse_quests()
 
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