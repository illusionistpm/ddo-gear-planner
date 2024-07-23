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

def sub_name(name):
    for pair in [
        ['all Spell DCs', 'Spell DCs'],
        ['Shield Armor Class', 'Armor Class'],
        ['Spell DC\'s', 'Spell DCs'],
        ['DCs', 'Spell DCs'],
        ['Evocation Spell DCs', 'Evocation Focus'],
        ['your Magical Resistance Rating', 'Magical Resistance Rating'],
        ['your Tactical Abilities', 'Tactical Abilities'],
        ['maximum hitpoints', 'Hit Points'],
        ['your maximum hit points', 'Hit Points'],
        ['your maximum Spell Points', 'Spell Points'],
        ['all of your Ability Scores', 'Well-Rounded'],
        ['all Ability Scores', 'Well-Rounded']
        ]:
        if name.lower() == pair[0].lower():
            return pair[1]
    return name

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

    for suffix in ['Healing Amplification', 'Spell Power', 'Spell Crit Chance', 'Absorption', 'Amplification', 'Resistance Rating']:
        if words[-1].endswith(suffix):
            for idx, word in enumerate(words[0:-1], 0):
                words[idx] = word + " " + suffix
            break

    for word in words:
        aff = deepcopy(affix)
        aff['name'] = word
        affixes.append(aff)

    return True


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

        if ((affix['name'] == 'Natural Armor') and (affix['type'] == 'Artifact')):
            affix['type'] = 'Artifact Natural'

        if ((affix['name'] == 'Natural Armor') and (affix['type'] == 'Profane')):
            affix['type'] = 'Profane Natural'

        if ((affix['name'] == 'Shield Armor Class') and (affix['type'] == 'Artifact')):
            affix['type'] = 'Artifact Shield'

        if affix['name'] in synMap:
            affix['name'] = synMap[affix['name']]

        if affix['name'] in ['Melee Power/Ranged Power', "Melee and Ranged Power"]:
            newAffix = deepcopy(affix)
            newAffix['name'] = 'Melee Power'
            affix['name'] = 'Ranged Power'
            affixes.append(newAffix)
        elif split_list(affix, affixes):
            return affixes

        affix['name'] = sub_name(affix['name'])

        if affix['name'] in synMap:
            affix['name'] = synMap[affix['name']]

        # treat armor class % increase bonus as a uniquely new affix (for now)
        if ((affix['name'] == 'Armor Class') and ('%' in affixStr)):
            affix['name'] = affix['name']+' (%)'

        affixes.append(affix)

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
    for table in tables:
        rows = table.find_all('tr')

        setNameIdx = -1
        setBonusIdx = -1

        headers = rows[0].find_all('th')
        expectedCols = len(headers)

        for i, cell in enumerate(headers, start=0):
            if cell.getText().strip() == 'Set name':
                setNameIdx = i
            elif cell.getText().strip() == 'Set bonus effect':
                setBonusIdx = i

        if setNameIdx == -1 or setBonusIdx == -1:
            print("Skipping table")
            continue

        for row in rows[1:]:
            cells = row.find_all('td')

            # some rows are just descriptions and don't have all the cells
            if len(cells) != expectedCols:
                continue

            setName = cells[setNameIdx].find_all("b")[0].getText().strip()

            # Some set names have their ML in their title
            if '[ML:' in setName:
                setName = setName.split('[ML:')[0].strip()

            if not setName in sets:
                sets[setName] = []

            bonusCell = cells[setBonusIdx]

            # Look for Feywild-style sets, with an additional bonus with each item
            bFoundSetParagraph = False
            paragraphs = bonusCell.find_all('p')

            # Not all sets have paragraphs that contain their effect descriptions:

            for p in paragraphs:
                bonusSearch = re.search(r'([1-9]) (Pieces|Item) Equipped:', p.getText())
                if bonusSearch:
                    bFoundSetParagraph = True
                    num = int(bonusSearch.group(1))

                    ul = p.findNextSibling('ul')

                    if ul is None:
                        # this is likely an augment-based set bonus that just has a single line contained within the 'p'
                        affixes = string_to_affixes(p.string, synMap)
                    else:
                        listItems = ul.find_all('li')

                        affixes = list_items_to_affixes(listItems, synMap)

                    threshold = {}
                    threshold['threshold'] = num
                    threshold['affixes'] = affixes

                    sets[setName].append(threshold)

            if not bFoundSetParagraph and len(bonusCell.find_all('br')) != 0:
                # Sometimes the bonuses are just separated with <br> (e.g., Raven's Eye)
                td = bonusCell.find('td')
                if td:
                    brBlocks = td.get_text(strip=True, separator='\n').splitlines()
                    bonusSearch = re.search(r'([1-9]) (Pieces|Item) Equipped:', brBlocks[0])
                    if bonusSearch:
                        bFoundSetParagraph = True
                        num = int(bonusSearch.group(1))

                        affixes = list_items_to_affixes(brBlocks[1:], synMap)

                        threshold = {}
                        threshold['threshold'] = num
                        threshold['affixes'] = affixes

                        sets[setName].append(threshold)

            # Look for older, more standard sets, where bonuses are all-or-nothing
            if not bFoundSetParagraph:
                numItemsSearch = re.search(r'While wearing ((any )?([a-z]+|both|[1-9])) (items|pieces)', bonusCell.getText())
                if numItemsSearch:
                    numStr = numItemsSearch.group(3).strip()

                    if numStr.isnumeric():
                        num = int(numStr)
                    else:
                        switch = {
                            'one': 1,
                            'both': 2,
                            'two': 2,
                            'three': 3,
                            'four': 4,
                            'five': 5,
                            'six': 6,
                            'seven': 7
                        }
                        num = switch.get(numStr, 99999)

                    listItems = bonusCell.find_all('li')

                    if len(listItems) > 0:
                        affixes = list_items_to_affixes(listItems, synMap)

                        threshold = {}
                        threshold['threshold'] = num
                        threshold['affixes'] = affixes

                        sets[setName].append(threshold)
                    else:
                        # Sets like Griffon Set where the bonus(es) are simple paragraphs
                        paragraphs = bonusCell.find_all('p')

                        affixes = list_items_to_affixes(paragraphs[1:], synMap)

                        threshold = {}
                        threshold['threshold'] = num
                        threshold['affixes'] = affixes

                        sets[setName].append(threshold)

            if not bFoundSetParagraph:
                if (len(paragraphs) == 0):
                    bonusSearch = re.search(r'([1-9]) (Pieces|Item) Equipped:', bonusCell.getText())
                    if bonusSearch:
                        bFoundSetParagraph = True
                        num = int(bonusSearch.group(1))

                        ul = bonusCell.findChildren('ul')

                        if len(ul) == 0:
                            continue

                        if len(ul) > 1:
                            continue

                        listItems = ul[0].find_all('li')

                        affixes = list_items_to_affixes(listItems, synMap)

                        threshold = {}
                        threshold['threshold'] = num
                        threshold['affixes'] = affixes

                        sets[setName].append(threshold)

    return sets


def parse_set_page():
    page = open('./cache/sets/Named_item_sets.html', "r", encoding='utf-8').read()

    soup = BeautifulSoup(page, 'html.parser')

    sets = get_sets_from_page(soup)

    slaversSets = parse_slavers_sets()

    lostPurposeSets = get_lost_purpose_sets()

    sets = {**sets, **slaversSets}

    write_json(sets, 'sets')


if __name__ == "__main__":
    parse_set_page()