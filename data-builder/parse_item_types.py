from bs4 import BeautifulSoup
import requests
import os
import re
import json
import collections
from roman_numerals import int_from_roman_numeral
from write_json import write_json
from read_json import read_json
from download_wiki_pages import get_item_type_urls

def get_item_categories_from_page(soup):

    table = soup.find(id='bodyContent').find(id='mw-content-text').find('div').find('table', class_="wikitable").find('tbody')

    rows = table.find_all('tr', recursive=False)

    # For some reason, the header is showing up as a row
    rows.pop(0)

    categories = []

    for row in rows:
        fields = row.find_all('td', recursive=False)


        categories.append(fields[0].getText().strip())

    return categories

# Modify the existing items list to add the artifact tag
def parse_item_types():
    items = read_json('items')

    types = list(set([item['type'] for item in items]))
    types = [type for type in types if 'items' not in type.lower()]
    types.sort()
    types = {type: {'attributes': []} for type in types}

    for item_type_page in get_item_type_urls():
        page = open(f'./cache/item_types/{item_type_page}.html', "r", encoding='utf-8').read()

        attribute = re.search(r'Basic_([\-a-z]+)_weapons', item_type_page).group(1)

        soup = BeautifulSoup(page, 'html.parser')

        item_cats = get_item_categories_from_page(soup)

        for cat in item_cats:
            # Hack: try to match plurals against singulars
            attempts = [cat, f"{cat}s", f"{cat}es"]
            for attempt in attempts:
                if attempt in types:
                    cat = attempt

            if cat == 'Unarmed':
                cat = 'Handwraps'

            # Composite Long/Show bows aren't actually used it seems
            if cat.startswith('Composite'):
                continue

            # Add sanity check to help during development
            if cat not in types:
                continue

            types[cat]['attributes'].append(attribute)

            # Light weapons are always also one-handed
            if attribute in ['light', 'thrown']:
                types[cat]['attributes'].append('one-handed')

            if attribute == 'ranged':
                types[cat]['attributes'].append('two-handed')

            if attribute not in ['ranged', 'thrown']:
                types[cat]['attributes'].append('melee')

    for type in types.keys():
        if len(types[type]['attributes']) > 0:
            types[type]['attributes'].append('weapon')
        elif 'armor' in type.lower() or 'docents' == type.lower():
            types[type]['attributes'].append('armor')
        else:
            types[type]['attributes'].append('offhand')

    write_json(types, 'item-types')


if __name__ == "__main__":
    parse_item_types()
