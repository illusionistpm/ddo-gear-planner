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
from parse_affixes_from_cell import get_affix_map_list_from_tag

def get_sets_from_page(soup):
    synMap = get_inverted_synonym_map()

    sets = {}

    setTable = soup.find(id='bodyContent').find(id='mw-content-text').contents[0].find('table', class_="wikitable")

    rows = setTable.find_all('tr')

    # safe to assume the first row will have the headers we are looking for
    setNameCell = rows[0].find('th', string=re.compile('Set name'))
    if setNameCell:
        setNameIdx = rows[0].find_all('th').index(setNameCell)

    setEffectsCell = rows[0].find('th', string=re.compile('Effect'))
    if setEffectsCell:
        setEffectsIdx = rows[0].find_all('th').index(setEffectsCell)

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

            affixes = get_affix_map_list_from_tag(p.findNextSibling('ul'))

            setEffectsMap = {}
            setEffectsMap['affixes'] = affixes
            setEffectsMap['threshold'] = threshold

            if setName not in sets:
                sets[setName] = []

            if affixes != []:
                sets[setName].append(setEffectsMap)

    return sets


def parse_set_page():
    page = open('./cache/sets/Raw data_Sets v2.html', "r", encoding='utf-8').read()

    soup = BeautifulSoup(page, 'html.parser')

    sets = get_sets_from_page(soup)

    slaversSets = parse_slavers_sets()

    lostPurposeSets = get_lost_purpose_sets()

    sets = {**sets, **slaversSets}

    write_json(sets, 'sets')


if __name__ == "__main__":
    parse_set_page()