"""Lists every item source that resolves to nothing, with its row count and a
guess at its group, for seeding source_packs.json by hand. Also lists the
entries that gained more than one source, to catch a prerequisite quest
written without parentheses. Runs the item and augment parsers over the
committed snapshot, against data/, without writing anything.

    python triage_sources.py
"""
import collections
import contextlib
import io
import os
import re

from bs4 import BeautifulSoup

from get_snapshot_path import get_snapshot_path
from item_sources import SourceResolver
from parse_item_augment_page import get_item_augments_from_page
from parse_items import get_items_from_page, include_page
from read_json import read_json

GROUP_GUESSES = (
    (r'ddo store|store', 'DDO Store'),
    (r'anniversary|crystal cove|mimic hunt|festivult|risia|snowpeaks|year of the dragon|night revels|event|harvest|hunt', 'Events'),
    (r'^(random|none|n/a|crafted|special event items|unknown)$', 'placeholder -> null'),
    (r'crafting|craft|forge|shard|catalyst|viktranium|altar|exchange|fragment', 'crafting -> pack or null'),
    (r'level|favor|reward', 'reward -> null'),
)


def guess_group(name):
    for pattern, group in GROUP_GUESSES:
        if re.search(pattern, name, re.I):
            return group
    return 'vendor/other -> ?'


def parse_everything(resolver, multi):
    """{source: an item or augment from it}, from the same rows the build reads."""
    examples = {}
    augments_page = get_snapshot_path('item_augments', 'Raw data_Item augments.html')
    augments = get_item_augments_from_page(BeautifulSoup(open(augments_page, encoding='utf-8').read(), 'html.parser'), resolver, multi)
    for system in augments.values():
        for option in system.get('*', []):
            for source in option.get('quests', []):
                examples.setdefault(source, option['name'])

    crafting = read_json('crafting')
    sets = read_json('sets')
    items_dir = get_snapshot_path('items')
    for page in sorted(os.listdir(items_dir)):
        if not include_page(page):
            continue
        # The parser announces every page; only the summary matters here.
        with contextlib.redirect_stdout(io.StringIO()):
            items = get_items_from_page(os.path.join(items_dir, page), crafting, sets, set(), resolver, multi)
        for item in items:
            for source in item.get('quests', []):
                examples.setdefault(source, item['name'])
    return examples


def main():
    resolver = SourceResolver.from_quests(read_json('quests'))
    multi = []
    examples = parse_everything(resolver, multi)

    print(f'{len(resolver.unresolved)} unresolved sources, {sum(resolver.unresolved.values())} rows\n')
    by_group = collections.defaultdict(list)
    for source, count in resolver.unresolved.items():
        by_group[guess_group(source)].append((count, source))
    for group, entries in sorted(by_group.items()):
        print(f'## {group}')
        for count, source in sorted(entries, reverse=True):
            print(f'  {count:5}  {source}    | e.g. {examples[source]}')
        print()

    print('## Entries with more than one source')
    for found, count in collections.Counter(tuple(found) for found in multi).most_common():
        print(f'  {count:5}  {" | ".join(found)}')


if __name__ == '__main__':
    main()
