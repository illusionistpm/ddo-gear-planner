from bs4 import BeautifulSoup
from get_most_common_bonus_type import get_most_common_bonus_type
from write_json import write_json
import os
from parse_affixes_from_cell import canonicalize_affix_name


ESSENCE_CRAFTING_SLOTS_PATH = f"{os.path.dirname(__file__)}/cache/crafting/Essence_Crafting_table_1b.html"
ESSENCE_CRAFTING_TABLE_PATH = f"{os.path.dirname(__file__)}/cache/crafting/Essence_Crafting_table_3b.html"


ESSENCE_CRAFTING_ITEM_TYPES = {
    'Armors': 'Armor',
    'Belts': 'Belt',
    'Boots': 'Boots',
    'Bracers': 'Bracers',
    'Cloaks': 'Cloak',
    'Gloves': 'Gloves',
    'Goggles': 'Goggles',
    'Headgear': 'Helm',
    'Melee weapons': 'Melee',
    'Necklaces': 'Necklace',
    'Orbs': 'Orb',
    'Ranged weapons': 'Ranged',
    'Rings': 'Ring',
    'Rune Arms': 'Rune Arm',
    'Shields': 'Shield',
    'Trinkets': 'Trinket',
}

SPELL_POWER_AFFIXES = [
    'Fire Spell Power',
    'Acid Spell Power',
    'Positive Spell Power',
    'Cold Spell Power',
    'Force Spell Power',
    'Electric Spell Power',
    'Negative Spell Power',
    'Radiance',
    'Reconstruction',
    'Sonic Spell Power',
]

INSIGHTFUL_SPELL_POWER_AFFIXES = [
    'Insightful Fire Spell Power',
    'Insightful Acid Spell Power',
    'Insightful Positive Spell Power',
    'Insightful Glaciation',
    'Insightful Force Spell Power',
    'Insightful Electric Spell Power',
    'Insightful Negative Spell Power',
    'Insightful Radiance',
    'Insightful Reconstruction',
    'Insightful Sonic Spell Power',
]

SPELL_LORE_AFFIXES = [
    'Acid Lore',
    'Fire Lore',
    'Healing Lore',
    'Cold Lore',
    'Kinetic Lore',
    'Lightning Lore',
    'Radiance Lore',
    'Repair Lore',
    'Sonic Lore',
    'Negative Lore',
]

RESISTANCE_AFFIXES = [
    'Fire Resistance',
    'Cold Resistance',
    'Acid Resistance',
    'Electric Resistance',
    'Sonic Resistance',
    'Light Resistance',
    'Negative Resistance',
    'Poison Resistance',
]

ABSORPTION_AFFIXES = [
    'Acid Absorption',
    'Cold Absorption',
    'Electricity Absorption',
    'Fire Absorption',
    'Sonic Absorption',
]

ABILITY_AFFIXES = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']

SKILL_AFFIXES = [
    'Balance',
    'Bluff',
    'Concentration',
    'Diplomacy',
    'Disable Device',
    'Haggle',
    'Heal',
    'Hide',
    'Intimidate',
    'Jump',
    'Listen',
    'Move Silently',
    'Open Lock',
    'Perform',
    'Repair',
    'Search',
    'Spellcraft',
    'Spot',
    'Swim',
    'Tumble',
]

SPELL_FOCUS_AFFIXES = [
    'Abjuration Focus',
    'Conjuration Focus',
    'Enchantment Focus',
    'Evocation Focus',
    'Illusion Focus',
    'Necromancy Focus',
    'Transmutation Focus',
]

EFFICIENT_METAMAGIC_AFFIXES = [
    'Efficient Metamagic - Empower',
    'Efficient Metamagic - Enlarge',
    'Efficient Metamagic - Extend',
    'Efficient Metamagic - Empower Healing',
    'Efficient Metamagic - Maximize',
]

NON_SCALING_AFFIXES = {
    'Blindness Immunity',
    'Deathblock',
    *EFFICIENT_METAMAGIC_AFFIXES,
    'Eternal Faith',
    'Everbright',
    'Fearsome',
    'Feather Fall',
    'Ghost Touch',
    'Invulnerability',
    'Metalline',
    'Persuasion',
    'Regeneration',
    'Sacred',
    'Silver Flame',
    'Songblade',
    'True Seeing',
    'Unbalancing',
    'Underwater Action',
    'Vampirism',
    'Vengeful',
}

