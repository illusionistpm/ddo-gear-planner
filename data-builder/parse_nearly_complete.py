import re
from typing import Any, TypedDict

from bs4 import BeautifulSoup

from parse_affixes_from_cell import get_item_property_map_from_tag, x_skills_exceptional_bonus
from typedefs import AffixesDict, SetDict

SystemDict = TypedDict('SystemDict', {'*': list[AffixesDict | SetDict]})

HEROIC_ML = 11
LEGENDARY_ML = 35


def _find_nearly_complete_table(soup: BeautifulSoup) -> Any:
    for table in soup.find_all('table', class_='wikitable'):
        headers = [th.get_text(' ', strip=True) for th in table.find_all('th')]
        if headers[:3] == ['Effect set', 'Available upgrades (Heroic)', 'Available upgrades (Legendary)']:
            return table

    raise ValueError('Unable to find Nearly Complete upgrades table')


def _normalize_affix(affix: dict[str, Any]) -> dict[str, Any]:
    affix = dict(affix)
    affix['name'] = x_skills_exceptional_bonus(affix['name'])
    affix['name'] = re.sub(r'^([A-Za-z]+ Skills) - Exceptional Bonus$', r'\1', affix['name'])
    return affix


def _get_options_from_cell(cell: Any, ml: int) -> list[AffixesDict]:
    ul = cell.find('ul')
    if ul is None:
        return []

    property_map = get_item_property_map_from_tag(ul, {}, {})
    options = []
    for affix in property_map.get('affixes', []):
        options.append({
            'affixes': [_normalize_affix(affix)],
            'ml': ml,
        })

    return options


def get_nearly_complete_crafting_from_page(soup: BeautifulSoup) -> dict[str, SystemDict]:
    table = _find_nearly_complete_table(soup)
    systems: dict[str, SystemDict] = {}

    for row in table.find_all('tr')[1:]:
        fields = row.find_all('td', recursive=False)
        if len(fields) < 3:
            continue

        effect_set = fields[0].get_text(' ', strip=True)
        system_name = f'Nearly Complete: {effect_set}'
        systems[system_name] = {
            '*': [
                *_get_options_from_cell(fields[1], HEROIC_ML),
                *_get_options_from_cell(fields[2], LEGENDARY_ML),
            ],
        }

    return systems


def parse_nearly_complete_crafting() -> dict[str, SystemDict]:
    page = open('./cache/crafting/Nearly_Complete.html', 'r', encoding='utf-8').read()
    soup = BeautifulSoup(page, 'html.parser')
    return get_nearly_complete_crafting_from_page(soup)
