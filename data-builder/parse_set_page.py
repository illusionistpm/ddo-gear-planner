from bs4 import BeautifulSoup
import requests
import os
import re
import json
from copy import deepcopy
import collections
from parse_slavers import parse_slavers_sets
from write_json import write_json
from read_json import read_json
from get_inverted_synonym_map import get_inverted_synonym_map
from get_lost_purpose import get_lost_purpose_sets

# attempt to split out elements in a string if that string contains the word 'and'
def split_list(affix, affixes):
    str = affix['name']
    if str in ['hit and damage vs. Evil creatures',
        'threat decrease with both melee and ranged attacks',
        'times, and each stack lasts 30 seconds',
        'threat generation with melee and ranged attacks']:
        return False

    if not ' and ' in str:
        return False

    words = str.split(',')
    words = map(lambda a: a.split(' and '), words)
    words = [item.strip() for sublist in words for item in sublist]
    while("" in words) :
        words.remove("")

    # important -- 'Power' must be parsed AFTER 'Spell Power' otherwise the Power loop will catch both
    for suffix in ['Healing Amplification', 'Spell Power', 'Power', 'Spell Crit Chance', 'Absorption', 'Amplification', 'Resistance Rating']:
        if words[-1].endswith(suffix):
            for idx, word in enumerate(words[0:-1], 0):
                words[idx] = word + " " + suffix
            break

    for word in words:
        aff = deepcopy(affix)
        aff['name'] = word
        affixes.append(aff)

    return True


# convert a string in to a list of affixes
def string_to_affixes(affixStr, synMap):
    affixes = []
    if 'bonus to' in affixStr.lower():
        # Sometimes there's a redundant "bonus" (bonus bonus)
        search = re.search(r'\+?(\d+)%? ([A-Za-z]+)(?: bonus)? [Bb]onus to (.*)', affixStr)
    else:
        search = re.search(r'\+?(\d+)%?( )(.*)', affixStr)

    if(search):
        affix = {}
        affix['value'] = search.group(1).strip()
        affix['type'] = search.group(2).strip().title()
        affix['name'] = search.group(3).strip()

        if affix['name'][-1:] == '.':
            affix['name'] = affix['name'][:-1]

        # check to see if we have any already defined synonyms for this affix
        # important this is done alternatively to splitting so we can prevent splitting of known synonyms
        # such as Physical and Magical Sheltering --> Sheltering
        if affix['name'] not in synMap:
            # attempt to automatically determine multiple affixes on a single line
            # split_list function will update affixes if multiple affixes are detected
            split_list(affix, affixes)

        # if split_list function did not populate the exisitng affixes hash, we add the affix to the list manually
        if not(len(affixes)):
            affixes.append(affix)

        # loop through entries in affix list and update names based on synonym map
        for entry in affixes:
            if ((entry['name'] == 'Natural Armor') and (entry['type'] == 'Artifact')):
                entry['type'] = 'Artifact Natural'

            if ((entry['name'] == 'Natural Armor') and (entry['type'] == 'Profane')):
                entry['type'] = 'Profane Natural'

            if ((entry['name'] == 'Shield Armor Class') and (entry['type'] == 'Artifact')):
                entry['type'] = 'Artifact Shield'

            if entry['type'] == 'Insightful':
                entry['type'] = 'Insight'

            if entry['name'] in synMap:
                entry['name'] = synMap[entry['name']]

            # treat armor class % increase bonus as a uniquely new affix (for now)
            if ((entry['name'] == 'Armor Class') and ('%' in affixStr)):
                entry['name'] = entry['name']+' (%)'

    return affixes


def list_items_to_affixes(listItems, synMap):
    affixes = []

    if listItems:
        for entry in listItems:
            affixes = affixes + string_to_affixes(entry.get_text(), synMap)

    return affixes


