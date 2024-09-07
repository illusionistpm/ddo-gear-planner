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

    add(groups, 'Enhancement Bonus (Armor)', ['Armor Class'])
    add(groups, 'Enhancement Bonus (Weapon)', ['Accuracy', 'Damage'])
    add(groups, 'Negative and Poison Spell Crit Damage', ['Negative Spell Crit Damage', 'Poison Spell Crit Damage'])
    add(groups, 'Resistance', get_all_saves())
    # special case exists where Litany of the Dead Ability Bonus is really well rounded affix
    # but we treat as an affix group to keep consistency with Litany of the Dead Combat Bonus affix
    add(groups, 'Litany of the Dead - Ability Bonus', ['Well Rounded'])
    add(groups, 'Litany of the Dead II - Ability Bonus', ['Well Rounded'])
    add(groups, 'Litany of the Dead - Combat Bonus', ['Accuracy', 'Damage'])
    add(groups, 'Litany of the Dead II - Combat Bonus', ['Accurary', 'Damage'])
    add(groups, 'Parrying', parrying)
    add(groups, 'Sheltering', ['Physical Sheltering', 'Magical Sheltering'])
    add(groups, 'Potency', ['Nullification', 'Radiance', 'Devotion', 'Corrosion', 'Combustion', 'Magnetic', 'Glaciation', 'Reconstruction', 'Impulse', 'Resonance'])
    add(groups, 'Spell Lore', ['Nullification Lore', 'Radiance Lore', 'Devotion Lore', 'Corrosion Lore', 'Combustion Lore', 'Magnetic Lore', 'Glaciation Lore', 'Reconstruction Lore', 'Impulse Lore', 'Resonance'])
    add(groups, 'Combat Mastery', ['Vertigo', 'Stunning', 'Dazing', 'Sundering', 'Shatter'])
    add(groups, 'Alluring Skills Bonus', ['Bluff', 'Diplomacy', 'Haggle', 'Intimidate', 'Perform'])
    add(groups, 'Charisma Skills', ['Bluff', 'Diplomacy', 'Haggle', 'Intimidate', 'Perform'])
    add(groups, 'Frozen Depths Lore', ['Ice Lore', 'Poison Lore', 'Void Lore'])
    add(groups, 'Frozen Storm Lore', ['Ice Lore', 'Lightning Lore'])
    add(groups, 'Intelligence Skills', ['Disable Device', 'Repair', 'Search', 'Spellcraft'])
    add(groups, 'Dexterity Skills', ['Balance', 'Hide', 'Move Silently', 'Open Locks', 'Tumble'])
    add(groups, 'Power of the Frozen Storm', ['Glaciation', 'Magnetism'])
    add(groups, 'Power of the Frozen Depths', ['Glaciation', 'Nullification', 'Poison'])
    add(groups, 'Power of the Flames of Purity', ['Combustion', 'Radiance'])
    add(groups, 'Power of the Silver Flame', ['Devotion', 'Radiance'])
    add(groups, 'Purifying Flame Lore', ['Fire Lore', 'Radiance Lore'])
    add(groups, 'Strength Skills', ['Jump'])
    add(groups, 'Wisdom Skills', ['Heal', 'Listen', 'Spot'])
    add(groups, 'Constitution Skills', ['Concentration'])
    add(groups, 'Well Rounded', ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'])
    add(groups, 'Lifesealed', ['Deathblock', 'Negative Energy Absorption'])
    add(groups, 'Spell Focus Mastery', ['Evocation Focus', 'Necromancy Focus', 'Transmutation Focus', 'Enchantment Focus', 'Conjuration Focus', 'Abjuration Focus', 'Illusion Focus'])
    add(groups, 'each Amplification', ['Healing Amplification', 'Negative Amplification', 'Repair Amplification'])

    write_json(groups, 'affix-groups')


if __name__ == "__main__":
    build_affix_groups()