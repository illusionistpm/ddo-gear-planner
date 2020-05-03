from bs4 import BeautifulSoup
import requests
import os
import re
import json
import collections

with open("../site/src/assets/items.json", 'r', encoding='utf8') as file:
    affixes = set()
    items = json.load(file)
    #print(json.dumps(data, indent=4, sort_keys=True))
    for item in items:
        for affix in item['affixes']:
            affixes.add(affix['name'])

for affix in sorted(affixes, key=str.casefold):
    print(affix)
