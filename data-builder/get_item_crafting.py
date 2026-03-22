from typing import TypedDict

from bs4 import BeautifulSoup
from get_inverted_synonym_map import get_inverted_synonym_map
from parse_affixes_from_cell import parse_affixes_from_cell
from parse_affixes_from_cell import get_item_property_map_from_tag
from read_json import read_json
from pprint import pprint

from parse_context_error import ParseContextError
from typedefs import AffixesDict, SetDict

SystemDict = TypedDict('SystemDict', { '*': list[AffixesDict|SetDict] })


def get_systems_from_page(soup, source_page: str | None = None) -> dict[str, SystemDict]:
    setMap = read_json('sets')
    synonymMap = get_inverted_synonym_map()

    tables = soup.find(id='bodyContent').find(id='mw-content-text').find_all('table', class_="wikitable")

    systems: dict[str, SystemDict] = {}

    for table in tables:
        headers = table.find_all('th')

        body = table.find('tbody')

        rows = body.find_all('tr', recursive=False)

        for row_index, row in enumerate(rows[1:], start=1):
            fields = row.find_all('td', recursive=False)

            try:
                aTag = fields[0].find_all('a')
                if (aTag):
                    system_name: str = fields[0].find_all('a')[0].getText()
                else:
                    system_name: str = fields[0].getText().strip()

                systems[system_name] = { '*': [] }

                # generate an item property map from data in unordered list in cell
                craftingSystemPropertyMap = get_item_property_map_from_tag(fields[1].find('ul'), setMap, {})

                # item_property_map will return a flat list of sets
                # transform the flat list to a structured list of entries to be treated as a crafting system selector
                if ('set' in craftingSystemPropertyMap):
                    for entry in craftingSystemPropertyMap['set']:
                        systems[system_name]['*'].append({
                            'name': entry,
                            'set': entry,
                        })

                # item_property_map will return a flat list of affixes
                # transform the flat list to a structured list of entries to be treated as a crafting system selector
                if ('affixes' in craftingSystemPropertyMap):
                    for entry in craftingSystemPropertyMap['affixes']:
                        systems[system_name]['*'].append({
                            'affixes': [entry],
                        })
            except Exception as e:
                raise ParseContextError(
                    "Error parsing crafting system row",
                    page=source_page,
                    row_html=str(row),
                    context={
                        "row_index": row_index,
                    },
                    original=e,
                ) from e

    return systems


def get_item_crafting() -> dict[str, SystemDict]:
    page_path = './cache/crafting/Raw data_Item crafting enchantments.html'
    page = open(page_path, "r", encoding='utf-8').read()

    soup = BeautifulSoup(page, 'html.parser')

    systems = get_systems_from_page(soup, source_page=page_path)

    return systems


if __name__ == "__main__":
    system = get_item_crafting()
    pprint(system)