WIKI_ONLY_COMBINED_AFFIX_PREFIXES = (
    'Ability Damaging',
    'Aligned',
    'Alignment damage',
    'Armor Destroying',
    'Bane',
    "Champion's",
    "Initiate's",
    'Keen / Impact',
    'Lesser Arcane Spell Dexterity',
    'Damage',
    'Sabotaging',
    "Silver Flame's",
    'Twilight',
    'Warded',
)

ESSENCE_CRAFTING_AFFIX_ORDER = [
    'Insightful Assassinate', 'Insightful Deadly', 'Insightful Disease Ward',
    'Insightful Enchantment Resistance', 'Insightful Illusion Resistance', 'Insightful Poison Ward',
    'Insightful Spell Saves', 'Insightful Tendon Slice', 'Insightful Charisma', 'Insightful Constitution',
    'Insightful Dexterity', 'Insightful Dodge', 'Insightful Intelligence', 'Insightful Seeker',
    'Insightful Strength', 'Insightful Wisdom', 'Parrying', 'Insightful Shatter', 'Insightful Stunning',
    'Insightful Vertigo', 'Insightful Accuracy', 'Insightful Diversion', 'Bashing', 'Blindness Immunity',
    'Deathblock', 'Efficient Metamagic - Empower', 'Efficient Metamagic - Enlarge',
    'Efficient Metamagic - Extend', 'Efficient Metamagic - Empower Healing',
    'Efficient Metamagic - Maximize', 'Eternal Faith', 'Everbright', 'Fearsome', 'Feather Fall',
    'Ghost Touch', 'Invulnerability', 'Metalline', 'Persuasion', 'Regeneration', 'Sacred',
    'Shield Spikes', 'Silver Flame', 'Songblade', 'True Seeing', 'Unbalancing', 'Underwater Action',
    'Vampirism', 'Vengeful', 'Insightful Abjuration Focus', 'Insightful Conjuration Focus',
    'Insightful Enchantment Focus', 'Insightful Evocation Focus', 'Insightful Illusion Focus',
    'Insightful Necromancy Focus', 'Insightful Transmutation Focus', 'Insightful Spell Penetration',
    'Spell Focus Mastery', 'Insightful Combat Mastery', 'Abjuration Focus', 'Conjuration Focus',
    'Enchantment Focus', 'Evocation Focus', 'Illusion Focus', 'Necromancy Focus', 'Transmutation Focus',
    'Spell Penetration', 'Assassinate', 'Doubleshot', 'Insightful Magical Sheltering',
    'Insightful Physical Sheltering', 'Combat Mastery', 'Deadly', 'Disease Ward',
    'Enchantment Resistance', 'Fortitude', 'Illusion Resistance', 'Poison Ward', 'Protection',
    'Reflex', 'Resistance', 'Spell Saves', 'Tendon Slice', 'Will', 'Universal Spell Lore',
    'Insightful Balance', 'Insightful Bluff', 'Insightful Concentration', 'Insightful Diplomacy',
    'Insightful Disable Device', 'Insightful Haggle', 'Insightful Heal', 'Insightful Hide',
    'Insightful Intimidate', 'Insightful Jump', 'Insightful Listen', 'Insightful Move Silently',
    'Insightful Open Lock', 'Insightful Perform', 'Insightful Repair', 'Insightful Search',
    'Insightful Spellcraft', 'Insightful Spot', 'Insightful Swim', 'Insightful Tumble', 'Charisma',
    'Constitution', 'Dexterity', 'Dodge', 'Intelligence', 'Natural Armor', 'Seeker', 'Strength',
    'Wisdom', 'Melee Alacrity', 'Ranged Alacrity', 'Shatter', 'Stunning', 'Vertigo',
    'Insightful Incite', 'Insightful Acid Resistance', 'Insightful Cold Resistance',
    'Insightful Electric Resistance', 'Insightful Fire Resistance', 'Insightful Light Resistance',
    'Insightful Negative Resistance', 'Insightful Poison Resistance', 'Insightful Sonic Resistance',
    'Doublestrike', 'Insightful Spell Resistance', 'Accuracy', 'Armor-Piercing', 'Diversion',
    'Shield Bashing', 'Balance', 'Bluff', 'Concentration', 'Diplomacy', 'Disable Device', 'Haggle',
    'Heal', 'Hide', 'Intimidate', 'Jump', 'Listen', 'Move Silently', 'Open Lock', 'Perform',
    'Repair', 'Search', 'Spellcraft', 'Spot', 'Swim', 'Tumble', 'Spell Resistance', 'Sheltering',
    'Striding', 'Vitality', 'Acid Resistance', 'Cold Resistance', 'Electric Resistance',
    'False Life', 'Fire Resistance', 'Light Resistance', 'Negative Resistance', 'Poison Resistance',
    'Sonic Resistance', 'Healing Amplification', 'Negative Amplification', 'Repair Amplification',
    'Acid Lore', 'Fire Lore', 'Healing Lore', 'Cold Lore', 'Kinetic Lore', 'Lightning Lore',
    'Radiance Lore', 'Repair Lore', 'Sonic Lore', 'Negative Lore', 'Incite', 'Insightful Wizardry',
    'Acid Absorption', 'Cold Absorption', 'Electricity Absorption', 'Fire Absorption',
    'Sonic Absorption', 'Potency', 'Insightful Fire Spell Power', 'Insightful Acid Spell Power',
    'Insightful Positive Spell Power', 'Insightful Fortification', 'Insightful Glaciation',
    'Insightful Force Spell Power', 'Insightful Electric Spell Power', 'Insightful Negative Spell Power',
    'Insightful Radiance', 'Insightful Reconstruction', 'Insightful Sonic Spell Power', 'Wizardry',
    'Fire Spell Power', 'Acid Spell Power', 'Positive Spell Power', 'Fortification',
    'Cold Spell Power', 'Force Spell Power', 'Electric Spell Power', 'Negative Spell Power',
    'Radiance', 'Reconstruction', 'Sonic Spell Power',
]

