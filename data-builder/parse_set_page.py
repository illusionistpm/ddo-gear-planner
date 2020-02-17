from bs4 import BeautifulSoup
import requests
import os
import re
import json
from copy import deepcopy
import collections
from parse_slavers import parse_slavers_sets
from write_json import write_json

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

    for suffix in ['Healing Amplification', 'Spell Power', 'Spell Crit Chance', 'Absorption']:
        if words[-1].endswith(suffix):
            for idx, word in enumerate(words[0:-1], 0):
                words[idx] = word + " " + suffix

    for word in words:
        aff = deepcopy(affix)
        aff['name'] = word
        affixes.append(aff)

    return True


def get_sets_from_page(soup):
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

            setName = cells[setNameIdx].getText().strip()

            if not setName in sets:
                sets[setName] = []

            bonusCell = cells[setBonusIdx]

            numItemsSearch = re.search(r'While wearing ((any )?([a-z]+)|both) items', bonusCell.getText())
            if numItemsSearch:
                numStr = numItemsSearch.group(3).strip()

                switch = {
                    'one': 1,
                    'both': 2,
                    'two': 2,
                    'three': 3,
                    'four': 4,
                    'five': 5,
                    'six': 6
                }
                num = switch.get(numStr, 99999)

                affixes = []

                threshold = {}
                threshold['threshold'] = num
                threshold['affixes'] = affixes

                sets[setName].append(threshold)

                listItems = bonusCell.find_all('li')

                if listItems:
                    for entry in listItems:
                        if 'bonus to' in entry.getText().lower():
                            search = re.search(r'\+?(\d+)%? ([A-Za-z]+) [b|B]onus to (.*)', entry.getText())
                        else:
                            search = re.search(r'\+?(\d+)%?( )(.*)', entry.getText())

                        if(search):
                            affix = {}
                            affix['value'] = search.group(1).strip()
                            affix['type'] = search.group(2).strip().title()
                            affix['name'] = search.group(3).strip()

                            if affix['name'][-1:] == '.':
                                affix['name'] = affix['name'][:-1]

                            if affix['name'] in ['Melee Power/Ranged Power', "Melee and Ranged Power"]:
                                newAffix = deepcopy(affix)
                                newAffix['name'] = 'Melee Power'
                                affix['name'] = 'Ranged Power'
                                affixes.append(newAffix)
                            elif split_list(affix, affixes):
                                continue

                            affixes.append(affix)

    return sets


def parse_set_page():
    page = open('./cache/sets/Named_item_sets.html', "r", encoding='utf-8').read()

    soup = BeautifulSoup(page, 'html.parser')

    sets = get_sets_from_page(soup)

    slaversSets = parse_slavers_sets()

    sets = {**sets, **slaversSets}

    write_json(sets, 'sets')


if __name__ == "__main__":
    parse_set_page()