from bs4 import BeautifulSoup
import requests
import os
import re
import json
import collections
from read_json import read_json

items = read_json('items')
affixes = set()

#print(json.dumps(data, indent=4, sort_keys=True))
for item in items:
    for affix in item['affixes']:
        affixes.add(affix['name'])

for affix in sorted(affixes, key=str.casefold):
    print(affix)
