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


def get_items_from_page(itemPageURL, craftingSystems, sets):
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

    if 'Minimum level' in cols:
        cols['ML'] = cols['Minimum level']

    rows = table.find_all('tr', recursive=False)

    for q in ['Location', 'Quest', 'Quests']:
        if q in cols:
            questIdx = cols[q]

    # For some reason, the header is showing up as a row
    rows.pop(0)

    catMap = build_cat_map()

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

        affixes = parse_affixes_from_cell(item['name'], cell, synonymMap, fakeBonuses, item['ml'], craftingSystems, sets)

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

            # if enhancement bonus found on item we may need to translate that enhancement bonus to something else
            if affix['name'] == 'Enhancement Bonus':

                # create some booleans to reduce duplication and increase readability
                isArmor = False
                isShield = False
                isWeapon = False

                # assume that all item types that go in to the armor slot are armors
                if item['slot'] == 'Armor':
                    isArmor = True

                # identify shield items based on item type
                if ((item['type'] == 'Bucklers') or \
                    (item['type'] == 'Large shields') or \
                    (item['type'] == 'Small shields') or \
                    (item['type'] == 'Tower shields')):
                    isShield = True

                # for armor and shield items - enhancement bonus becomes an enhancement type bonus to Enhancement Bonus (Armor)
                # Enhancement Bonus (Armor) is then bubbled up as enhancement bonus to Armor Class via affix groups
                if isArmor or isShield:
                    affix['name'] = 'Enhancement Bonus (Armor)'

                # assume that every item in your weapon slot that is not a shield and is not an orb is a weapon
                # for weapon items - enhancement bonus becomes an enhancement type bonus to Enhancement Bonus (Weapon)
                # Enhancement Bonus (Weapon is then bubbled up as an enhancement bonus to Accuracy and Damage via affix groups
                if ((item['slot'] == 'Weapon') or (item['slot'] == 'Offhand')) \
                    and not (isShield or item['type'] == 'Orbs'):
                    affix['name'] = 'Enhancement Bonus (Weapon)'

        for affix in remove:
            item['affixes'].remove(affix)

        # case exists if the item is really an item augment
        # in those cases we add the augment to the crafting systems map instead of the items map
        if category == 'Raw data/Item augments':
            itemAugmentMap            = {}
            itemAugmentMap['ml']      = item['ml']
            itemAugmentMap['name']    = item['name']
            itemAugmentMap['affixes'] = item['affixes']

            itemAugmentSlotType = fields[cols['Augment type']].getText().strip()

            # *** temporary modification to only injest Sun and Moon augments
            if ((itemAugmentSlotType != 'Moon') and (itemAugmentSlotType != 'Sun')):
                continue

            # *** probably want to create a map to transform these names at some point
            if itemAugmentSlotType == 'Moon':
                itemAugmentSlotType = 'Moon Augment Slot'
            if itemAugmentSlotType == 'Sun':
                itemAugmentSlotType = 'Sun Augment Slot'

            if itemAugmentSlotType not in craftingSystems:
                craftingSystems[itemAugmentSlotType]      = {}
                craftingSystems[itemAugmentSlotType]['*'] = []

            # add some logic to prevent adding duplicate entries to crafting set
            # ideally, duplicates would not be encountered, but during testing, this can happen
            augmentExistsInCraftingSystems = False
            for itemAugment in craftingSystems[itemAugmentSlotType]['*']:
                if itemAugmentMap['name'] == itemAugment['name']:
                    augmentExistsInCraftingSystems = True

            if not augmentExistsInCraftingSystems:
                craftingSystems[itemAugmentSlotType]['*'].append(itemAugmentMap)

        else:
            items.append(item)

    return items


def parse_items():
    crafting = read_json('crafting')
    sets     = read_json('sets')
    items    = []

    cachePath            = './cache/items/'
    itemAugmentsFilename = 'Raw_data_Item_augments.html'

    fileList = os.listdir(cachePath)

    # we reposition the Item_augments page to be at the beginning
    # so that proper crafting sets can be populuated
    # before equippable items are processed
    if itemAugmentsFilename in fileList:
        fileList.remove(itemAugmentsFilename)
        fileList.insert(0, itemAugmentsFilename)

    for file in fileList:
        if include_page(file):
            items.extend(get_items_from_page(cachePath + file, crafting, sets))

    items.sort(key=lambda x: x['name'])
    write_json(items, 'items')

    # add sorting to crafting system entries
    for craftingSystemName in crafting.keys():
        for craftingSystemItem in crafting[craftingSystemName]:
            if isinstance(crafting[craftingSystemName][craftingSystemItem], list):
                crafting[craftingSystemName][craftingSystemItem].sort(key=lambda x: x.get('name', ''))
     write_json(crafting, 'crafting')


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
