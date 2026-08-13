from bs4 import BeautifulSoup
import os
import re
from typing import TypedDict
from build_affix_groups import get_all_skills
from compound_affixes import load_compound_affixes
from get_inverted_synonym_map import get_inverted_synonym_map

from typedefs import Affix, AffixesDict, SetDict

SystemDict = TypedDict('SystemDict', { '*': list[AffixesDict|SetDict] })

SLAVERS_CRAFTING_PATH = f"{os.path.dirname(__file__)}/cache/crafting/Slave_Lords_Crafting.html"

SLAVERS_SPELL_LORE_AFFIXES = [
    'Acid Lore',
    'Fire Lore',
    'Ice Lore',
    'Lightning Lore',
    'Healing Lore',
    'Radiance Lore',
    'Repair Lore',
    'Sonic Lore',
    'Void Lore',
]
SLAVERS_SPELL_POWER_AFFIXES = [
    'Combustion',
    'Corrosion',
    'Devotion',
    'Glaciation',
    'Impulse',
    'Magnetism',
    'Nullification',
    'Radiance',
    'Reconstruction',
    'Resonance',
]
RECIPE_GROUPS = ['Prefix', 'Suffix', 'Extra', 'Bonus']

WIKI_RECIPE_NAMES = {
    'Armor Piercing': 'Armor-Piercing',
    'Deception (no bluff effect)': 'Deception',
    'UMD ( note: barter displays incorrect values.)': 'Use Magic Device',
    'Quality False Life': 'False Life',
    'Quality Fortification': 'Fortification',
    'Quality MRR': 'Magical Resistance Rating',
    'Quality PRR': 'Physical Resistance Rating',
}

WIKI_RECIPE_TYPES = {
    'Prefix': {
        'default': 'Enhancement',
    },
    'Suffix': {
        'Accuracy': 'Competence',
        'Armor Piercing': 'Enhancement',
        'Deadly': 'Competence',
        'Deception (no bluff effect)': 'Enhancement',
        'Resistance': {'heroic': 'Enhancement', 'legendary': 'Resistance'},
        'Seeker': 'Enhancement',
        'Spell Lore (single type) (Equipment Bonus)': 'Equipment',
        'Spell Power (single type) (Equipment Bonus)': 'Equipment',
    },
    'Extra': {
        'Skills (except UMD)': 'Competence',
        'UMD ( note: barter displays incorrect values.)': 'Competence',
        'Shatter': 'Enhancement',
        'Spell Focus Mastery': 'Equipment',
        'Spell Penetration': 'Equipment',
        'Stunning': 'Enhancement',
        'Tendon Slice': 'Enhancement',
        'Vertigo': 'Enhancement',
    },
    'Bonus': {
        'default': 'Quality',
    },
}

SET_AFFIXES = {
    "Slave Lord's Might": {
        3: ['Ranged Power', 'Melee Power', 'Deadly'],
        5: ['Ranged Power', 'Melee Power', 'Deadly', 'Strength', 'Dexterity'],
    },
    "Slave Lord's Sorcery": {
        3: ['Spell Power', 'Spell Focus Mastery'],
        5: ['Spell Power', 'Spell Focus Mastery', 'Intelligence', 'Wisdom', 'Charisma'],
    },
    "Slaver's Endurance": {
        3: ['Magical Sheltering', 'Physical Sheltering', 'Resistance', 'Spell Saves'],
        5: ['Constitution', 'Magical Sheltering', 'Physical Sheltering', 'Resistance', 'Spell Saves'],
    },
}

LEGACY_SET_NAMES = {
    "Slaver's Endurance": "Slave's Endurance",
}


def load_slavers_crafting_soup(path: str = SLAVERS_CRAFTING_PATH) -> BeautifulSoup:
    with open(path, 'r', encoding='utf-8') as fh:
        return BeautifulSoup(fh.read(), 'html.parser')