ESSENCE_CRAFTING_AFFIX_ORDER_INDEX = {
    affix: index for index, affix in enumerate(ESSENCE_CRAFTING_AFFIX_ORDER)
}

ESSENCE_CRAFTING_LEGACY_COMPATIBILITY_OVERRIDES = {
    ('Armor', 'Suffix'): {
        'add': ['Sonic Spell Power'],
        'remove': ['Sonic Resistance'],
    },
    ('Belt', 'Suffix'): {
        'remove': ['Parrying'],
    },
    ('Bracers', 'Extra'): {
        'add': ['Insightful Perform'],
        'remove': ['Perform'],
    },
    ('Bracers', 'Prefix'): {
        'add': ['Resistance'],
    },
    ('Gloves', 'Suffix'): {
        'add': ['Resistance', 'Universal Spell Lore'],
        'remove': [
            'Insightful Assassinate',
            'Insightful Combat Mastery',
            'Spell Saves',
            *SPELL_LORE_AFFIXES,
        ],
    },
    ('Helm', 'Suffix'): {
        'add': ['Spell Focus Mastery', 'Resistance'],
        'remove': ['Spell Saves', *SPELL_FOCUS_AFFIXES],
    },
    ('Necklace', 'Prefix'): {
        'remove': ['Illusion Resistance'],
    },
    ('Orb', 'Extra'): {
        'add': ['Insightful Deadly', 'Insightful Spell Resistance'],
    },
    ('Orb', 'Prefix'): {
        'add': ['Fortitude'],
        'remove': ['Constitution', 'Fortification'],
    },
    ('Orb', 'Suffix'): {
        'remove': ['Insightful Positive Spell Power'],
    },
    ('Ranged', 'Suffix'): {
        'remove': ['Doubleshot'],
    },
    ('Ring', 'Extra'): {
        'remove': INSIGHTFUL_SPELL_POWER_AFFIXES,
    },
    ('Trinket', 'Extra'): {
        'remove': ['Insightful Incite', 'Perform'],
    },
    ('Trinket', 'Prefix'): {
        'remove': ['Silver Flame'],
    },
    ('Trinket', 'Suffix'): {
        'add': ['Spell Focus Mastery', 'Resistance', 'Universal Spell Lore'],
        'remove': ['Spell Saves', 'Open Lock', 'Search', 'Spellcraft', *SPELL_FOCUS_AFFIXES, *SPELL_LORE_AFFIXES],
    },
}


