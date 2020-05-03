import json
from write_json import write_json

def add(data, mainName, synonyms):
    group = {}
    group['name'] = mainName
    group['synonyms'] = synonyms
    data.append(group)


def build_synonyms():
    data = []

    add(data, 'Armor Class', ['AC'])
    add(data, 'Armor-Piercing', ['Fortification Bypass'])
    add(data, 'False Life', ['Hit Points'])
    add(data, 'Speed', ['Striding'])
    add(data, 'Physical Sheltering', ['Physical Resistance Rating', 'PRR'])
    add(data, 'Magical Sheltering', ['Magical Resistance Rating', 'MRR'])
    add(data, 'Spell Focus Mastery', ['Spell DCs'])

    write_json(data, 'affix-synonyms')

    
if __name__ == "__main__":
    build_synonyms()