def get_ability_affixes() -> list[str]:
    compound_affixes = load_compound_affixes()
    well_rounded = compound_affixes.get('Well Rounded')
    if well_rounded is None:
        raise ValueError('Unable to find Well Rounded compound affix for Slavers ability expansion')
    return [component['name'] for component in well_rounded.get('components', [])]


def get_slavers_skill_affixes() -> list[str]:
    return [skill for skill in get_all_skills() if skill != 'Use Magic Device']


def parse_wiki_number(value: str) -> int | float | str:
    value = value.strip()
    is_percent = value.endswith('%')
    value = value.replace('+', '').replace('%', '')
    if re.fullmatch(r'\d+d\d+', value):
        return value
    number = float(value)
    if number.is_integer() and not is_percent:
        return int(number)
    return number


def get_table_by_headers(soup: BeautifulSoup, headers: list[str]):
    for table in soup.find_all('table'):
        first_row = table.find('tr')
        if first_row is None:
            continue
        table_headers = [cell.get_text(' ', strip=True) for cell in first_row.find_all(['th', 'td'], recursive=False)]
        if table_headers == headers:
            return table
    raise ValueError(f"Unable to find Slavers table with headers: {headers}")


def get_slavers_recipe_rows_from_wiki(soup: BeautifulSoup) -> list[tuple[str, str, int | float | str, int | float | str]]:
    table = get_table_by_headers(soup, ['Group', 'Enchantment name', 'Enchantment value', 'Ingredient cost'])
    rows = []
    current_group = None

    for row in table.find_all('tr')[2:]:
        cells = [cell.get_text(' ', strip=True) for cell in row.find_all(['th', 'td'], recursive=False)]
        if not cells:
            continue

        maybe_group = cells[0].split()[0]
        if maybe_group in RECIPE_GROUPS:
            current_group = maybe_group
            cells = cells[1:]
        elif current_group is None:
            continue

        if current_group not in RECIPE_GROUPS or len(cells) < 3:
            continue

        name = cells[0]
        if name.startswith('Augment Slot') or name.startswith('Set bonus') or name.startswith('Mythic'):
            continue
        if name.startswith('Colorless Augment Slot') or name.startswith('Slave Lord'):
            continue
        if name in ['Mythic Boost'] or name.startswith('Blue Augment Slot') or name.startswith('Yellow Augment Slot') or name.startswith('Green Augment Slot'):
            continue
        if name.startswith('Damage Guards'):
            continue

        rows.append((current_group, name, parse_wiki_number(cells[1]), parse_wiki_number(cells[2])))

    return rows


def expand_slavers_recipe_name(name: str) -> list[str]:
    if name in ['Attributes', 'Quality Attributes']:
        return get_ability_affixes()
    if name in ['Skills (except UMD)', 'Quality Skills']:
        return get_slavers_skill_affixes()
    if name == 'Spell Lore (single type) (Equipment Bonus)':
        return SLAVERS_SPELL_LORE_AFFIXES
    if name == 'Spell Power (single type) (Equipment Bonus)':
        return SLAVERS_SPELL_POWER_AFFIXES
    return [WIKI_RECIPE_NAMES.get(name, name)]


def get_slavers_recipe_type(group: str, name: str, legendary: bool) -> str:
    type_entry = WIKI_RECIPE_TYPES[group].get(name, WIKI_RECIPE_TYPES[group].get('default'))
    if isinstance(type_entry, dict):
        return type_entry['legendary' if legendary else 'heroic']
    if type_entry is None:
        raise ValueError(f"Unable to determine Slavers bonus type for {group}: {name}")
    return type_entry