def canonicalize_essence_crafting_affix_name(affix: str) -> str:
    if affix.startswith('Insightful '):
        return 'Insightful ' + canonicalize_affix_name(affix.removeprefix('Insightful '))
    return canonicalize_affix_name(affix)


def normalize_wiki_stat_name(stat: str) -> str:
    stat = stat.replace('*', '').replace('Ins.', 'Insightful').strip()
    stat = stat.title()
    replacements = {
        'Alacrity Ranged/Melee': 'Alacrity',
        'Armor-Piercing': 'Armor-piercing',
        'Insightful Ench/Ill Resistance': 'Insightful Enchantment/Illusion Resistance',
        'Insightful Poi/Dis Ward': 'Insightful Poison/Disease Ward',
        'Insightful Spell Focus (One)': 'Insightful Spell Focus',
        'Insightful Spell Focus Mastery': 'Insightful Spell Focus Mastery',
        'Insightful Spellpower': 'Insightful Spell Power',
        'Insightful Vertigo /Stunning/Shatter': 'Insightful Vertigo/Stunning/Shatter',
        'Lore (All)': 'Universal Spell Lore',
        'Lore (One Type)': 'Lore',
        'Reflex/Fortitude/Will': 'Saves',
        'Resistance (Save)': 'Resistance',
        'Spell Focus (One Type)': 'Spell Focus',
        'Spell Focus Mastery': 'Spell Focus Mastery',
        'Spellpower': 'Spell Power',
        'Spellcasting Implement': 'Spellcasting Implement',
        'Spell Resistance (Sr)': 'Spell Resistance',
        'Weapon Dice Mult': 'Weapon Dice Multiplier',
    }
    return replacements.get(stat, stat)


def parse_wiki_value(value: str) -> int | float | str | None:
    value = value.strip()
    if value in ['', '-', '??', '?']:
        return None
    if 'd' in value:
        return value
    number = float(value)
    if number.is_integer():
        return int(number)
    return number


def get_essence_crafting_progression_from_wiki(soup: BeautifulSoup) -> tuple[list[int], dict[str, list[int | float | str | None]]]:
    data_table = None
    for table in soup.find_all('table'):
        first_row = table.find('tr')
        if not first_row:
            continue
        headers = [cell.get_text(' ', strip=True) for cell in first_row.find_all(['th', 'td'])]
        if headers and headers[0] == 'Min Level':
            data_table = table
            break

    if data_table is None:
        raise ValueError('Unable to find Essence Crafting table with Min Level header')

    rows = data_table.find_all('tr')
    level_cells = [cell.get_text(' ', strip=True) for cell in rows[0].find_all(['th', 'td'])][1:]
    levels = [int(level) for level in level_cells]

    progressions = {}
    for row in rows[1:]:
        cells = [cell.get_text(' ', strip=True) for cell in row.find_all(['th', 'td'])]
        if len(cells) != len(levels) + 1:
            continue
        progressions[normalize_wiki_stat_name(cells[0])] = [parse_wiki_value(value) for value in cells[1:]]

    return levels, progressions


def load_essence_crafting_progression_from_wiki(path: str = ESSENCE_CRAFTING_TABLE_PATH) -> tuple[list[int], dict[str, list[int | float | str | None]]]:
    with open(path, 'r', encoding='utf-8') as fh:
        soup = BeautifulSoup(fh.read(), 'html.parser')
    return get_essence_crafting_progression_from_wiki(soup)


def get_direct_text_without_nested_lists(li) -> str:
    li_copy = BeautifulSoup(str(li), 'html.parser').find('li')
    if li_copy is None:
        return ''
    for nested_list in li_copy.find_all(['ul', 'ol']):
        nested_list.decompose()
    return li_copy.get_text(' ', strip=True)


def normalize_essence_crafting_wiki_affix(affix: str) -> str:
    affix = affix.replace('\xa0', ' ').strip()
    affix = affix.replace('Armor Piercing', 'Armor-Piercing')
    affix = affix.replace('Spellsight', 'Spellcraft')
    affix = affix.replace('True Sight', 'True Seeing')
    affix = affix.replace('Glaciation', 'Cold Spell Power')
    affix = affix.replace('Ins.', 'Insightful')
    affix = affix.removesuffix(' (select school)')
    affix = affix.removesuffix(' (one type)')
    affix = affix.removesuffix(' (all)')
    affix = affix.removesuffix(' (saves)')
    affix = affix.split(' (except ')[0]
    affix = affix.split(' on a critical hit')[0]
    affix = affix.strip()
    if affix == 'Resistance':
        return 'Spell Saves'
    if affix == 'Bashing':
        return 'Bashing'
    return canonicalize_essence_crafting_affix_name(affix.title())


