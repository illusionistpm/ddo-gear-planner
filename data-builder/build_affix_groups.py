from write_json import write_json

from compound_affixes import load_compound_affixes
from typedefs import Affix, AffixGroup, CompoundAffixComponent, CompoundAffixMap

def get_all_saves(bonusType = None) -> list[str]:
    return ['Fortitude Save', 'Reflex Save', 'Will Save']

def get_all_skills(bonusType = None) -> list[str]:
    return ['Balance', 'Bluff', 'Concentration', 'Diplomacy', 'Disable Device', 'Haggle', 'Heal', 'Hide', 'Intimidate', 'Jump', 'Listen', 'Move Silently', 'Open Lock', 'Perform', 'Repair', 'Search', 'Spellcraft', 'Spot', 'Swim', 'Tumble', 'Use Magic Device']


def add(groups: list[AffixGroup], name: str, affixes: list[str]) -> None:
    _validate_affix_names(name, affixes)
    groups.append({
        'name': name,
        'affixes': affixes
    })


def upsert(groups: list[AffixGroup], name: str, affixes: list[str]) -> None:
    _validate_affix_names(name, affixes)
    entry = {
        'name': name,
        'affixes': affixes,
    }
    for index, group in enumerate(groups):
        if group['name'] == name:
            groups[index] = entry
            return
    groups.append(entry)


def _validate_affix_names(group_name: str, affixes: list[str]) -> None:
    invalid_affixes = [affix for affix in affixes if not isinstance(affix, str)]
    if invalid_affixes:
        raise TypeError(f'Affix group "{group_name}" contains non-string affixes: {invalid_affixes}')


def _fixed_affixes(names: list[str], bonus_type: str, value: int) -> list[Affix]:
    return [{'name': name, 'type': bonus_type, 'value': value} for name in names]


def _unique_affix_names(names: list[str]) -> list[str]:
    return list(dict.fromkeys(names))


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


def _uses_default_group_behavior(affixes: list[Affix]) -> bool:
    return all(
        affix.get('type') == '<TypeAlreadyParsed>'
        and affix.get('value') == '<ValueAlreadyParsed>'
        for affix in affixes
    )


def add_compound_affix_groups(groups: list[AffixGroup], mapping: CompoundAffixMap | None = None) -> None:
    compound_affixes = mapping if mapping is not None else load_compound_affixes()
    for name, definition in sorted(compound_affixes.items()):
        components = definition.get('components', [])
        if components:
            affixes = [_convert_compound_component(component) for component in components]
            if _uses_default_group_behavior(affixes):
                upsert(groups, name, [affix['name'] for affix in affixes])
            else:
                upsert_fixed(groups, name, affixes)


