from bs4 import BeautifulSoup
import re
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

def parse_item_types():
    def normalize_category(cat):
        if cat == 'Unarmed':
            return 'Handwraps'

        if cat.endswith(('s', 'x', 'z', 'ch', 'sh')):
            return f"{cat}es"

        if re.search(r'[^aeiou]y$', cat):
            return f"{cat[:-1]}ies"

        return f"{cat}s"

    types = {}

    for item_type_page in get_item_type_urls():
        page = open(f'./cache/item_types/{item_type_page}.html', "r", encoding='utf-8').read()

        attribute = re.search(r'Basic_([\-a-z]+)_weapons', item_type_page).group(1)

        soup = BeautifulSoup(page, 'html.parser')

        item_cats = get_item_categories_from_page(soup)

        for cat in item_cats:
            if cat.startswith('Composite'):
                continue

            cat = normalize_category(cat)
            types.setdefault(cat, {'attributes': []})
            types[cat]['attributes'].append(attribute)

            # Light weapons are always also one-handed
            if attribute in ['light', 'thrown']:
                types[cat]['attributes'].append('one-handed')

            if attribute == 'ranged':
                types[cat]['attributes'].append('two-handed')

            if attribute not in ['ranged', 'thrown']:
                types[cat]['attributes'].append('melee')

    # Preserve all item categories from the item list so shields and other valid item types remain present.
    items = read_json('items')
    for item in items:
        item_type = item['type']
        types.setdefault(item_type, {'attributes': []})

    offhand_types = {
        'bucklers',
        'small shields',
        'large shields',
        'tower shields',
        'orbs',
        'rune arms',
    }

    for type_name in types.keys():
        attributes = types[type_name]['attributes']
        if not attributes:
            if 'armor' in type_name.lower() or 'docents' == type_name.lower():
                types[type_name]['attributes'] = ['armor']
            elif type_name.lower() in offhand_types:
                types[type_name]['attributes'] = ['offhand']
            else:
                types[type_name]['attributes'] = []
            continue

        if any(attribute in {'light', 'one-handed', 'two-handed', 'melee', 'ranged', 'thrown'} for attribute in attributes):
            attributes.append('weapon')
        elif 'armor' in type_name.lower() or 'docents' == type_name.lower():
            attributes.append('armor')
        elif type_name.lower() in offhand_types:
            attributes.append('offhand')

    write_json(types, 'item-types')


if __name__ == "__main__":
    parse_item_types()
