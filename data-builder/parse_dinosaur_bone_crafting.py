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

            affixes = parse_affixes_from_cell(fields[1], synonymMap, fake_bonuses, None)

            affixes = fix_affixes_from_parse(affixes)

            affixes = parse_affixes_from_dino_weapon(affixes)

            add_specific_slot_affixes_to_systems(affixes, system_name, systems, augment_name)

            option = {}
            option['affixes'] = affixes
            option['name'] = augment_name


            systems[system_name]['*'].append(option)

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

def add_specific_slot_affixes_to_systems(affixes, systemName, systems, augmentName):
    copiedAffixes = affixes[::]

    if systemName == "Scale (Weapon)" and (augmentName == "Brightscale" or augmentName == "Shadowscale" or augmentName == "Iridiscent Scale" or augmentName == "Iridescent Scale"):
        copiedAffixes.append(create_affix("Spell Focus Master", "Exceptional", "2"))

        systems["Scale " + quarterstaffSystemName]['*'].append({
            'affixes': [copiedAffixes],
            'name': augmentName
        })
    elif systemName == "Scale (Weapon)":
        systems["Scale " + quarterstaffSystemName]['*'].append({
            'affixes': copiedAffixes,
            'name': augmentName
        })

    if systemName == "Fang (Weapon)" and (augmentName == "Iridiscent Fang" or augmentName == "Iridescent Fang"): # adding the correct spelling here assuming someday someone will correct this on the wiki
        copiedAffixes.append(create_affix("Spell Lore", "Exceptional", "5"))

        systems["Fang " + quarterstaffSystemName]['*'].append({
            'affixes': [copiedAffixes],
            'name': augmentName
        })
    elif systemName == "Fang (Weapon)":
        systems["Fang " + quarterstaffSystemName]['*'].append({
            'affixes': copiedAffixes,
            'name': augmentName
        })

    if systemName == "Scale (Accessory)":
        if augmentName == "Scale: False Life":
            systems["Scale " + artifactSystemName]['*'].append({
                'affixes': [create_affix("False Life", "Enhancement", "58")],
                'name': augmentName
            })
        elif augmentName == "Scale: Charisma":
            systems["Scale " + artifactSystemName]['*'].append({
                'affixes': [create_affix("Charisma", "Enhancement", "15")],
                'name': augmentName
            })
        elif augmentName == "Scale: Constitution":
            systems["Scale " + artifactSystemName]['*'].append({
                'affixes': [create_affix("Constitution", "Enhancement", "15")],
                'name': augmentName
            })
        elif augmentName == "Scale: Dexterity":
            systems["Scale " + artifactSystemName]['*'].append({
                'affixes': [create_affix("Dexterity", "Enhancement", "15")],
                'name': augmentName
            })
        elif augmentName == "Scale: Intelligence":
            systems["Scale " + artifactSystemName]['*'].append({
                'affixes': [create_affix("Intelligence", "Enhancement", "15")],
                'name': augmentName
            })
        elif augmentName == "Scale: Strength":
            systems["Scale " + artifactSystemName]['*'].append({
                'affixes': [create_affix("Strength", "Enhancement", "15")],
                'name': augmentName
            })
        elif augmentName == "Scale: Wisdom":
            systems["Scale " + artifactSystemName]['*'].append({
                'affixes': [create_affix("Wisdom", "Enhancement", "15")],
                'name': augmentName
            })
        else:
            systems["Scale " + artifactSystemName]['*'].append({
                'affixes': [copiedAffixes],
                'name': augmentName
            })

    if systemName == "Fang (Accessory)":
        if augmentName == "Fang: Healing Amplification":
            systems["Fang " + artifactSystemName]['*'].append({
                'affixes': [create_affix("Healing Amplification", "Competence", "61")],
                'name': augmentName
            })
        elif augmentName == "Fang: Negative Amplification":
            systems["Fang " + artifactSystemName]['*'].append({
                'affixes': [create_affix("Negative Amplification", "Profane", "61")],
                'name': augmentName
            })
        elif augmentName == "Fang: Repair Amplification":
            systems["Fang " + artifactSystemName]['*'].append({
                'affixes': [create_affix("Negative Amplification", "Enhancement", "61")],
                'name': augmentName
            })
        elif augmentName == "Fang: Accuracy":
            systems["Fang " + artifactSystemName]['*'].append({
                'affixes': [create_affix("Accuracy", "Competence", "23")],
                'name': augmentName
            })
        elif augmentName == "Fang: Damage":
            systems["Fang " + artifactSystemName]['*'].append({
                'affixes': [create_affix("Damage", "Competence", "12")],
                'name': augmentName
            })
        elif augmentName == "Fang: Deception":
            systems["Fang " + artifactSystemName]['*'].append({
                'affixes': [create_affix("Deception", "Enhancement", "12")],
                'name': augmentName
            })
        elif augmentName == "Fang: Seeker":
            systems["Fang " + artifactSystemName]['*'].append({
                'affixes': [create_affix("Seeker", "Enhancement", "15")],
                'name': augmentName
            })
        else:
            systems["Fang " + artifactSystemName]['*'].append({
                'affixes': [copiedAffixes],
                'name': augmentName
            })            
            
    if systemName == "Claw (Accessory)":
        if augmentName == "Claw: Physical Resistance Rating":
            systems["Claw " + artifactSystemName]['*'].append({
                'affixes': [create_affix("Physical Resistance Rating", "Enhancement", "38")],
                'name': augmentName
            })
        elif augmentName == "Claw: Magical Resistance Rating":
            systems["Claw " + artifactSystemName]['*'].append({
                'affixes': [create_affix("Magical Resistance Rating", "Enhancement", "38")],
                'name': augmentName
            })
        elif augmentName == "Claw: Stunning":
            systems["Claw " + artifactSystemName]['*'].append({
                'affixes': [create_affix("Stunning", "Enhancement", "17")],
                'name': augmentName
            })
        elif augmentName == "Claw: Trip":
            systems["Claw " + artifactSystemName]['*'].append({
                'affixes': [create_affix("Trip", "Enhancement", "17")],
                'name': augmentName
            })
        elif augmentName == "Claw: Sunder":
            systems["Claw " + artifactSystemName]['*'].append({
                'affixes': [create_affix("Sunder", "Enhancement", "17")],
                'name': augmentName
            })
        elif augmentName == "Claw: Assassinate":
            systems["Claw " + artifactSystemName]['*'].append({
                'affixes': [create_affix("Assassinate", "Enhancement", "17")],
                'name': augmentName
            })
        elif augmentName == "Claw: Spell Penetration":
            systems["Claw " + artifactSystemName]['*'].append({
                'affixes': [create_affix("Spell Penetration", "Enhancement", "10")],
                'name': augmentName
            })
        else:
            systems["Claw " + artifactSystemName]['*'].append({
                'affixes': [copiedAffixes],
                'name': augmentName
            })    

    if systemName == "Horn (Accessory)":
        if augmentName == "Horn: Armor Piercing":
            systems["Horn " + artifactSystemName]['*'].append({
                'affixes': [create_affix("Armor Piercing", "Enhancement", "23")],
                'name': augmentName
            })   
        else:
            systems["Horn " + artifactSystemName]['*'].append({
                'affixes': [copiedAffixes],
                'name': augmentName
            })    

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