def with_insightful_prefix(affixes: list[str]) -> list[str]:
    return [f'Insightful {affix}' for affix in affixes]


def expand_essence_crafting_wiki_affix(affix: str) -> list[str]:
    affix = affix.replace('\xa0', ' ').strip()
    if not affix or affix in ['(none)', 'Abilities:', 'Skills:']:
        return []
    if affix.startswith('Abilities:') or affix.startswith('Abilities :'):
        affix = affix.split(':', 1)[1].strip()
        return [] if affix in ['', '(none)'] else expand_essence_crafting_wiki_affix(affix)
    if affix.startswith('Skills:'):
        affix = affix.removeprefix('Skills:').strip()
        return [] if affix in ['', '(none)'] else expand_essence_crafting_wiki_affix(affix)
    if any(affix.startswith(prefix) for prefix in WIKI_ONLY_COMBINED_AFFIX_PREFIXES):
        return []
    if affix.startswith('Efficient Metamagic'):
        return EFFICIENT_METAMAGIC_AFFIXES
    if affix.startswith('Insightful Spell Power'):
        return INSIGHTFUL_SPELL_POWER_AFFIXES
    if affix.startswith('Spell Power'):
        return SPELL_POWER_AFFIXES
    if affix.startswith('Insightful Spell Lore') or affix.startswith('Spell Lore'):
        return SPELL_LORE_AFFIXES
    if affix.startswith('Insightful Resistance'):
        return with_insightful_prefix(RESISTANCE_AFFIXES)
    if affix.startswith('Resistance (Fire') or affix.startswith('Resistance (Acid'):
        return RESISTANCE_AFFIXES
    if affix.startswith('Absorption'):
        return ABSORPTION_AFFIXES
    if affix.startswith('Insightful Spell Focus'):
        return with_insightful_prefix(SPELL_FOCUS_AFFIXES)
    if affix.startswith('Spell Focus'):
        return SPELL_FOCUS_AFFIXES
    return [normalize_essence_crafting_wiki_affix(affix)]


def get_essence_crafting_affixes_from_list_item(li) -> list[str]:
    text = get_direct_text_without_nested_lists(li)
    nested_affixes: list[str] = []
    for nested_list in li.find_all(['ul', 'ol'], recursive=False):
        for nested_li in nested_list.find_all('li', recursive=False):
            nested_affixes.extend(get_essence_crafting_affixes_from_list_item(nested_li))
    if text in ['Abilities:', 'Skills:']:
        return nested_affixes
    return expand_essence_crafting_wiki_affix(text) + nested_affixes


def get_essence_crafting_affixes_from_cell(cell) -> list[str]:
    affixes: list[str] = []
    for affix_list in cell.find_all(['ul', 'ol']):
        if affix_list.find_parent('li') is not None:
            continue
        for li in affix_list.find_all('li', recursive=False):
            affixes.extend(get_essence_crafting_affixes_from_list_item(li))

    unique_affixes = []
    for affix in affixes:
        if affix not in unique_affixes:
            unique_affixes.append(affix)
    return unique_affixes


def get_essence_crafting_item_types_from_wiki(soup: BeautifulSoup) -> dict[str, dict[str, list[str]]]:
    item_types: dict[str, dict[str, list[str]]] = {}
    for table in soup.find_all('table'):
        rows = table.find_all('tr')
        if not rows:
            continue
        headers = [cell.get_text(' ', strip=True) for cell in rows[0].find_all(['th', 'td'])]
        if headers != ['Equipment slot', 'Prefix', 'Suffix', 'Extra']:
            continue

        for row in rows[1:]:
            cells = row.find_all(['th', 'td'], recursive=False)
            if len(cells) != 4:
                continue
            wiki_item_type = cells[0].get_text(' ', strip=True).split('(')[0].strip()
            if wiki_item_type not in ESSENCE_CRAFTING_ITEM_TYPES:
                raise ValueError(f'Unknown Essence Crafting item type: {wiki_item_type}')
            item_type = ESSENCE_CRAFTING_ITEM_TYPES[wiki_item_type]
            item_types[item_type] = {
                slot: get_essence_crafting_affixes_from_cell(cell)
                for slot, cell in zip(['Prefix', 'Suffix', 'Extra'], cells[1:])
            }

    if set(item_types.keys()) != set(ESSENCE_CRAFTING_ITEM_TYPES.values()):
        missing = sorted(set(ESSENCE_CRAFTING_ITEM_TYPES.values()) - set(item_types.keys()))
        raise ValueError(f'Missing Essence Crafting item type tables: {missing}')
    apply_essence_crafting_legacy_compatibility_overrides(item_types)
    return item_types


