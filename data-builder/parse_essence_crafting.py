import re

from bs4 import BeautifulSoup
from get_most_common_bonus_type import get_most_common_bonus_type
from write_json import write_json
from parse_affixes_from_cell import BOOL_VARIANT_NAMES, canonicalize_affix_name
from get_snapshot_path import get_snapshot_path
from get_inverted_synonym_map import get_inverted_synonym_map


ESSENCE_CRAFTING_SLOTS_PATH = get_snapshot_path('crafting', 'Essence_Crafting_table_1b.html')
ESSENCE_CRAFTING_TABLE_PATH = get_snapshot_path('crafting', 'Essence_Crafting_table_3b.html')


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
    'Immunity to Blindness',
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
    'Bane',
    'Keen / Impact',
    'Lesser Arcane Spell Dexterity',
    'Damage',
    'Twilight',
)

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
        'add': ['Resistance'],
        'remove': [
            'Insightful Assassinate',
            'Insightful Combat Mastery',
            'Spell Saves',
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
        'add': ['Spell Focus Mastery', 'Resistance'],
        'remove': ['Spell Saves', 'Open Lock', 'Search', 'Spellcraft', *SPELL_FOCUS_AFFIXES, *SPELL_LORE_AFFIXES],
    },
}


# A dual prefix: one option that grants two effects, written "Watchful
# (Heightened Awareness + Dodge)". It becomes an option keyed in that same
# form, with each effect's name normalized; build_essence_crafting_data gives
# it, in the output's "compounds", its in-game name and each effect's own progression.
DUAL_AFFIX_PATTERN = re.compile(r'^([^()]+?)\s*\(\s*([^()+]+?)\s*\+\s*([^()+]+?)\s*\)$')

# A dual prefix's effects as the wiki names them there -> as everywhere else.
DUAL_AFFIX_COMPONENT_NAMES = {
    'Electric Absorption': 'Electricity Absorption',
    'Protection From Evil': 'Protection from Evil',
    'Reflex Save': 'Reflex',
    'Trap The Soul': 'Trap the Soul',
    'Will Save': 'Will',
}


def parse_dual_affix(affix: str) -> tuple[str, list[str]] | None:
    match = DUAL_AFFIX_PATTERN.match(affix.replace('\xa0', ' ').strip())
    if match is None:
        return None
    return match.group(1), [match.group(2), match.group(3)]


def is_dual_affix(affix: str) -> bool:
    return parse_dual_affix(affix) is not None


def normalize_dual_affix_component(component: str) -> str:
    # Bare "Resistance" is the saving throw bonus; normalize_essence_crafting_wiki_affix
    # would make it Spell Saves, which a dual names separately (Spellwarded).
    if component == 'Resistance':
        return 'Resistance'
    name = normalize_essence_crafting_wiki_affix(component)
    return DUAL_AFFIX_COMPONENT_NAMES.get(name, name)


def get_dual_affix_option(affix: str) -> str:
    parsed = parse_dual_affix(affix)
    assert parsed is not None
    name, components = parsed
    return f'{name} ({" + ".join(normalize_dual_affix_component(c) for c in components)})'


def canonicalize_essence_crafting_affix_name(affix: str) -> str:
    if affix.startswith('Insightful '):
        return 'Insightful ' + canonicalize_essence_crafting_affix_name(affix.removeprefix('Insightful '))
    return standardize_immunity_name(canonicalize_affix_name(affix))


def standardize_immunity_name(affix: str) -> str:
    # Immunities are named "Immunity to X" everywhere (affix_synonyms.json maps
    # the wiki's "X Immunity"). Only those synonyms apply here: the others would
    # rename options whose names saved build URLs carry (Vitality, Striding).
    canonical = get_inverted_synonym_map().get(affix, affix)
    return canonical if canonical.startswith('Immunity to ') else affix


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
        'Lore (All)': 'Spell Lore',
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
    if is_dual_affix(affix):
        return [get_dual_affix_option(affix)]
    if affix.startswith('Efficient Metamagic'):
        return EFFICIENT_METAMAGIC_AFFIXES
    if affix.startswith('Insightful Spell Power'):
        return INSIGHTFUL_SPELL_POWER_AFFIXES
    if affix.startswith('Spell Power'):
        return SPELL_POWER_AFFIXES
    if affix.startswith('Spell Lore') and ('(universal)' in affix or '(all types)' in affix):
        return ['Spell Lore']
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
    if affix == 'Spell Lore':
        return 'Spell Lore'
    if base_affix in ['Acid Absorption', 'Cold Absorption', 'Electricity Absorption', 'Fire Absorption', 'Sonic Absorption',
                      'Force Absorption', 'Light Absorption', 'Negative Absorption', 'Poison Absorption']:
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
    affix_order: list[str] = []
    for item_type_slots in item_types.values():
        for affixes in item_type_slots.values():
            for affix in affixes:
                if affix not in affix_order:
                    affix_order.append(affix)
    return affix_order


