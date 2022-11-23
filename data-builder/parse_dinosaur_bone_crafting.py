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

        system_name = headers[0].getText()

        systems[system_name] = {'*': []}

        rows = body.find_all('tr', recursive=False)

        for row in rows[1:]:
            fields = row.find_all('td', recursive=False)

            affixes = parse_affixes_from_cell(fields[1], synonymMap, fake_bonuses, None)

            option = {}
            option['affixes'] = affixes

            systems[system_name]['*'].append(option)

    return systems

def parse_dinosaur_bone_crafting():        
    page = open('./cache/crafting/Dinosaur_Bone_crafting.html', "r", encoding='utf-8').read()

    soup = BeautifulSoup(page, 'html.parser')

    systems = get_systems_from_page(soup)
    return systems

if __name__ == "__main__":
    system = parse_dinosaur_bone_crafting()
    pprint(system)