def apply_essence_crafting_legacy_compatibility_overrides(item_types: dict[str, dict[str, list[str]]]) -> None:
    for (item_type, affix_loc), override in ESSENCE_CRAFTING_LEGACY_COMPATIBILITY_OVERRIDES.items():
        affixes = item_types[item_type][affix_loc]
        for affix in override.get('remove', []):
            while affix in affixes:
                affixes.remove(affix)
        for affix in override.get('add', []):
            if affix not in affixes:
                affixes.append(affix)
    validate_essence_crafting_affix_order(item_types)
    for item_type_slots in item_types.values():
        for affixes in item_type_slots.values():
            affixes.sort(key=lambda affix: ESSENCE_CRAFTING_AFFIX_ORDER_INDEX[affix])


def validate_essence_crafting_affix_order(item_types: dict[str, dict[str, list[str]]]) -> None:
    missing_order = []
    for item_type_slots in item_types.values():
        for affixes in item_type_slots.values():
            missing_order.extend([affix for affix in affixes if affix not in ESSENCE_CRAFTING_AFFIX_ORDER_INDEX])
    if missing_order:
        raise ValueError(f'Missing Essence Crafting affix order entries: {sorted(set(missing_order))}')


def load_essence_crafting_item_types_from_wiki(path: str = ESSENCE_CRAFTING_SLOTS_PATH) -> dict[str, dict[str, list[str]]]:
    with open(path, 'r', encoding='utf-8') as fh:
        soup = BeautifulSoup(fh.read(), 'html.parser')
    return get_essence_crafting_item_types_from_wiki(soup)


def get_wiki_progression_key(affix: str) -> str | None:
    base_affix = affix.removeprefix('Insightful ')
    prefix = 'Insightful ' if affix.startswith('Insightful ') else ''

    if base_affix in ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']:
        return f'{prefix}Ability'
    if base_affix in ['Enchantment Resistance', 'Illusion Resistance']:
        return f'{prefix}Enchantment/Illusion Resistance'
    if base_affix in ['Poison Ward', 'Disease Ward']:
        return f'{prefix}Poison/Disease Ward'
    if base_affix in ['Fortitude', 'Reflex', 'Will']:
        return 'Saves'
    if base_affix in ['Shatter', 'Stunning', 'Vertigo']:
        return f'{prefix}Vertigo/Stunning/Shatter'
    if base_affix in ['Acid Resistance', 'Cold Resistance', 'Electric Resistance', 'Fire Resistance',
                      'Light Resistance', 'Negative Resistance', 'Poison Resistance', 'Sonic Resistance']:
        return 'Resistance'
    if base_affix in ['Healing Amplification', 'Negative Amplification', 'Repair Amplification']:
        return 'Amplification'
    if base_affix in ['Acid Lore', 'Cold Lore', 'Fire Lore', 'Healing Lore', 'Ice Lore', 'Kinetic Lore',
                      'Lightning Lore', 'Negative Lore', 'Radiance Lore', 'Repair Lore', 'Sonic Lore', 'Void Lore']:
        return 'Lore'
    if base_affix in ['Acid Absorption', 'Cold Absorption', 'Electricity Absorption', 'Fire Absorption', 'Sonic Absorption']:
        return 'Absorption'
    if base_affix in ['Acid Spell Power', 'Fire Spell Power', 'Positive Spell Power', 'Repair Spell Power',
                      'Cold Spell Power', 'Kinetic Spell Power', 'Lightning Spell Power', 'Electric Spell Power',
                      'Negative Spell Power', 'Light Spell Power', 'Sonic Spell Power', 'Force Spell Power',
                      'Radiance', 'Reconstruction']:
        return f'{prefix}Spell Power'
    if base_affix in ['Abjuration Focus', 'Conjuration Focus', 'Enchantment Focus', 'Evocation Focus',
                      'Illusion Focus', 'Necromancy Focus', 'Transmutation Focus']:
        return f'{prefix}Spell Focus'
    if base_affix in ['Balance', 'Bluff', 'Concentration', 'Diplomacy', 'Disable Device', 'Haggle',
                      'Heal', 'Hide', 'Intimidate', 'Jump', 'Listen', 'Move Silently', 'Open Lock',
                      'Perform', 'Repair', 'Search', 'Spellcraft', 'Spot', 'Swim', 'Tumble']:
        return f'{prefix}Skill'
    if affix in ['Melee Alacrity', 'Ranged Alacrity']:
        return 'Alacrity'
    if affix == 'Armor-Piercing':
        return 'Armor-piercing'
    if affix in ['Insightful Glaciation', 'Insightful Cold Spell Power']:
        return 'Insightful Spell Power'
    if affix in ['Glaciation', 'Cold Spell Power']:
        return 'Spell Power'
    if affix == 'Magical Sheltering' or affix == 'Physical Sheltering':
        return 'Sheltering'
    if affix == 'Insightful Magical Sheltering' or affix == 'Insightful Physical Sheltering':
        return 'Insightful Sheltering'
    if affix == 'Spell Penetration':
        return 'Penetration'
    if affix == 'Insightful Spell Penetration':
        return 'Insightful Penetration'
    return affix


