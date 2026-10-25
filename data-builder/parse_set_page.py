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
from parse_affixes_from_cell import get_affix_map_list_from_tag

# Since Update 81.4, a set bonus labelled "Universal" spell power / lore / crit damage
# is applied to each element separately, so it no longer stacks with a same-type
# element bonus. Item affixes (Exceptional, Implement, ...) keep the stacking Universal
# behaviour, so only set bonuses are rewritten to the per-element groups.
SET_UNIVERSAL_TO_PER_ELEMENT = {
    'Universal Spell Power': 'Potency',
    'Universal Spell Lore': 'Spell Lore',
    'Universal Spell Critical Damage': 'Spell Critical Damage',
}

def normalize_set_universal_affixes(sets):
    for tiers in sets.values():
        for tier in tiers:
            for affix in tier['affixes']:
                affix['name'] = SET_UNIVERSAL_TO_PER_ELEMENT.get(affix['name'], affix['name'])
    return sets

def get_sets_from_page(soup):
    synMap = get_inverted_synonym_map()

    sets = {}

    content_root = soup.find(id='mw-content-text') or soup.find(class_='mw-parser-output') or soup
    setTable = content_root.find('table', class_=lambda value: value and 'wikitable' in value)
    if setTable is None:
        raise RuntimeError('Could not locate the sets table in the downloaded page. ' \
                           'Verify the cache file and the wiki page format.')

    rows = setTable.find_all('tr')
    if not rows:
        raise RuntimeError('Set table found but it contains no rows.')

    headers = [cell.get_text(strip=True) for cell in rows[0].find_all(['th', 'td'])]
    print(f"Found sets table with headers: {headers}")

    setNameIdx = next((i for i, h in enumerate(headers) if re.search(r'Set\s*name', h, re.I)), None)
    if setNameIdx is None:
        setNameIdx = next((i for i, h in enumerate(headers) if re.search(r'\bName\b', h, re.I)), None)

    setEffectsIdx = next((i for i, h in enumerate(headers) if re.search(r'Effect', h, re.I)), None)
    if setEffectsIdx is None:
        setEffectsIdx = next((i for i, h in enumerate(headers) if re.search(r'Effects', h, re.I)), None)

    if setNameIdx is None or setEffectsIdx is None:
        raise RuntimeError(f"Unable to determine set name/effects column indexes from headers: {headers}")

    for row in rows[1:]:
        cells = row.find_all('td')

        # parse out set name
        setName = cells[setNameIdx].get_text(strip=True)
        setEffectMapList = []

        effectsCell = cells[setEffectsIdx]
        effectsParagraphs = effectsCell.find_all('p') or [effectsCell]
        for p in effectsParagraphs:

            # calculate threshold (# of pieces)
            search = re.search(r'([0-9]+)\s*Pieces Equipped.*$', p.getText())

            if search:
                threshold = int(search.group(1))
            else:
                print(f"Malformed Effects cell detected in {setName} (no Pieces Equipped value found)")
                continue

            affixesList = []
            ul = p.find_next_sibling('ul')
            if ul is None:
                ul = p.find('ul')
            if ul is None:
                ul = effectsCell.find('ul')

            affixes = get_affix_map_list_from_tag(ul)

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

    sets = normalize_set_universal_affixes({**sets, **slaversSets})

    write_json(sets, 'sets')


if __name__ == "__main__":
    parse_set_page()