def get_sets_from_page(soup):
    synMap = get_inverted_synonym_map()

    sets = {}

    tables = soup.find(id='bodyContent').find(id='mw-content-text').contents[0].find_all('table', class_="wikitable")

    # *** can refactor to not loop through all tables on the page once pass one is merged and source page is cleaned up
    # table = soup.find(id='bodyContent').find(id='mw-content-text').contents[0].find('table', class_="wikitable")

    for table in tables:
        rows = table.find_all('tr')

        # safe to assume the first row will have the headers we are looking for
        setNameCell = rows[0].find('th', string=re.compile('Set name'))
        if setNameCell:
            setNameIdx = rows[0].find_all('th').index(setNameCell)

        setEffectsCell = rows[0].find('th', string=re.compile('Effects'))
        setEffectsCell = rows[0].find('th', string=re.compile('Effect'))
        if setEffectsCell:
            setEffectsIdx = rows[0].find_all('th').index(setEffectsCell)

        if (not setNameCell) or (not setEffectsCell):
            print("Unable to detect Set Name or Effects cell -- Skipping table")
            continue

        for row in rows[1:]:
            cells = row.find_all('td')

            # parse out set name
            setName = cells[setNameIdx].get_text(strip=True)
            setEffectMapList = []

            effectsParagraphs = cells[setEffectsIdx].find_all('p')
            for p in effectsParagraphs:

                # calculate threshold (# of pieces)
                search = re.search(r'([0-9])+ Pieces Equipped.*$', p.getText())

                if search:
                    threshold = int(search.group(1))
                else:
                    print(f"Malformed Effects cell detected in {setName} (no Pieces Equipped value found)")
                    continue

                ul = p.findNextSibling('ul')
                listItems = ul.find_all('li')
                affixes = list_items_to_affixes(listItems, synMap)

                setEffectsMap = {}
                setEffectsMap['affixes'] = affixes
                setEffectsMap['threshold'] = threshold

                # *** temporary hard code some sets to not populate sets map to maintain parity with current data
                # *** this can be removed as set effect data is corrected/updated on the back end source pages
                if (setName == "Air Savant"
                    or setName == "Archmage"
                    or setName == "DM's Vision"
                    or setName == "Deepwood Sniper"
                    or setName == "Earth Savant"
                    or setName == "Fire Savant"
                    or setName == "Hunter of the Dead"
                    or setName == "Knight of the Chalice"
                    or setName == "Mechanic"
                    or setName == "Ninja Spy"
                    or setName == "Occult Slayer"
                    or setName == "Pale Master"
                    or setName == "Purple Dragon Knight"
                    or setName == "Radiant Servant"
                    or setName == "Ravager"
                    or setName == "Shintao Monk"
                    or setName == "Stalwart Defender"
                    or setName == "Tempest"
                    or setName == "Thief Acrobat"
                    or setName == "Virtuoso"
                    or setName == "Warchanter"
                    or setName == "Warpriest"
                    or setName == "Water Savant"
                    or setName == "Wild Mage"
                    ) :
                    continue

                if setName not in sets:
                    sets[setName] = []

                # *** temporary hard code some sets to populate sets map with empty set to maintain parity with current data
                # *** this can be removed as set effect data is corrected/updated on the back end source pages
                if (setName == "Alchemist's Lore"
                    or setName == "Anger's Wrath"
                    or setName == "Arcane Archer"
                    or setName == "Arcane Mind"
                    or setName == "Assassin"
                    or setName == "Defender of Siberys"
                    or setName == "Devoted Heart"
                    or setName == "Draconic Ferocity"
                    or setName == "Draconic Mind"
                    or setName == "Draconic Resilience"
                    or setName == "Dragonmark Heir"
                    or setName == "Epic Elemental Evil Set"
                    or setName == "Exorcist of the Silver Flame"
                    or setName == "Fabricator's Ingenuity"
                    or setName == "Frenzied Berserker"
                    or setName == "Glacial Assault"
                    or setName == "Henshin Mystic"
                    or setName == "Kensai"
                    or setName == "Levik's Defender"
                    or setName == "Lorikk's Champion"
                    or setName == "Magewright's Expertise"
                    or setName == "Nimble Hand"
                    or setName == "Pain and Suffering"
                    or setName == "Pathfinders"
                    or setName == "Planar Focus: Erudition"
                    or setName == "Planar Focus: Prowess"
                    or setName == "Planar Focus: Subterfuge"
                    or setName == "Protector's Heart"
                    or setName == "Risk and Reward"
                    or setName == "Spell Singer"
                    or setName == "Tharne's Wrath"
                    or setName == "Tinker's Finesse"
                    or setName == "Troubleshooter"
                    or setName == "Unbreakable Adamancy"
                    ) :
                    continue

                if affixes != []:
                    sets[setName].append(setEffectsMap)

    return sets


def parse_set_page():
    page = open('./cache/sets/Raw data_Sets.html', "r", encoding='utf-8').read()

    soup = BeautifulSoup(page, 'html.parser')

    sets = get_sets_from_page(soup)

    slaversSets = parse_slavers_sets()

    lostPurposeSets = get_lost_purpose_sets()

    sets = {**sets, **slaversSets}

    write_json(sets, 'sets')


if __name__ == "__main__":
    parse_set_page()