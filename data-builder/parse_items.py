from bs4 import BeautifulSoup
import requests
import os
import re
import json
import collections
from roman_numerals import int_from_roman_numeral
from write_json import write_json
from read_json import read_json
from parse_affixes_from_cell import parse_affixes_from_cell, get_fake_bonuses
from get_inverted_synonym_map import get_inverted_synonym_map

def include_page(fileName):
    return not fileName.startswith('Collars')


def add_cat_to_map(catMap, slot, array):
    for category in array:
        catMap[category] = slot


def build_cat_map():
    catMap = collections.defaultdict(lambda: 'Weapon')

    add_cat_to_map(catMap, 'Armor', ['Cloth armor', 'Heavy armor', 'Medium armor', 'Light armor', 'Cloth armor', 'Docents'])
    add_cat_to_map(catMap, 'Offhand', ['Bucklers', 'Small shields', 'Large shields', 'Tower shields', 'Orbs', 'Rune Arms'])
    add_cat_to_map(catMap, 'Helm', ['Head items'])
    add_cat_to_map(catMap, 'Goggles', ['Eye items'])
    add_cat_to_map(catMap, 'Cloak', ['Back items'])
    add_cat_to_map(catMap, 'Belt', ['Waist items'])
    add_cat_to_map(catMap, 'Boots', ['Feet items'])
    add_cat_to_map(catMap, 'Bracers', ['Wrist items'])
    add_cat_to_map(catMap, 'Gloves', ['Hand items'])
    add_cat_to_map(catMap, 'Necklace', ['Neck items'])
    add_cat_to_map(catMap, 'Ring', ['Finger items'])
    add_cat_to_map(catMap, 'Trinket', ['Trinket items'])
    add_cat_to_map(catMap, 'Collar', ['Collars'])
    add_cat_to_map(catMap, 'Quiver', ['Quiver items'])

    return catMap


def get_items_from_page(itemPageURL, sets):
    synonymMap = get_inverted_synonym_map()

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

    for q in ['Location', 'Quest', 'Quests']:
        if q in cols:
            questIdx = cols[q]

    # For some reason, the header is showing up as a row
    rows.pop(0)

    catMap = build_cat_map()

    craftingSystems = list(read_json('crafting').keys())
    craftingSystems.extend(['Green Augment Slot', 'Purple Augment Slot', 'Orange Augment Slot'])

    fakeBonuses = get_fake_bonuses()

    for row in rows:
        item = {}
        item['type'] = category
        item['slot'] = catMap[category]

        fields = row.find_all('td', recursive=False)

        itemLink = fields[cols['Item']].find('a')

        item['name'] = itemLink.getText().strip()
        item['url'] = itemLink['href'].strip()
        item['ml'] = fields[cols['ML']].getText().strip()
        item['affixes'] = []

        if 'Drops on leaving adventure' in fields[cols['Bind']].getText():
            continue

        # Uncomment and edit to stop at a particular item
        # if item['name'] == "Diabolist's Robe":
        #     a = 1

        if item['ml'] == 'None':
            item['ml'] = 1

        # If we're doing an Armor page, add an entry for the Armor Class
        if 'AC' in cols:
            acBonus = fields[cols['AC']].getText().strip()
            if acBonus.startswith('+'):
                acBonus = acBonus[1:]

            # Robes have 0 AC - no need to include them in the list.
            # Docents have a more complicated expression that I'm not parsing, so if it's not a simple
            # number, just skip it.
            if acBonus != '0' and acBonus.isnumeric():
                aff = {
                    'name': 'Armor Class',
                    'value': acBonus,
                    'type': 'Armor'
                }
                item['affixes'].append(aff)

        # If we're doing a Shield page, add an entry for the (Shield) Armor Class bonus
        if 'SB' in cols:
            acBonus = fields[cols['SB']].getText().strip()
            if acBonus.startswith('+'):
                acBonus = acBonus[1:]

            if acBonus != '0' and acBonus.isnumeric():
                aff = {
                    'name': 'Armor Class',
                    'value': acBonus,
                    'type': 'Shield'
                }
                item['affixes'].append(aff)

        questsCell = fields[questIdx]
        questsTooltipSpan = questsCell.find('a')
        questsTooltip = questsTooltipSpan.get('title') if questsTooltipSpan else None
        if questsTooltip:
            quests = str(questsTooltip)
            item['quests'] = [quests]

        affixesIdx = cols['Enchantments'] if 'Enchantments' in cols else cols['Special Abilities']
        cell = fields[affixesIdx]

        affixes = parse_affixes_from_cell(cell, synonymMap, fakeBonuses, item['ml'])

        # Detect all the sets that we picked up as affixes
        set_names_in_affixes = []
        for aff in affixes:
            if aff['name'] in sets:
                set_names_in_affixes.append(aff['name'])

        # Move them over to the set list and remove from affixes
        for set_name in set_names_in_affixes:
            if 'sets' not in item:
                item['sets'] = []
            item['sets'].append(set_name)

        affixes[:] = [affix for affix in affixes if affix['name'] not in set_names_in_affixes]

        item['affixes'].extend(affixes)

        remove = []
        for affix in item['affixes']:
            affix = change_dino_item_affix_name(affix, item)
            affix = change_lost_purpose_affix_name(affix, item)

            if affix['name'] in craftingSystems:
                if 'crafting' not in item.keys():
                    item['crafting'] = []
                item['crafting'].append(affix['name'])
                remove.append(affix)

        for affix in remove:
            item['affixes'].remove(affix)

        items.append(item)

    return items


def parse_items():
    sets = read_json('sets')
        
    cachePath = "./cache/items/"
    items = []
    for file in os.listdir(cachePath):
        if include_page(file):
            items.extend(get_items_from_page(cachePath + file, sets))

    items.sort(key=lambda x: x['name'])


    write_json(items, 'items')

def change_dino_item_affix_name(affix, item):
    affixName = affix['name']
    itemName = item['name']

    if affixName == 'Scale (Weapon)' and (itemName == "Dinosaur Bone Quarterstaff" or itemName == "Attuned Bone Quarterstaff"):
        affix['name'] = "Scale (Weapon - Quarterstaff)"

    if affixName == 'Fang (Weapon)' and (itemName == "Dinosaur Bone Quarterstaff" or itemName == "Attuned Bone Quarterstaff"):
        affix['name'] = "Fang (Weapon - Quarterstaff)"

    if is_artifact(item):
        if affixName == "Scale (Accessory)":
            affix['name'] = "Scale (Accessory - Artifact)"
        elif affixName == "Fang (Accessory)":
            affix['name'] = "Fang (Accessory - Artifact)"
        elif affixName == "Claw (Accessory)":
            affix['name'] = "Claw (Accessory - Artifact)"
        elif affixName == "Horn (Accessory)":
            affix['name'] = "Horn (Accessory - Artifact)"
    
    return affix

def change_lost_purpose_affix_name(affix, item):
    if int(item['ml']) > 29 and affix['name'] == "Lost Purpose":
        affix['name'] = "Legendary Lost Purpose"

    return affix

def is_artifact(item):
    hasBlueSlot = False
    hasGreenSlot = False
    hasYellowSlot = False

    for affix in item['affixes']:
        if affix['name'] == "Blue Augment Slot":
            hasBlueSlot = True
        elif affix['name'] == "Yellow Augment Slot":
            hasYellowSlot = True
        elif affix['name'] == "Green Augment Slot":
            hasGreenSlot = True

    # This may not be perfect but it's the simplest way I can figure for now...
    return hasBlueSlot and hasGreenSlot and hasYellowSlot


if __name__ == "__main__":
    parse_items()
