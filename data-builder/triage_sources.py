"""Lists every item source that resolves to nothing, with its row count and a
guess at its group, for seeding source_packs.json by hand. Also lists the
entries that gained more than one source, to catch a prerequisite quest
written without parentheses. Reads the committed snapshot and data/.

    python triage_sources.py
"""
import collections
import os
import re

from bs4 import BeautifulSoup

from get_snapshot_path import get_snapshot_path
from item_sources import SourceResolver, extract_sources
from read_json import read_json
from source_packs import load_source_packs

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


def location_cells():
    """(cell, row text) for every item and augment row with a location column."""
    pages = [os.path.join(get_snapshot_path('items'), name) for name in sorted(os.listdir(get_snapshot_path('items')))]
    pages.append(get_snapshot_path('item_augments', 'Raw data_Item augments.html'))
    for page in pages:
        soup = BeautifulSoup(open(page, encoding='utf-8').read(), 'html.parser')
        for table in soup.find_all('table', class_='wikitable'):
            header = table.find('tr')
            headers = [cell.get_text(strip=True) for cell in header.find_all(['th', 'td'])] if header else []
            column = next((headers.index(name) for name in ('Location', 'Locations', 'Quest', 'Quests') if name in headers), None)
            if column is None:
                continue
            for row in table.find_all('tr')[1:]:
                cells = row.find_all('td', recursive=False)
                if len(cells) > column:
                    yield cells[column], row.get_text(' ', strip=True)


def main():
    quests = read_json('quests')
    resolver = SourceResolver(quests['packs'], quests.get('officialPacks', []), load_source_packs(), quests.get('freeSources', []))
    examples = {}
    multi = []
    for cell, row_text in location_cells():
        sources = extract_sources(cell, row_text, resolver.knows, multi)
        resolver.resolve_item(sources)
        for source in sources:
            examples.setdefault(source, cell.get_text(' ', strip=True)[:110])

    print(f'{len(resolver.unresolved)} unresolved sources, {sum(resolver.unresolved.values())} rows\n')
    by_group = collections.defaultdict(list)
    for source, count in resolver.unresolved.items():
        by_group[guess_group(source)].append((count, source))
    for group, entries in sorted(by_group.items()):
        print(f'## {group}')
        for count, source in sorted(entries, reverse=True):
            print(f'  {count:5}  {source}    | {examples[source]}')
        print()

    print('## Entries with more than one source')
    for found, count in collections.Counter(tuple(found) for found in multi).most_common():
        print(f'  {count:5}  {" | ".join(found)}')


if __name__ == '__main__':
    main()
