from bs4 import BeautifulSoup
import requests
import os
import re
import json
import collections
from read_json import read_json

def get_most_common_bonus_type():
    items = read_json('items')
    affixes = {}
    for item in items:
        for affix in item['affixes']:
            if 'name' in affix and 'type' in affix:
                if affix['name'] not in affixes:
                    affixes[affix['name']] = {}
                if affix['type'] not in affixes[affix['name']]:
                    affixes[affix['name']][affix['type']] = 0

                affixes[affix['name']][affix['type']] = affixes[affix['name']][affix['type']] + 1

    bestBonusMap = {}

    # set initial value to help with development
    bestBonus = None

    for affix, v in affixes.items():
        maxCount = 0

        for bonusType, count in v.items():
            if count > maxCount and bonusType not in ['Profane', 'Insight']:
                maxCount = count
                bestBonus = bonusType

        bestBonusMap[affix] = bestBonus

    return bestBonusMap
