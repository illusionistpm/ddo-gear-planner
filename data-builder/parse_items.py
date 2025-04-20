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

    augmentNameTransformMap = {
        'Isle of Dread: Claw (Accessory)'  : 'Claw (Accessory)',
        'Isle of Dread: Claw (Weapon)'     : 'Claw (Weapon)',
        'Isle of Dread: Fang (Accessory)'  : 'Fang (Accessory)',
        'Isle of Dread: Fang (Armor)'      : 'Fang (Armor)',
        'Isle of Dread: Fang (Weapon)'     : 'Fang (Weapon)',
        'Isle of Dread: Horn (Accessory)'  : 'Horn (Accessory)',
        'Isle of Dread: Horn (Weapon)'     : 'Horn (Weapon)',
        'Isle of Dread: Scale (Accessory)' : 'Scale (Accessory)',
        'Isle of Dread: Scale (Armor)'     : 'Scale (Armor)',
        'Isle of Dread: Scale (Weapon)'    : 'Scale (Weapon)',
        'Isle of Dread: Set Bonus'         : 'Isle of Dread: Set Bonus Slot: Empty',
        'Moon'                             : 'Moon Augment Slot',
        'Sun'                              : 'Sun Augment Slot',
        'Blue'                             : 'Blue Augment Slot',
        'Red'                              : 'Red Augment Slot',
        'Yellow'                           : 'Yellow Augment Slot',
        'Green'                            : 'Green Augment Slot',
        'Purple'                           : 'Purple Augment Slot',
        'Black'                            : 'Black Augment Slot'
    }

    augmentsWithArtifactVariantList = [
        'Claw (Accessory)',
        'Fang (Accessory)',
        'Horn (Accessory)',
        'Scale (Accessory)',
    ]

    augmentsWithQuarterstaffVariantList = [
        'Fang (Weapon)',
        'Scale (Weapon)',
    ]

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

    for q in ['Location', 'Locations', 'Quest', 'Quests']:
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
            affix = change_lost_purpose_affix_name(affix, item)

            if affix['name'] in craftingSystems:
                if 'crafting' not in item.keys():
                    item['crafting'] = []

                # *** temporary solution until more long term solution can be built out
                # *** using ddowiki artifact properties on items and item based crafting support in crafting system map
                # unique case exists where we need to hard code support to use a custom crafting system for isle of dread quarterstaffs
                if item['name'] in ['Attuned Bone Quarterstaff', 'Dinosaur Bone Quarterstaff']:
                    if affix['name'] == 'Fang (Weapon)':
                        affix['name'] = 'Fang (Weapon - Quarterstaff)'
                    if affix['name'] == 'Scale (Weapon)':
                        affix['name'] = 'Scale (Weapon - Quarterstaff)'
                # unique case exists where we need to hard code support to use a custom crafting system for isle of dread artifacts
                elif item['name'] in [
                    'Dinosaur Bone Belt',
                    'Dinosaur Bone Boots',
                    'Dinosaur Bone Bracers',
                    'Dinosaur Bone Gloves',
                    'Dinosaur Bone Necklace',
                    'Dinosaur Bone Ring']:
                    if affix['name'] == 'Scale (Accessory)':
                        affix['name'] = 'Scale (Accessory - Artifact)'
                    if affix['name'] == 'Fang (Accessory)':
                        affix['name'] = 'Fang (Accessory - Artifact)'
                    if affix['name'] == 'Claw (Accessory)':
                        affix['name'] = 'Claw (Accessory - Artifact)'
                    if affix['name'] == 'Horn (Accessory)':
                        affix['name'] = 'Horn (Accessory - Artifact)'

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
            # some properties that are specific to equippable items are not required/desired for items augments, so we remove them
            item.pop('slot')
            item.pop('type')
            item.pop('url') # this may be helpful at some point in the future to add back in (?)

            augmentType = augmentNameTransformMap[fields[cols['Augment type']].getText().strip()]

            # unique case exists when processing set bonus augments
            if (augmentType == 'Isle of Dread: Set Bonus Slot: Empty'):
                # when an augment is going in to a set bonus slot, we can assume we only need to populate name and set values
                setName = re.search(r'^.*Set Bonus: (.*)$', item['name']).group(1).strip()
                item = {
                    'name' : setName,
                    'set'  : setName,
                }

            # unique case exists when processing augments going in artifacts and quarterstaffs
            # crafting logic doesnt support conventional approach so unique crafting systems are created
            if (augmentType in (augmentsWithArtifactVariantList + augmentsWithQuarterstaffVariantList)):
                # custom affix map for artifact version
                augmentArtifactAffixList     = []
                # custom affix map for quarterstaff version
                augmentQuarterstaffAffixList = []

                # loop through each affix and
                # - add affix to the respective artifact or quarterstaff affix list if the flag is set
                # - add affix to both artifact and quarterstaff affix lists if no unique flag is set
                # - do some checks to replace base (common) affix with custom affix if collission detected
                for affix in item['affixes'][:]:
                    if ('uniquePropertyRequired' in affix):
                        if (affix['uniquePropertyRequired'] == 'Minor Artifact'):
                            affixList = augmentArtifactAffixList
                        elif (affix['uniquePropertyRequired'] == 'Quarterstaff'):
                            affixList = augmentQuarterstaffAffixList

                        # remove any duplicates found in custom affix list
                        for i, val in enumerate(affixList[:]):
                            if affixList[i]['name'] == affix['name']:
                                affixList.pop(i)

                        # remove property indicating unique property required
                        affix.pop('uniquePropertyRequired')

                        # add the affix to the custom affix list
                        affixList.append(affix)

                        # remove affix from the base item affix list
                        item['affixes'].remove(affix)
                    else:
                        # add an unqualified affix to artifact affix list if not found
                        affixAlreadyExists = False
                        for augmentAffix in augmentArtifactAffixList:
                            if augmentAffix['name'] == affix['name']:
                                affixAlreadyExists = True
                        if not affixAlreadyExists:
                            augmentArtifactAffixList.append(affix)

                        # add an unqualified affix to quarterstaff affix list if not found
                        affixAlreadyExists = False
                        for augmentAffix in augmentQuarterstaffAffixList:
                            if augmentAffix['name'] == affix['name']:
                                affixAlreadyExists = True
                        if not affixAlreadyExists:
                            augmentQuarterstaffAffixList.append(affix)

                # after processing all affixes, add the custom artifact variant to the crafting system map
                if (augmentType in augmentsWithArtifactVariantList):
                    itemArtifactVariant = item.copy()
                    itemArtifactVariant['affixes'] = augmentArtifactAffixList
                    add_entry_to_crafting_map(augmentType.replace(')', ' - Artifact)'), itemArtifactVariant, craftingSystems)

                # after processing all affixes, add the custom quarterstaff variant to the crafting system map
                if (augmentType in augmentsWithQuarterstaffVariantList):
                    itemQuarterstaffVariant = item.copy()
                    itemQuarterstaffVariant['affixes'] = augmentQuarterstaffAffixList
                    add_entry_to_crafting_map(augmentType.replace(')', ' - Quarterstaff)'), itemQuarterstaffVariant, craftingSystems)

            # after processing all affixes, add the common augment variant to the crafting system map
            # (earlier processing removed entries in affix map that required custom property
            add_entry_to_crafting_map(augmentType, item, craftingSystems)

        else:
            items.append(item)

    return items

def add_entry_to_crafting_map(craftingSystemName, augmentEntry, craftingSystems):
    # check for existence of top level system name
    # if not found create entry and create a child wildcard entry
    if craftingSystemName not in craftingSystems:
        craftingSystems[craftingSystemName]      = {}
        craftingSystems[craftingSystemName]['*'] = []

    # *** this code can (should) be removed once the crafting system pass is all done by parsing raw item augments data
    # add some logic to prevent adding duplicate augment entries to crafting set
    # ideally, duplicates would not be encountered, but during testing, this can happen
    augmentEntryExistsInCraftingSystems = False
    for craftingSystemEntry in craftingSystems[craftingSystemName]['*']:
        if 'name' in craftingSystemEntry and augmentEntry['name'] == craftingSystemEntry['name']:
            augmentEntryExistsInCraftingSystems = True

    if not augmentEntryExistsInCraftingSystems:
        craftingSystems[craftingSystemName]['*'].append(augmentEntry)

    return(True)

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
