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
from pprint import pprint

quarterstaffSystemName = "(Weapon - Quarterstaff)"
artifactSystemName = "(Accessory - Artifact)"
dreadSetSystemTableHeaderValue = "Set Bonus Augment (Armor, Cloak, and Helm)"
dreadSetSystemName = "Isle of Dread: Set Bonus Slot: Empty"

def get_systems_from_page(soup):
    synonymMap = get_inverted_synonym_map()

    tables = soup.find(id='bodyContent').find(id='mw-content-text').find_all('table', class_="wikitable")

    fake_bonuses = get_fake_bonuses()

    systems = {}

    for table in tables:
        headers = table.find_all('th')

        # Skip any tables that don't include Effects
        if headers[1].getText().strip() != 'Effect':
            continue

        body = table.find('tbody')

        system_name = headers[0].getText().rstrip()

        systems[system_name] = {'*': []}

        create_slot_specific_systems(system_name, systems)

        rows = body.find_all('tr', recursive=False)

        for row in rows[1:]:
            fields = row.find_all('td', recursive=False)

            augment_name = fields[0].contents[0].rstrip()

            # no need to feed item name, crafting, or set values because dinosaur bone crafting
            # will not be adding to the crafting dict, and will not be associated with other sets
            affixes = parse_affixes_from_cell('', fields[1], synonymMap, fake_bonuses, None, {}, {})

            affixes = fix_affixes_from_parse(affixes)

            affixes = parse_affixes_from_dino_weapon(affixes)

            add_specific_slot_affixes_to_systems(affixes, system_name, systems, augment_name, fields[1])

            option = {}
            option['affixes'] = affixes
            option['name'] = augment_name


            systems[system_name]['*'].append(option)

    # Rename systems key to compensate for wiki drift
    if dreadSetSystemTableHeaderValue in systems:
        systems[dreadSetSystemName] = systems.pop(dreadSetSystemTableHeaderValue)
        for key,value in enumerate(systems[dreadSetSystemName]['*']):
            # parser reads effect column as affix -- drop those from set bonus
            if 'affixes' in systems[dreadSetSystemName]['*'][key]:
                del systems[dreadSetSystemName]['*'][key]['affixes']
            # this is a craftable set, include entry to treat property as set
            systems[dreadSetSystemName]['*'][key]['set'] = systems[dreadSetSystemName]['*'][key]['name']

    return systems

def fix_affixes_from_parse(affixes):
    if affixes is None or len(affixes) == 0:
        return affixes

    affix = affixes[0]

    if affix['name'].startswith("+12 Enhancement bonus to Saving Throws."):
        affix['name'] = "Resistance"
        affix['type'] = "Enhancement"
        affix['value'] = "11" # according to the wiki it's actually 11
        return affixes

    if affix['name'] == "Ghostly":
        affix['name'] = "Enhanced Ghostly"

    if affix['name'] == "Maximum SP":
        affix['name'] = "Wizardry"

    return affixes


def parse_dinosaur_bone_crafting():
    page = open('./cache/crafting/Dinosaur_Bone_crafting.html', "r", encoding='utf-8').read()

    soup = BeautifulSoup(page, 'html.parser')

    systems = get_systems_from_page(soup)
    return systems

def create_slot_specific_systems(system_name, systems):
    if system_name == "Scale (Weapon)":
        systems['Scale (Weapon - Quarterstaff)'] = {'*': []}

    if system_name == "Fang (Weapon)":
        systems['Fang (Weapon - Quarterstaff)'] = {'*': []}

    if system_name == "Scale (Accessory)":
        systems['Scale (Accessory - Artifact)'] = {'*': []}

    if system_name == "Fang (Accessory)":
        systems['Fang (Accessory - Artifact)'] = {'*': []}

    if system_name == "Claw (Accessory)":
        systems['Claw (Accessory - Artifact)'] = {'*': []}

    if system_name == "Horn (Accessory)":
        systems['Horn (Accessory - Artifact)'] = {'*': []}

