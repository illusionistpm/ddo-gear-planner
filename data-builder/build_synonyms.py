import json
from write_json import write_json

def add(data, mainName, synonyms):
    group = {}
    group['name'] = mainName
    group['synonyms'] = synonyms
    data.append(group)


def build_synonyms():
    data = []

    add(data, 'Armor Class', ['AC', 'Armor Bonus', 'Natural Armor', 'Natural Armor Bonus', 'Protection', 'Rough Hide', 'Shield'])
    add(data, 'Armor-Piercing', ['Fortification Bypass'])
    add(data, 'Devotion', ['Positive Spell Power', 'Positive Spellpower'])
    add(data, 'Evocation Focus', ['Evocation Spell DCs'])
    add(data, 'False Life', ['Hit Points', 'Lifeforce', 'Maximum HP', 'Maximum Hit Points', 'maximum hitpoints', 'Vitality', 'your maximum hit points'])
    add(data, 'Healing Lore', ['Positive Spell Crit Chance', 'Positive Spellcrit Chance'])
    add(data, 'Speed', ['Striding'])
    add(data, 'Physical Sheltering', ['Physical Resistance Rating', 'PRR'])
    add(data, 'Magical Sheltering', ['Magical Resistance Rating', 'MRR', 'your Magical Resistance Rating'])
    add(data, 'Magical Sheltering Cap', ['Magical Resistance Rating Cap', 'MRR Cap'])
    add(data, 'Sheltering', ['Physical and Magical Resistance Rating'])
    add(data, 'Spell Focus Mastery', ['all Spell DCs', 'all spell DCs', 'DCs', 'Spell DC\'s', 'Spell DCs'])
    add(data, 'Spell Points', ['your maximum Spell Points'])
    add(data, 'Tactical Abilities', ['your Tactical Abilities'])
    add(data, 'Void Lore', ['Negative Spell Crit Chance'])
    add(data, 'Nullification', ['Negative Spell Power'])
    add(data, 'Healing Amplification', ['Positive Healing Amplification'])
    add(data, 'Negative Amplification', ['Negative Healing Amplification'])
    add(data, 'Repair Amplification', ['Repair Healing Amplification'])
    add(data, 'Well Rounded', ['All Ability Scores', 'all Ability Scores', 'all of your Ability Scores', 'Well-Rounded'])

    write_json(data, 'affix-synonyms')


if __name__ == "__main__":
    build_synonyms()
