import json
import os
from copy import deepcopy
from typing import TypedDict
from get_inverted_synonym_map import get_inverted_synonym_map
from parse_slavers import parse_slavers_crafting
from write_json import write_json
from get_item_crafting import get_item_crafting
from parse_nearly_complete import parse_nearly_complete_crafting

from typedefs import AffixesDict, SetDict

SystemDict = TypedDict('SystemDict', { '*': list[AffixesDict|SetDict] })


def add_sealed_in_fire_crafting(item_crafting: dict[str, SystemDict]) -> None:
    if 'Sealed in Fire' not in item_crafting and 'Sealed in Mist' in item_crafting:
        item_crafting['Sealed in Fire'] = deepcopy(item_crafting['Sealed in Mist'])


def build_crafting() -> None:
    synonymMap = get_inverted_synonym_map()

    nearlyFinished: dict[str, SystemDict] = json.load(open(f"{os.path.dirname(__file__)}/nearly-finished.json", "r", encoding='utf-8'))
    nearly_complete: dict[str, SystemDict] = parse_nearly_complete_crafting()
    slavers: dict[str, SystemDict] = parse_slavers_crafting()
    item_crafting: dict[str, SystemDict] = get_item_crafting()
    add_sealed_in_fire_crafting(item_crafting)

    combined: dict[str, SystemDict] = {}
    combined.update(nearlyFinished)
    combined.update(nearly_complete)
    combined.update(slavers)
    combined.update(item_crafting)

    # loop through all Crafting map entries to identify effect names that need to be transformed
    for CraftingSystemName, CraftingSystemMap in combined.items():
        for itemName, CraftingSelectionList in CraftingSystemMap.items():
            # sometimes there is a non list entry inside the Crafting::Item element
            # example : "hiddenFromAffixSearch" = true
            if type(CraftingSelectionList) != list:
                # skip non list entries
                continue

            for craftingEntry in CraftingSelectionList:
                # sometimes crafting entries are references to sets
                # we only need to operate on entries with an 'affixes' key
                if 'affixes' in craftingEntry:
                    for affixEntry in craftingEntry['affixes']:
                        if affixEntry['name'] in synonymMap:
                            affixEntry['name'] = synonymMap[affixEntry['name']]

    write_json(combined, 'crafting')


if __name__ == "__main__":
    build_crafting()
