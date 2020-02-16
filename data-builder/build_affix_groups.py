import json

def get_all_saves(bonusType = None):
    return ['Will Save', 'Fortitude Save', 'Reflex Save']


def add(groups, name, list):
    group = {}
    group['name'] = name
    group['affixes'] = list
    groups.append(group)


groups = []

parrying = get_all_saves()
parrying.append('Armor Class')

add(groups, 'Resistance', get_all_saves())
add(groups, 'Parrying', parrying)
add(groups, 'Sheltering', ['Physical Sheltering', 'Magical Sheltering'])
add(groups, 'Potency', ['Nullification', 'Radiance', 'Devotion', 'Corrosion', 'Combustion', 'Magnetic', 'Glaciation', 'Reconstruction', 'Impulse', 'Resonance'])

out = json.dumps(groups, sort_keys=True, indent=4)
open("../site/src/assets/affix-groups.json", 'w', encoding='utf8').write(out)

    