def build_essence_crafting_data() -> dict:
    assumedBonusTypeMap = get_most_common_bonus_type()
    assumedBonusTypeMap['Perform'] = 'Enhancement'
    assumedBonusTypeMap['Spell Lore'] = 'Equipment'
    assumedBonusTypeMap['Songblade'] = 'Bool'
    assumedBonusTypeMap['Spell Focus Mastery'] = 'Equipment'
    assumedBonusTypeMap['Negative Amplification'] = 'Profane'
    wiki_levels, wiki_progression = load_essence_crafting_progression_from_wiki()
    itemTypes = load_essence_crafting_item_types_from_wiki()

    output = {}
    progression = {}
    output['progression'] = progression
    output['itemTypes'] = itemTypes
    output['bonusTypes'] = assumedBonusTypeMap
    wiki_keys_used = set()

    compounds: dict[str, dict] = {}
    unvalued_duals: dict[str, list[str]] = {}

    def get_component_progression(component: str) -> list | None:
        wiki_key = get_wiki_progression_key(component)
        if wiki_key in wiki_progression and any(value is not None for value in wiki_progression[wiki_key]):
            wiki_keys_used.add(wiki_key)
            values = list(wiki_progression[wiki_key])
        elif component in NON_SCALING_AFFIXES or assumedBonusTypeMap.get(component) == 'Bool':
            values = [1] * len(wiki_levels)
        else:
            return None
        return [1] * len(values) if assumedBonusTypeMap.get(component) == 'Bool' else values

    for affix in get_essence_crafting_affix_order(itemTypes):
        dual = parse_dual_affix(affix)
        if dual is not None:
            components = {component: get_component_progression(component) for component in dual[1]}
            missing = [component for component, values in components.items() if values is None]
            if missing:
                unvalued_duals[affix] = missing
            else:
                # The in-game name is what the crafting device offers; the site shows it.
                compounds[affix] = {'name': dual[0], 'affixes': components}
            continue

        wiki_key = get_wiki_progression_key(affix)
        if wiki_key in wiki_progression and any(value is not None for value in wiki_progression[wiki_key]):
            wiki_keys_used.add(wiki_key)
            progVals = wiki_progression[wiki_key]
        elif affix in NON_SCALING_AFFIXES:
            progVals = [1] * len(wiki_levels)
        else:
            raise ValueError(f'Unable to find Essence Crafting progression for {affix}')

        if assumedBonusTypeMap.get(affix) == 'Bool':
            # Checklist affixes only need to be present. The wiki lists some
            # (Bashing, Shield Spikes, Vampirism) with damage dice ("1d6").
            progVals = [1] * len(progVals)

        progression[affix] = progVals

    component_progressions = {
        f'{option}: {component}': values
        for option, compound in compounds.items()
        for component, values in compound['affixes'].items()
    }
    for affix, values in {**progression, **component_progressions}.items():
        non_numeric = [value for value in values if isinstance(value, str)]
        if non_numeric:
            raise ValueError(f'Non-numeric Essence Crafting progression for {affix}: {non_numeric[0]!r}')

    # The wiki has no Essence Crafting values for some dual prefixes' effects
    # (Speed, Deception, Heightened Awareness...). Leave those duals out until it does.
    if unvalued_duals:
        print(f'Essence Crafting: skipping {len(unvalued_duals)} dual prefixes with effects the wiki gives no values for:')
        for option, missing in unvalued_duals.items():
            print(f'  {option}: {", ".join(missing)}')
        for slots in itemTypes.values():
            for slot, options in slots.items():
                slots[slot] = [option for option in options if option not in unvalued_duals]

    if compounds:
        output['compounds'] = compounds

    compound_affixes = {component for compound in compounds.values() for component in compound['affixes']}

    # Only keep bonus types for things that are actually used by Essence Crafting.
    delKeys = []
    for k,_ in assumedBonusTypeMap.items():
        if k not in progression and k not in compound_affixes:
            delKeys.append(k)

    for k in delKeys:
        del assumedBonusTypeMap[k]

    # A non-scaling option is the unnumbered variant the item parser renames,
    # so it gets the items' name (Underwater Action is Water Breathing). The
    # site maps the option to it through "affixes" and looks its bonus type up
    # by that name; the option keeps its own, which build URLs carry.
    renamed = {
        option: BOOL_VARIANT_NAMES[option]
        for option in progression
        if option in NON_SCALING_AFFIXES and option in BOOL_VARIANT_NAMES
    }
    if renamed:
        output['affixes'] = renamed
        for option, affix in renamed.items():
            assumedBonusTypeMap.pop(option, None)
            assumedBonusTypeMap[affix] = 'Bool'

    max_level = get_max_known_level(wiki_levels, wiki_keys_used, wiki_progression, 34)
    output['maxLevel'] = max_level
    def fit_to_max_level(values: list) -> list:
        if len(values) < max_level:
            values = values + [values[-1]] * (max_level - len(values))
        return values[:max_level]

    for affix, values in progression.items():
        progression[affix] = fit_to_max_level(values)
    for compound in compounds.values():
        for component, values in compound['affixes'].items():
            compound['affixes'][component] = fit_to_max_level(values)

    return output


def parse_essence_crafting() -> None:
    output = build_essence_crafting_data()
    write_json(output, 'essence-crafting')


if __name__ == "__main__":
    parse_essence_crafting()
