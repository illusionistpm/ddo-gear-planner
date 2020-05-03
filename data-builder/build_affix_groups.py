import json
from write_json import write_json

def get_all_saves(bonusType = None):
    return ['Will Save', 'Fortitude Save', 'Reflex Save']


def add(groups, name, list):
    group = {}
    group['name'] = name
    group['affixes'] = list
    groups.append(group)


def build_affix_groups():
    groups = []

    parrying = get_all_saves()
    parrying.append('Armor Class')

    add(groups, 'Resistance', get_all_saves())
    add(groups, 'Parrying', parrying)
    add(groups, 'Sheltering', ['Physical Sheltering', 'Magical Sheltering'])
    add(groups, 'Potency', ['Nullification', 'Radiance', 'Devotion', 'Corrosion', 'Combustion', 'Magnetic', 'Glaciation', 'Reconstruction', 'Impulse', 'Resonance'])
    add(groups, 'Combat Mastery', ['Vertigo', 'Stunning', 'Dazing', 'Sundering', 'Shatter'])
    add(groups, 'Alluring Skills Bonus', ['Bluff', 'Diplomacy', 'Haggle', 'Intimidate', 'Perform'])
    add(groups, 'Charisma Skills', ['Bluff', 'Diplomacy', 'Haggle', 'Intimidate', 'Perform'])
    add(groups, 'Intelligence Skills', ['Disable Device', 'Repair', 'Search', 'Spellcraft'])
    add(groups, 'Dexterity Skills', ['Balance', 'Hide', 'Move Silently', 'Open Locks', 'Tumble'])
    add(groups, 'Strength Skills', ['Jump'])
    add(groups, 'Wisdom Skills', ['Heal', 'Listen', 'Spot'])
    add(groups, 'Constitution Skills', ['Concentration'])
    add(groups, 'Well Rounded', ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'])
    add(groups, 'Lifesealed', ['Deathblock', 'Negative Energy Absorption'])
    add(groups, 'Spell Focus Mastery', ['Evocation Focus', 'Necromancy Focus', 'Transmutation Focus', 'Enchantment Focus', 'Conjuration Focus', 'Abjuration Focus', 'Illusion Focus'])

    write_json(groups, 'affix-groups')

    
if __name__ == "__main__":
    build_affix_groups()