from bs4 import BeautifulSoup
import requests
import os
import re
import json
import collections
from roman_numerals import int_from_roman_numeral
from write_json import write_json
from read_json import read_json

def get_artifacts_from_page(soup):

    cols = {}

    table = soup.find(id='bodyContent').find(id='mw-content-text').find('div').find('table', class_="wikitable").find('tbody')
    for idx, col in enumerate(table.find_all('th')):
        cols[col.getText().strip()] = idx

    rows = table.find_all('tr', recursive=False)

    # For some reason, the header is showing up as a row
    rows.pop(0)

    artifacts = []

    for row in rows:
        fields = row.find_all('td', recursive=False)

        itemLink = fields[cols['Item']].find('a')
        artifacts.append(itemLink.getText().strip())

    return artifacts

# Modify the existing items list to add the artifact tag
def parse_minor_artifacts():
    items = read_json('items')

    page = open('./cache/minor_artifacts/Minor_Artifacts.html', "r", encoding='utf-8').read()

    soup = BeautifulSoup(page, 'html.parser')

    artifacts = get_artifacts_from_page(soup)

    for item in items:
        if item['name'] in artifacts:
            item['artifact'] = True

    write_json(items, 'items')


if __name__ == "__main__":
    parse_minor_artifacts()