def parse_affixes_from_dino_weapon(affixes):
    affixName = affixes[0]['name']
    if affixName.find("On hit") == -1:
        return affixes

    description = affixName
    returnAffixes = []

    materialTypeSearch = re.search(r'^(?:Adds )([A-Za-z]+) material type.', affixName)
    onHitDamageSearch = re.search(r'(?:On hit )?([0-9]+)?d([0-9]+)? ([A-Za-z]+) Damage.', affixName)

    if materialTypeSearch:
        materialTypeText = materialTypeSearch.group(1)

        if materialTypeText.find(" and ") != -1:
            materialsSplit = materialTypeText.split(" and ")

            returnAffixes.append(create_bool_affix(materialsSplit[0]))
            returnAffixes.append(create_bool_affix(materialsSplit[1]))
        else:
            returnAffixes.append(create_bool_affix(materialTypeText))

    if onHitDamageSearch:
        damageDiceCountText = onHitDamageSearch.group(1)
        damageDieSizeText = onHitDamageSearch.group(2) # use this, or just count up the total dice regardless of their size?
        damageTypeText = onHitDamageSearch.group(3)

        returnAffixes.append(create_affix(damageTypeText + " Damage Dice", "Untyped", damageDiceCountText))

    return returnAffixes

def add_specific_slot_affixes_to_systems(affixes, systemName, systems, augmentName, cell):
    copiedAffixes = affixes[::]

    if systemName == "Scale (Weapon)" and (augmentName == "Brightscale" or augmentName == "Shadowscale" or augmentName == "Iridiscent Scale"):
        copiedAffixes.append(create_affix("Spell Focus Master", "Exceptional", "2"))

        systems["Scale " + quarterstaffSystemName]['*'].append({
            'affixes': copiedAffixes,
            'name': augmentName
        })
    elif systemName == "Scale (Weapon)":
        systems["Scale " + quarterstaffSystemName]['*'].append({
            'affixes': copiedAffixes,
            'name': augmentName
        })

    if ((systemName == "Fang (Weapon)") and (augmentName == "Iridiscent Fang")):
        copiedAffixes.append(create_affix("Spell Lore", "Exceptional", "5"))

        systems["Fang " + quarterstaffSystemName]['*'].append({
            'affixes': copiedAffixes,
            'name': augmentName
        })
    elif systemName == "Fang (Weapon)":
        systems["Fang " + quarterstaffSystemName]['*'].append({
            'affixes': copiedAffixes,
            'name': augmentName
        })

    # case exists for some systems to add in the artifact version of the slot
    if systemName in ['Claw (Accessory)', 'Fang (Accessory)', 'Horn (Accessory)', 'Scale (Accessory)']:
        slotName = systemName.replace('(Accessory)', artifactSystemName)

        artifactValueSearch = re.search(r'^.*? into a Minor Artifact.*?\+([0-9]+).*?(?:\+[0-9]+)?.*$', cell.getText())
        if artifactValueSearch:
            artifactAffixMap = {
                'affixes' : [
                    {
                        'description' : None,
                        'name' : affixes[0]['name'],
                        'type' : affixes[0]['type'],
                        'value' : artifactValueSearch.group(1).strip(),
                    },
                ],
            }
        else:
            artifactAffixMap = {
                'affixes': copiedAffixes,
            }

        artifactAffixMap['name'] = augmentName
        # artifactAffixMap['name'] = 'name' : '%s +%s %s' % (copiedAffixes[0]['name'], copiedAffixes[0]['value'], copiedAffixes[0]['type'])

        systems[slotName]['*'].append(artifactAffixMap)

def create_affix(name, type, value):
    affix = {
        'name': name,
        'value': value,
        'description': None
    }

    if type is not None and type != "Untyped":
        affix['type'] = type

    return affix

def create_bool_affix(affixName):
    return {
        'name': affixName,
        'type': "bool",
        'value': "1",
        'description': None
    }


if __name__ == "__main__":
    system = parse_dinosaur_bone_crafting()
    pprint(system)