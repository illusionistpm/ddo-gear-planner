from write_json import write_json

from compound_affixes import load_compound_affixes
from typedefs import Affix, AffixGroup, CompoundAffixComponent, CompoundAffixMap

def get_all_saves(bonusType = None) -> list[str]:
    return ['Fortitude Save', 'Reflex Save', 'Will Save']

def get_all_skills(bonusType = None) -> list[str]:
    return ['Balance', 'Bluff', 'Concentration', 'Diplomacy', 'Disable Device', 'Fortitude Save', 'Spot', 'Haggle', 'Heal', 'Hide', 'Intimidate', 'Jump', 'Listen', 'Move Silently', 'Open Lock', 'Perform', 'Reflex Save', 'Repair', 'Resistance', 'Search', 'Spellcraft', 'Spot', 'Swim', 'Tumble', 'Will Save', 'Use Magic Device']


def add(groups: list[AffixGroup], name: str, affixes: list[str]) -> None:
    groups.append({
        'name': name,
        'affixes': affixes
    })


def add_fixed(groups: list[AffixGroup], name: str, affixes: list[Affix]) -> None:
    upsert_fixed(groups, name, affixes)


def upsert_fixed(groups: list[AffixGroup], name: str, affixes: list[Affix]) -> None:
    entry = {
        'name': name,
        'affixes': [affix['name'] for affix in affixes],
        'components': affixes,
    }
    for index, group in enumerate(groups):
        if group['name'] == name:
            groups[index] = entry
            return
    groups.append(entry)


def _convert_compound_component(component: CompoundAffixComponent) -> Affix:
    value_spec = component['value']
    mode = value_spec['mode']
    if mode == 'fixed':
        value = value_spec['amount']
    elif mode == 'boolean_one':
        value = 1
    else:
        value = '<ValueAlreadyParsed>'

    bonus_type = component['type']
    if bonus_type == '__inherit_type__':
        bonus_type = '<TypeAlreadyParsed>'

    return {
        'name': component['name'],
        'type': bonus_type,
        'value': value,
    }


def add_compound_affix_groups(groups: list[AffixGroup], mapping: CompoundAffixMap | None = None) -> None:
    compound_affixes = mapping if mapping is not None else load_compound_affixes()
    for name, definition in sorted(compound_affixes.items()):
        components = definition.get('components', [])
        if components:
            upsert_fixed(groups, name, [_convert_compound_component(component) for component in components])


def build_affix_groups() -> None:
    groups: list[AffixGroup] = []

    parrying = get_all_saves()
    parrying.append('Armor Class')

    # Technically Armor/Weapon Enhancement Bonuses add to AC / Accuracy & Deadly, but we'd need to fake a channel for them
    # and I don't really care about them.
    #add(groups, 'Enhancement Bonus (Armor)', ['Armor Class'])
    #add(groups, 'Enhancement Bonus (Weapon)', ['Accuracy', 'Deadly'])
    add(groups, 'Good Luck', ['Resistance'] + get_all_saves() + get_all_skills())
    add(groups, 'Negative and Poison Spell Crit Damage', ['Negative Spell Crit Damage', 'Poison Spell Crit Damage'])
    add(groups, 'Resistance', get_all_saves())
    add(groups, 'Riposte', ['Armor Class', 'Resistance'] + get_all_saves())
    # special case exists where Litany of the Dead Ability Bonus is really well rounded affix
    # but we treat as an affix group to keep consistency with Litany of the Dead Combat Bonus affix
    add(groups, 'Litany of the Dead - Ability Bonus', ['Well Rounded'])
    add(groups, 'Litany of the Dead II - Ability Bonus', ['Well Rounded'])
    add(groups, 'Litany of the Dead - Combat Bonus', ['Accuracy', 'Deadly'])
    add(groups, 'Litany of the Dead II - Combat Bonus', ['Accuracy', 'Deadly'])
    add(groups, 'Parrying', parrying)
    add(groups, 'Sheltering', ['Physical Sheltering', 'Magical Sheltering'])
    add(groups, 'Potency', ['Nullification', 'Radiance', 'Devotion', 'Corrosion', 'Combustion', 'Magnetic', 'Glaciation', 'Reconstruction', 'Impulse', 'Resonance'])
    add(groups, 'Spell Lore', ['Nullification Lore', 'Radiance Lore', 'Devotion Lore', 'Corrosion Lore', 'Combustion Lore', 'Magnetic Lore', 'Glaciation Lore', 'Reconstruction Lore', 'Impulse Lore', 'Resonance'])
    add(groups, 'Combat Mastery', ['Vertigo', 'Stunning', 'Dazing', 'Sundering', 'Shatter'])
    add(groups, 'Dazing', ['Stunning'])
    add(groups, 'Sundering', ['Shatter'])
    add(groups, 'Improved Deception', ['Bluff'])
    add(groups, 'Alluring Skills Bonus', ['Bluff', 'Diplomacy', 'Haggle', 'Intimidate', 'Perform'])
    add(groups, 'Charisma Skills', ['Bluff', 'Diplomacy', 'Haggle', 'Intimidate', 'Perform'])
    add(groups, 'Frozen Depths Lore', ['Ice Lore', 'Poison Lore', 'Void Lore'])
    add(groups, 'Frozen Storm Lore', ['Ice Lore', 'Lightning Lore'])
    add(groups, 'Kinetic Lore', ['Force Lore', 'Physical Lore', 'Untyped Lore'])
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
    add(groups, 'Spell Focus Mastery', ['Evocation Focus', 'Necromancy Focus', 'Transmutation Focus', 'Enchantment Focus', 'Conjuration Focus', 'Abjuration Focus', 'Illusion Focus'])
    add(groups, 'each Amplification', ['Healing Amplification', 'Negative Amplification', 'Repair Amplification'])
    add_fixed(groups, 'Songblade', [{'name': 'Perform', 'type': 'Enhancement', 'value': 2}])
    add_fixed(groups, 'Lifesealed', [
        {'name': 'Negative Energy Absorption', 'type': '<TypeAlreadyParsed>', 'value': '<ValueAlreadyParsed>'},
        {'name': 'Deathblock', 'type': 'Bool', 'value': 1},
    ])
    add_compound_affix_groups(groups)

    write_json(groups, 'affix-groups')


if __name__ == "__main__":
    build_affix_groups()
