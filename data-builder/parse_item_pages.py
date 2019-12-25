from bs4 import BeautifulSoup
import requests
import os
import re
import json
import collections

def add_cat_to_map(catMap, slot, array):
    for category in array:
        catMap[category] = slot

def build_cat_map():
    catMap = collections.defaultdict(lambda: 'Weapon')

    add_cat_to_map(catMap, 'Armor', ['Cloth armor', 'Heavy armor', 'Medium armor', 'Light armor', 'Cloth armor', 'Docents'])
    add_cat_to_map(catMap, 'Offhand', ['Bucklers', 'Small shields', 'Large shields', 'Tower shields', 'Orbs', 'Rune arms'])
    add_cat_to_map(catMap, 'Helm', ['Head items'])
    add_cat_to_map(catMap, 'Goggles', ['Eye items'])
    add_cat_to_map(catMap, 'Cloak', ['Back items'])
    add_cat_to_map(catMap, 'Belt', ['Waist items'])
    add_cat_to_map(catMap, 'Boots', ['Feet items'])
    add_cat_to_map(catMap, 'Bracers', ['Wrist items'])
    add_cat_to_map(catMap, 'Gloves', ['Hand items'])
    add_cat_to_map(catMap, 'Necklace', ['Neck  items'])
    add_cat_to_map(catMap, 'Ring', ['Finger items'])
    add_cat_to_map(catMap, 'Trinket', ['Trinket items'])
    add_cat_to_map(catMap, 'Collar', ['Collars'])

    return catMap

        
def get_items_from_page(itemPageURL):
    print("Parsing " + itemPageURL)
    page = open(itemPageURL, "r", encoding='utf-8').read()

    soup = BeautifulSoup(page, 'html.parser')

    title = soup.find(id='firstHeading').getText()
    category = title.split(':')[-1]

    cols = {}

    items = []

    table = soup.find(id='bodyContent').find(id='mw-content-text').find('div').find('table', class_="wikitable").find('tbody')
    for idx, col in enumerate(table.find_all('th')):
        cols[col.getText().strip()] = idx

    rows = table.find_all('tr', recursive=False)

    # For some reason, the header is showing up as a row
    rows.pop(0)

    catMap = build_cat_map()

    for row in rows:
        item = {}
        item['category'] = category
        item['slot'] = catMap[category]

        fields = row.find_all('td', recursive=False)

        item['name'] = fields[cols['Item']].find('a').getText().strip()
        item['ml'] = fields[cols['ML']].getText().strip()
        item['affixes'] = []

        affixesIdx = cols['Enchantments'] if 'Enchantments' in cols else cols['Special Abilities']
        cell = fields[affixesIdx]

        if cell.find('ul'):
            affixes = cell.find('ul').find_all('li', recursive=False)
            for affix in affixes:
                aff = {}

                affixName = affix.find('a').getText() if affix.find('a') else affix.getText()

                affixNameSearch = re.search(r'(.*) \+([0-9]+)%?', affixName)
                if affixNameSearch:
                    aff['name'] = affixNameSearch.group(1)
                    aff['value'] = affixNameSearch.group(2)
                else:
                    aff['name'] = affixName

                # Ignore the tooltip for augment slots
                if not 'Augment Slot' in aff['name']:
                    tooltip = affix.find('span', class_='tooltip')
                    if tooltip:
                        words = str(tooltip)
                        bonusTypeSearch = re.search('([a-z]+) bonus', words, re.IGNORECASE)
                        if bonusTypeSearch:
                            aff['bonusType'] = bonusTypeSearch.group(1)

                item['affixes'].append(aff)
        else:
            item['affixes'].append({'name': cell.getText()})
            

        items.append(item)

    return items





cachePath = "./cache/"
items = []
for file in os.listdir(cachePath):
    items.extend(get_items_from_page(cachePath + file))

out = json.dumps(items, sort_keys=True, indent=4)
open("../site/src/assets/items.json", 'w', encoding='utf8').write(out)