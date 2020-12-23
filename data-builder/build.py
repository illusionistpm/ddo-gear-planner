from download_wiki_pages import download_wiki_pages, clear_wiki_cache
from parse_set_page import parse_set_page
from parse_item_pages import parse_item_pages
from parse_cannith import parse_cannith
from build_affix_groups import build_affix_groups
from build_crafting import build_crafting
from build_synonyms import build_synonyms
from get_data_stats import get_data_stats, diff_data_stats, get_data_stats_description
import argparse

def build_data(clearCache):
    oldStats = get_data_stats()

    if clearCache:
        clear_wiki_cache()

    download_wiki_pages()

    print('#### Download complete. Beginning data build')
    parse_set_page()
    parse_item_pages()
    parse_cannith()

    build_affix_groups()
    build_synonyms()
    build_crafting()

    newStats = get_data_stats()

    diffStats = diff_data_stats(newStats, oldStats)

    diffStr = get_data_stats_description(newStats, diffStats)

    print("\nData Changes:\n")
    print(diffStr)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--clear-cache', default=False, action=argparse.BooleanOptionalAction)
    args = parser.parse_args()

    build_data(args.clear_cache)