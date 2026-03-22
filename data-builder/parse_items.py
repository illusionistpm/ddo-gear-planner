from copy import deepcopy
from typing import Any, Literal, cast

from bs4 import BeautifulSoup
import os
import re
import collections
from write_json import write_json
from read_json import read_json
from parse_affixes_from_cell import parse_affixes_from_cell, get_fake_bonuses
from get_inverted_synonym_map import get_inverted_synonym_map

from parse_context_error import ParseContextError
from typedefs import SetAugment, CatMap, AugmentNameTransformMap, CraftingSystems, Sets, Affix, Item

def include_page(fileName: str) -> bool:
    return not fileName.startswith('Collars')


def add_cat_to_map(catMap: CatMap, slot: str, array: list[str]) -> None:
    for category in array:
        catMap[category] = slot


def build_cat_map() -> CatMap:
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


def get_items_from_page(itemPageURL: str, craftingSystems: CraftingSystems, sets: Sets) -> Any:
    synonymMap = get_inverted_synonym_map()

    craftableAffixNames = (
        'Craftable',
        'Craftable (hidden)',
        'Craftable Rune Arm' # Handling craftable rune arms is non-trivial
    )
    craftableRunearmsAffixesLost = {
        'Flame Warden': ['Fire Resistance', 'Reflex Save'],
        'Thought Spike (starter)': ['Starter', 'Will Save'],
        'Thought Spike': ['Will Save'],
        'Candlelight': ['Lesser Undead Guard'],
        'Flicker': ['Power', 'Reflex Save'],
        'Chimera\'s Breath': [], # No losses
        'Chulchannad\'s Claw': ['Cold Absorption', 'Cold Resistance'],
        'Khyber\'s Fury': ['Fortification'],
        'Strinati\'s Hand Cannon': ['Wizardry'],
        'Coronach (historic)': [], # No losses, assumedly
        'Coronach': [], # No losses
        'Ol\' Ironsides': [], # TODO: Unknown crafting losses
        'The Devourer\'s Hunger': ['Glaciation', 'False Life'], 
        'The Pea Shooter': ['Potency', 'Acid Resistance'],
        'Hand of the Tombs': ['Fire Resistance'],
        'Recoyle': ['Impulse', 'Anathema'],
        'The Disciplinator': ['Fortification', 'Physical Sheltering', 'Fortitude Save'],
        'Titan\'s Fist': ['Intelligence', 'Kinetic Lore'],
        'Trial by Fire': ['False Life', 'Fire Resistance'],
        'Arcing Sky (level 13)': ['Dodge', 'Electric Resistance'],
        'Chill of Winter (level 13)': ['Cold Resistance'],
        'The Turmoil Within (level 13)': [], # TODO: Unknown crafting losses
        'Tira\'s Splendor': ['Healing Amplification', 'Deathblock'],
        'Glorious Obscenity': ['Spot', 'Seeker'],
        'Animus': [], # No losses
        'Lucid Dreams': ['Potency', 'Spell Lore', 'Mind Drain', 'Will Save'],
        'Toven\'s Hammer': ['Potency', 'Fortification'],
        'Epic Coronach': [], # TODO: Is this one really craftable? Doesn't look like the case from wiki's screenshot
        # These don't actually lose anything
        'Acid Rune Arm': [],
        'Fire Rune Arm': [],
        'Force Rune Arm': [],
        'Ice Rune Arm': [],
        'Lightning Rune Arm': [],
        'Radiant Rune Arm': [],
        'Greater Acid Rune Arm': [],
        'Greater Fire Rune Arm': [],
        'Greater Force Rune Arm': [],
        'Greater Ice Rune Arm': [],
        'Greater Lightning Rune Arm': [],
        'Greater Radiant Rune Arm': [],
    }
    rangedWeaponTypes = (
        'Repeating Light Crossbows', 'Throwing Daggers', 'Darts', 'Long Bows', 'Shurikens', 'Repeating Heavy Crossbows', 'Heavy Crossbows', 'Throwing Axes', 'Great Crossbows', 'Throwing Hammers', 'Short Bows', 'Light Crossbows'
    )

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

    questIdx = None
    for q in ['Location', 'Locations', 'Quest', 'Quests']:
        if q in cols:
            questIdx = cols[q]
    assert questIdx is not None

    # For some reason, the header is showing up as a row
    rows.pop(0)

    catMap = build_cat_map()

    fakeBonuses = get_fake_bonuses()

    for row_index, row in enumerate(rows, start=1):
        fields = row.find_all('td', recursive=False)

        try:
            if 'Drops on leaving adventure' in fields[cols['Bind']].getText():
                continue

            itemLink = fields[cols['Item']].find('a')
            rawML = fields[cols['ML']].getText().strip()

            item: Item|SetAugment = {
                'type': category,
                'slot': catMap[category],
                'name': itemLink.getText().strip(),
                'url': itemLink['href'].strip(),
                'ml': 1 if rawML == 'None' else int(rawML),
                'affixes': [],
            }

            # Uncomment and edit to stop at a particular item
            # if item['name'] == "Diabolist's Robe":
            #     a = 1

            # If we're doing an Armor page, add an entry for the Armor Class
            if 'AC' in cols:
                acBonus = fields[cols['AC']].getText().strip()
                if acBonus.startswith('+'):
                    acBonus = acBonus[1:]

                # Robes have 0 AC - no need to include them in the list.
                # Docents have a more complicated expression that I'm not parsing, so if it's not a simple
                # number, just skip it.
                if acBonus != '0' and acBonus.isnumeric():
                    item['affixes'].append({
                        'name': 'Armor Class',
                        'value': acBonus,
                        'type': 'Armor',
                    })

            # If we're doing a Shield page, add an entry for the (Shield) Armor Class bonus
            if 'SB' in cols:
                acBonus = fields[cols['SB']].getText().strip()
                if acBonus.startswith('+'):
                    acBonus = acBonus[1:]

                if acBonus != '0' and acBonus.isnumeric():
                    item['affixes'].append({
                        'name': 'Armor Class',
                        'value': acBonus,
                        'type': 'Shield',
                    })

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
                affix = change_lost_purpose_affix_name(affix, item)

                if affix['name'] in craftingSystems:
                    if 'crafting' not in item.keys():
                        item['crafting'] = []

                    # *** temporary solution until more long term solution can be built out
                    # *** using ddowiki artifact properties on items and item based crafting support in crafting system map
                    # unique case exists where we need to hard code support to use a custom crafting system for isle of dread quarterstaffs
                    if ((item['name'] in [
                            'Attuned Bone Quarterstaff',
                            'Dinosaur Bone Quarterstaff',
                        ])
                        and (affix['name'] in [
                            'Fang (Weapon)',
                            'Scale (Weapon)',
                        ])):
                        affix['name'] = affix['name'] + ' (quarterstaff)'
                    elif ((item['name'] in [
                            'Calamitous Quarterstaff',
                        ])
                        and (affix['name'] in [
                            'Dolorous Slot (Weapon)',
                            'Melancholic Slot (Weapon)',
                        ])):
                        affix['name'] = affix['name'] + ' (quarterstaff)'
                    elif ((item['name'] in [
                            'Dinosaur Bone Belt',
                            'Dinosaur Bone Boots',
                            'Dinosaur Bone Bracers',
                            'Dinosaur Bone Gloves',
                            'Dinosaur Bone Necklace',
                            'Dinosaur Bone Ring',
                        ])
                        and (affix['name'] in [
                            'Claw (Accessory)',
                            'Fang (Accessory)',
                            'Horn (Accessory)',
                            'Scale (Accessory)',
                        ])
                        ):
                        affix['name'] = affix['name'] + ' (artifact)'

                    assert 'crafting' in item
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
                    if item['type'] in ('Bucklers', 'Large shields', 'Small shields', 'Tower shields'):
                        isShield = True

                    # for armor and shield items - enhancement bonus becomes an enhancement type bonus to Enhancement Bonus (Armor)
                    # Enhancement Bonus (Armor) is then bubbled up as enhancement bonus to Armor Class via affix groups
                    if isArmor or isShield:
                        affix['name'] = 'Enhancement Bonus (Armor)'

                    # assume that every item in your weapon slot that is not a shield and is not an orb is a weapon
                    # for weapon items - enhancement bonus becomes an enhancement type bonus to Enhancement Bonus (Weapon)
                    # Enhancement Bonus (Weapon is then bubbled up as an enhancement bonus to Accuracy and Damage via affix groups
                    if item['slot'] in ('Weapon', 'Offhand') and not (isShield or item['type'] == 'Orbs'):
                        affix['name'] = 'Enhancement Bonus (Weapon)'

            for affix in remove:
                item['affixes'].remove(affix)

            items.append(item)

            # Post-process craftable items
            if any(itemAffix['name'] in craftableAffixNames for itemAffix in item['affixes']):
                craftedItem = deepcopy(item)
                craftedItem['name'] = item['name'] + ' [Crafted]'

                craftableAffixes = tuple(itemAffix for itemAffix in craftedItem['affixes'] if itemAffix['name'] in craftableAffixNames)
                for craftableAffix in craftableAffixes:
                    craftedItem['affixes'].remove(craftableAffix)

                isCraftableRunearm = any(craftableAffix['name'] == 'Craftable Rune Arm' for craftableAffix in craftableAffixes)
                if isCraftableRunearm:
                    # check for misspellings and bs
                    for affixToLose in craftableRunearmsAffixesLost[item['name']]:
                        assert any(affix for affix in craftedItem['affixes'] if affix['name'] == affixToLose)

                    for affix in [*craftedItem['affixes']]:
                        if affix['name'] in craftableRunearmsAffixesLost[item['name']]:
                            craftedItem['affixes'].remove(affix)

                if 'crafting' not in craftedItem:
                    craftedItem['crafting'] = []

                match (item['slot'], item['type']):
                    case ('Weapon', weaponType) if weaponType in rangedWeaponTypes:
                        slot = 'Ranged'
                    case ('Weapon', _):
                        slot = 'Melee'
                    case ('Offhand', 'Rune Arms'):
                        slot = 'Rune Arm'
                    case ('Offhand', 'Orbs'):
                        slot = 'Orb'
                    case ('Offhand', _):
                        slot = 'Shield'
                    case _:
                        slot = item['slot']

                craftedItem['crafting'].append(f'Cannith: {slot} - Prefix')
                craftedItem['crafting'].append(f'Cannith: {slot} - Suffix')
                craftedItem['crafting'].append(f'Cannith: {slot} - Extra')

                items.append(craftedItem)
        except Exception as e:
            raise ParseContextError(
                "Error parsing item row",
                page=itemPageURL,
                row_html=str(row),
                context={
                    "row_index": row_index,
                    "title": title,
                    "category": category,
                },
                original=e,
            ) from e

    return items


def parse_items() -> None:
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

    # Sort by name then slot (for a stable sort with Slaver's items, which have entries in multiple slots)
    items.sort(key=lambda x: (x['name'], x.get('slot', '')))
    write_json(items, 'items')

    # add sorting to crafting system entries
    for craftingSystemName in crafting.keys():
        for craftingSystemItem in crafting[craftingSystemName]:
            if isinstance(crafting[craftingSystemName][craftingSystemItem], list):
                crafting[craftingSystemName][craftingSystemItem].sort(key=lambda x: x['name'] if ('name' in x) else x['affixes'][0]['name'] if ('affixes' in x) else '')

    write_json(crafting, 'crafting')


def change_lost_purpose_affix_name(affix: Affix, item: Item) -> Any:
    if item['ml'] > 29 and affix['name'] == "Lost Purpose":
        affix['name'] = "Legendary Lost Purpose"

    return affix


if __name__ == "__main__":
    parse_items()
