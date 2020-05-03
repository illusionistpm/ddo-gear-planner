from bs4 import BeautifulSoup
import requests
import os
import re
import json
import collections
from write_json import write_json

def get_raids_from_page(soup):
    raids = []

    table = soup.find(id='bodyContent').find(id='mw-content-text').find('div').find('table', class_="wikitable").find('tbody')
    rows = table.find_all('tr', recursive=False)

    # For some reason, the header is showing up as a row
    rows.pop(0)

    for row in rows:
        cells = row.find_all('td')
        raids.append(cells[0].getText().strip())

    return raids


def parse_quests():
    page = open('./cache/quests/Raids.html', "r", encoding='utf-8').read()

    soup = BeautifulSoup(page, 'html.parser')

    raids = get_raids_from_page(soup)

    out = {}
    out['raids'] = raids

    write_json(out, 'quests')


if __name__ == "__main__":
    parse_quests()