def build_affix_groups() -> None:
    groups: list[AffixGroup] = []

    parrying = get_all_saves()
    parrying.append('Armor Class')

    # Technically Armor/Weapon Enhancement Bonuses add to AC / Accuracy & Deadly, but we'd need to fake a channel for them
    # and I don't really care about them.
    #add(groups, 'Enhancement Bonus (Armor)', ['Armor Class'])
    #add(groups, 'Enhancement Bonus (Weapon)', ['Accuracy', 'Deadly'])
    add(groups, 'All Saves', get_all_saves())
    add(groups, 'All Skills', get_all_skills())
    add(groups, 'Good Luck', get_all_saves() + get_all_skills())
    add(groups, 'Void Intensity', ['Negative Intensity', 'Poison Intensity'])
    add(groups, 'Resistance', get_all_saves())
    add(groups, 'Riposte', ['Armor Class'] + get_all_saves())
    # special case exists where Litany of the Dead Ability Bonus is really well rounded affix
    # but we treat as an affix group to keep consistency with Litany of the Dead Combat Bonus affix
    add(groups, 'Litany of the Dead - Ability Bonus', ['Well Rounded'])
    add(groups, 'Litany of the Dead II - Ability Bonus', ['Well Rounded'])
    add(groups, 'Litany of the Dead - Combat Bonus', ['Accuracy', 'Deadly'])
    add(groups, 'Litany of the Dead II - Combat Bonus', ['Accuracy', 'Deadly'])
    add(groups, 'Parrying', parrying)
    add(groups, 'Sheltering', ['Physical Sheltering', 'Magical Sheltering'])
    add(groups, 'Potency', ['Negative Spell Power', 'Light Spell Power', 'Positive Spell Power', 'Acid Spell Power', 'Fire Spell Power', 'Electric Spell Power', 'Cold Spell Power', 'Repair Spell Power', 'Rust Spell Power', 'Force Spell Power', 'Sonic Spell Power'])
    add(groups, 'Spell Lore', ['Negative Lore', 'Poison Lore', 'Light Lore', 'Radiance Lore', 'Alignment Lore', 'Healing Lore', 'Acid Lore', 'Fire Lore', 'Lightning Lore', 'Cold Lore', 'Repair Lore', 'Rust Lore', 'Kinetic Lore', 'Force Lore', 'Sonic Lore'])
    add(groups, 'Combat Mastery', ['Vertigo', 'Stunning', 'Dazing', 'Sundering', 'Shatter'])
    add(groups, 'Dazing', ['Stunning'])
    add(groups, 'Sundering', ['Shatter'])
    add(groups, 'Improved Deception', ['Bluff'])
    add(groups, 'Alluring Skills Bonus', ['Bluff', 'Diplomacy', 'Haggle', 'Intimidate', 'Perform'])
    add(groups, 'Charisma Skills', ['Bluff', 'Diplomacy', 'Haggle', 'Intimidate', 'Perform'])
    add(groups, 'Frozen Depths Lore', ['Cold Lore', 'Poison Lore', 'Negative Lore'])
    add(groups, 'Frozen Storm Lore', ['Cold Lore', 'Lightning Lore'])
    add(groups, 'Kinetic Lore', ['Force Lore', 'Physical Lore', 'Untyped Lore'])
    add(groups, 'Intelligence Skills', ['Disable Device', 'Repair', 'Search', 'Spellcraft'])
    add(groups, 'Dexterity Skills', ['Balance', 'Hide', 'Move Silently', 'Open Locks', 'Tumble'])
    add_fixed(groups, 'Greater Heroism', _fixed_affixes(get_all_saves() + get_all_skills() + ['Accuracy'], 'Morale', 4))
    add(groups, 'Power of the Frozen Storm', ['Cold Spell Power', 'Electric Spell Power'])
    add(groups, 'Power of the Frozen Depths', ['Cold Spell Power', 'Negative Spell Power', 'Poison'])
    add(groups, 'Power of the Flames of Purity', ['Fire Spell Power', 'Light Spell Power'])
    add(groups, 'Power of the Silver Flame', ['Positive Spell Power', 'Light Spell Power'])
    add(groups, 'Radiance', ['Light Spell Power', 'Alignment Spell Power'])
    add(groups, 'Radiance Lore', ['Light Lore', 'Alignment Lore'])
    add(groups, 'Purifying Flame Lore', ['Fire Lore', 'Light Lore'])
    add(groups, 'Strength Skills', ['Jump'])
    add(groups, 'Wisdom Skills', ['Heal', 'Listen', 'Spot'])
    add(groups, 'Constitution Skills', ['Concentration'])
    add(groups, 'Well Rounded', ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'])
    add(groups, 'Spell Focus Mastery', ['Evocation Focus', 'Necromancy Focus', 'Transmutation Focus', 'Enchantment Focus', 'Conjuration Focus', 'Abjuration Focus', 'Illusion Focus'])
    add(groups, 'each Amplification', ['Healing Amplification', 'Negative Amplification', 'Repair Amplification'])
    add_fixed(groups, 'Stealth Strike', [
        {'name': 'Distant Diversion', 'type': 'Insight', 'value': 15}, 
        {'name': 'Mystic Diversion', 'type': 'Insight', 'value': 15}
    ])
    add_fixed(groups, 'Occultation', [
        {'name': 'Diversion', 'type': 'Enhancement', 'value': 20}, 
        {'name': 'Distant Diversion', 'type': 'Enhancement', 'value': 20}, 
        {'name': 'Mystic Diversion', 'type': 'Enhancement', 'value': 20}
    ])
    add_fixed(groups, 'Songblade', [{'name': 'Perform', 'type': 'Enhancement', 'value': 2}])
    add_fixed(groups, 'Lifesealed', [
        {'name': 'Negative Energy Absorption', 'type': '<TypeAlreadyParsed>', 'value': '<ValueAlreadyParsed>'},
        {'name': 'Deathblock', 'type': 'Bool', 'value': 1},
    ])
    add_compound_affix_groups(groups)

    write_json(groups, 'affix-groups')


if __name__ == "__main__":
    build_affix_groups()
