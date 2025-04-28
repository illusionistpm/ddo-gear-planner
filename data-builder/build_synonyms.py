import json
from write_json import write_json

def add(data, mainName, synonyms):
    group = {}
    group['name'] = mainName
    group['synonyms'] = synonyms
    data.append(group)


def build_synonyms():
    data = []

    add(data, 'Accuracy', ['Attack', 'Hit', 'hit', 'Attack Bonus'])
    add(data, 'Armor Class', ['AC', 'Armor Bonus', 'Natural Armor', 'Natural Armor Bonus', 'Protection', 'Rough Hide', 'Shield', 'Shield Armor Class'])
    # probably want to standardize on 'Armor Piercing' as the name, but re-work needs to be done on cannith crafting to remove drift
    add(data, 'Armor-Piercing', ['Armor Piercing', 'Fortification Bypass', 'Fortification bypass'])
    add(data, 'Assassinate', ['Assassinate DCs'])
    add(data, 'Deadly', ['Damage', 'Damage Bonus'])
    add(data, 'Devotion', ['Positive Spell Power', 'Positive Spellpower'])
    add(data, 'Evocation Focus', ['Evocation Spell DCs'])
    add(data, 'False Life', ['Hit Points', 'Lifeforce', 'Maximum HP', 'Maximum Hit Points', 'maximum hitpoints', 'Vitality', 'your maximum hit points'])
    add(data, 'Force Spell Crit Damage', ['Force and Physical Spell Crit Damage'])
    add(data, 'Healing Lore', ['Positive Spell Crit Chance', 'Positive Spellcrit Chance'])
    add(data, 'Light Spell Crit Damage', ['Light and Alignment Spell Crit Damage'])
    add(data, 'Seeker', ['Critical Confirmation and Critical Damage'])
    add(data, 'Void Lore', ['Negative Spell Crit Chance', 'Negative Lore'])
    add(data, 'Deception', ['Sneak Attacks'])
    add(data, 'Speed', ['Striding'])
    add(data, 'Physical Sheltering', ['Physical Resistance Rating', 'PRR'])
    add(data, 'Magical Sheltering', ['Magical Resistance Rating', 'MRR', 'your Magical Resistance Rating'])
    add(data, 'Magical Sheltering Cap', ['Magical Resistance Rating Cap', 'MRR Cap'])
    add(data, 'Sheltering', ['Physical and Magical Resistance Rating'])
    add(data, 'Spell Focus Mastery', ['DCs', 'Spell DCs', 'all Spell DCs', 'all spell DCs', 'Spell DC\'s'])
    add(data, 'Spell Points', ['your maximum Spell Points'])
    add(data, 'Stunning', ['Stunning DCs'])
    add(data, 'Sunder', ['Sunder DCs'])
    add(data, 'Tactical Abilities', ['your Tactical Abilities'])
    add(data, 'Trip', ['Trip DCs'])
    add(data, 'Universal Spell Power', ['Spellcasting Implement', 'Universal Spellpower'])
    add(data, 'Nullification', ['Negative Spell Power'])
    add(data, 'Healing Amplification', ['Positive Healing Amplification', 'Positive Amplification'])
    add(data, 'Negative Amplification', ['Negative Healing Amplification'])
    add(data, 'Repair Amplification', ['Repair Healing Amplification'])
    add(data, 'Well Rounded', ['All Ability Scores', 'all Ability Scores', 'all of your Ability Scores', 'Well-Rounded'])
    add(data, 'Sundering', ['Sunder', 'Sunder DC'])
    add(data, 'Vertigo', ['Trip', 'Trip DC'])
    add(data, 'Silver', ['Silver , Alchemical'])
    add(data, 'Arcane Casting Dexterity', ['reduce your Arcane Spell Failure by', 'Arcane Spell Failure'])

    write_json(data, 'affix-synonyms')


if __name__ == "__main__":
    build_synonyms()
