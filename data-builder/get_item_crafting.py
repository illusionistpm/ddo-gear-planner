from typing import TypedDict

from bs4 import BeautifulSoup
from get_inverted_synonym_map import get_inverted_synonym_map
from parse_affixes_from_cell import parse_affixes_from_cell
from pprint import pprint

from typedefs import AffixesDict, SetDict

SystemDict = TypedDict('SystemDict', { '*': list[AffixesDict|SetDict] })


def get_systems_from_page(soup) -> dict[str, SystemDict]:
    synonymMap = get_inverted_synonym_map()

    tables = soup.find(id='bodyContent').find(id='mw-content-text').find_all('table', class_="wikitable")

    systems: dict[str, SystemDict] = {}

    for table in tables:
        headers = table.find_all('th')

        body = table.find('tbody')

        rows = body.find_all('tr', recursive=False)

        for row in rows[1:]:
            fields = row.find_all('td', recursive=False)

            system_name: str = fields[0].find_all('a')[0].getText()

            systems[system_name] = { '*': [] }

            affix_selection = parse_affixes_from_cell('', fields[1], synonymMap, {}, None, {}, {})
            for affix_option in affix_selection:
                systems[system_name]['*'].append({ 'affixes': [affix_option] })

    return systems


def get_item_crafting() -> dict[str, SystemDict]:
    page = open('./cache/crafting/Raw data_Item crafting enchantments.html', "r", encoding='utf-8').read()

    soup = BeautifulSoup(page, 'html.parser')

    systems = get_systems_from_page(soup)

    return systems


if __name__ == "__main__":
    system = get_item_crafting()
    pprint(system)
