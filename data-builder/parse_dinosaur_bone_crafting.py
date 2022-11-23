from bs4 import BeautifulSoup
import requests
import os
import re
import json
import collections
from roman_numerals import int_from_roman_numeral
from write_json import write_json
from read_json import read_json

def get_systems_from_page(itemPageURL, sets):
    synonymMap = get_inverted_synonym_map()

    print("Parsing " + itemPageURL)
    page = open(itemPageURL, "r", encoding='utf-8').read()

    soup = BeautifulSoup(page, 'html.parser')

    tables = soup.find(id='bodyContent').find(id='mw-content-text').find('div').find_all('table', class_="wikitable").find('tbody')

    systems = {}

    for table in tables:
        headers = table.find_all('th')
        # Skip any tables that don't include Effects
        if headers[1] != 'Effect':
            continue

        system_name = headers[0]

        systems[system_name] = {'*': []}

        rows = table.find_all('tr', recursive=False)
        rows.pop()

        for row in rows:
            fields = row.find_all('td', recursive=False)            

            affix = {}
            affix['name'] = fields[0]
            affix['value'] = value
            affix['type'] = bonusType

            option = {}
            option['affixes'] = [affix]

            systems[system_name]['*'].append(option)

def parse_dinosaur_bone_crafting():
    items = read_json('items')
        
    page = open('./cache/crafting/Dinosaur_Bone_crafting.html', "r", encoding='utf-8').read()

    soup = BeautifulSoup(page, 'html.parser')

    systems = get_systems_from_page(soup)

    return systems