def get_slavers_set_value(cell_text: str, affix: str) -> int:
    patterns = {
        'Ranged Power': r'\+([0-9]+) artifact bonus to Melee Power/Ranged Power',
        'Melee Power': r'\+([0-9]+) artifact bonus to Melee Power/Ranged Power',
        'Deadly': r'\+([0-9]+) artifact bonus to Deadly',
        'Strength': r'\+([0-9]+) artifact bonus to Strength and Dexterity',
        'Dexterity': r'\+([0-9]+) artifact bonus to Strength and Dexterity',
        'Spell Power': r'\+([0-9]+) artifact bonus to Spell Power',
        'Spell Focus Mastery': r'\+([0-9]+) artifact bonus to Spell Focus Mastery',
        'Intelligence': r'\+([0-9]+) artifact bonus to Int/Wis/Cha',
        'Wisdom': r'\+([0-9]+) artifact bonus to Int/Wis/Cha',
        'Charisma': r'\+([0-9]+) artifact bonus to Int/Wis/Cha',
        'Magical Sheltering': r'\+([0-9]+) artifact bonus to MRR/PRR',
        'Physical Sheltering': r'\+([0-9]+) artifact bonus to MRR/PRR',
        'Resistance': r'\+([0-9]+) artifact bonus to Resistance',
        'Spell Saves': r'\+([0-9]+) artifact bonus to Spell Saves',
        'Constitution': r'\+([0-9]+) artifact bonus to Constitution',
    }
    value_match = re.search(patterns[affix], cell_text)
    if value_match is None:
        raise ValueError(f"Unable to parse {affix} value from {cell_text}")
    return int(value_match.group(1))


def parse_slavers_sets():
    soup = load_slavers_crafting_soup()
    table = get_table_by_headers(soup, ['Name', 'Heroic', 'Legendary'])
    sets = {}
    synMap = get_inverted_synonym_map()

    for row in table.find_all('tr')[2:]:
        cells = [cell.get_text(' ', strip=True) for cell in row.find_all(['th', 'td'], recursive=False)]
        if len(cells) != 5:
            continue

        wiki_set_name = cells[0]
        if wiki_set_name not in SET_AFFIXES:
            raise ValueError(f"Unknown Slavers set: {wiki_set_name}")

        for level, heroic_offset in [(8, 1), (28, 3)]:
            name = LEGACY_SET_NAMES.get(wiki_set_name, wiki_set_name)
            if level == 28:
                name = 'Legendary ' + name
            sets[name] = []

            for threshold, cell_text in [(3, cells[heroic_offset]), (5, cells[heroic_offset + 1])]:
                affixes = []
                for affix in SET_AFFIXES[wiki_set_name][threshold]:
                    affix_name = synMap.get(affix, affix)
                    affixes.append({'name': affix_name, 'value': get_slavers_set_value(cell_text, affix), 'type': 'Artifact'})

                sets[name].append({'threshold': threshold, 'affixes': affixes})

    return sets


def parse_slavers_crafting() -> dict[str, SystemDict]:
    soup = load_slavers_crafting_soup()
    systems: dict[str, SystemDict] = {}

    for group in RECIPE_GROUPS:
        system = "Slaver's " + group + ' Slot'
        legendarySystem = 'Legendary ' + system
        systems[system] = { '*': [] }
        systems[legendarySystem] = { '*': [] }

    for group, name, heroic_value, legendary_value in get_slavers_recipe_rows_from_wiki(soup):
        for affix_name in expand_slavers_recipe_name(name):
            heroic_affix: Affix = {
                'name': affix_name,
                'value': heroic_value,
                'type': get_slavers_recipe_type(group, name, False),
            }
            legendary_affix: Affix = {
                'name': affix_name,
                'value': legendary_value,
                'type': get_slavers_recipe_type(group, name, True),
            }

            systems["Slaver's " + group + ' Slot']['*'].append({'affixes': [heroic_affix]})
            systems['Legendary Slaver\'s ' + group + ' Slot']['*'].append({'affixes': [legendary_affix]})

    systems["Slaver's Set Bonus"] = { '*': [] }
    systems["Legendary Slaver's Set Bonus"] =  { '*': [] }

    for setName in ["Slave Lord's Might", "Slave Lord's Sorcery", "Slave Lord's Endurance"]:
        systems["Slaver's Set Bonus"]['*'].append({ 'set': setName })
        systems["Legendary Slaver's Set Bonus"]['*'].append({ 'set': 'Legendary ' + setName })

    return systems