def get_max_known_level(
    levels: list[int],
    wiki_keys_used: set[str],
    wiki_progression: dict[str, list[int | float | str | None]],
    minimum_known_level: int,
) -> int:
    max_known_level = minimum_known_level
    for index, level in enumerate(levels):
        if level <= minimum_known_level:
            continue
        if all(wiki_progression[key][index] is not None for key in wiki_keys_used):
            max_known_level = level
        else:
            break
    return max_known_level


def get_essence_crafting_affix_order(item_types: dict[str, dict[str, list[str]]]) -> list[str]:
    validate_essence_crafting_affix_order(item_types)
    affixes_in_item_types = {
        affix
        for item_type_slots in item_types.values()
        for affixes in item_type_slots.values()
        for affix in affixes
    }
    return [affix for affix in ESSENCE_CRAFTING_AFFIX_ORDER if affix in affixes_in_item_types]


def build_essence_crafting_data() -> dict:
    assumedBonusTypeMap = get_most_common_bonus_type()
    assumedBonusTypeMap['Perform'] = 'Enhancement'
    assumedBonusTypeMap['Songblade'] = 'Bool'
    wiki_levels, wiki_progression = load_essence_crafting_progression_from_wiki()
    itemTypes = load_essence_crafting_item_types_from_wiki()

    output = {}
    progression = {}
    output['progression'] = progression
    output['itemTypes'] = itemTypes
    output['bonusTypes'] = assumedBonusTypeMap
    wiki_keys_used = set()

    for affix in get_essence_crafting_affix_order(itemTypes):
        wiki_key = get_wiki_progression_key(affix)
        if wiki_key in wiki_progression and any(value is not None for value in wiki_progression[wiki_key]):
            wiki_keys_used.add(wiki_key)
            progVals = wiki_progression[wiki_key]
        elif affix in NON_SCALING_AFFIXES:
            progVals = [1] * len(wiki_levels)
        else:
            raise ValueError(f'Unable to find Essence Crafting progression for {affix}')

        progression[affix] = progVals

    # Only keep bonus types for things that are actually used by Essence Crafting.
    delKeys = []
    for k,_ in assumedBonusTypeMap.items():
        if k not in progression:
            delKeys.append(k)

    for k in delKeys:
        del assumedBonusTypeMap[k]

    max_level = get_max_known_level(wiki_levels, wiki_keys_used, wiki_progression, 34)
    output['maxLevel'] = max_level
    for affix, values in progression.items():
        if len(values) < max_level:
            last_value = values[-1]
            values.extend([last_value] * (max_level - len(values)))
        progression[affix] = values[:max_level]

    return output


def parse_essence_crafting() -> None:
    output = build_essence_crafting_data()
    write_json(output, 'essence-crafting')


if __name__ == "__main__":
    parse_essence_crafting()
