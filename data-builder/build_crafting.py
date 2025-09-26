import json
from get_inverted_synonym_map import get_inverted_synonym_map
from parse_slavers import parse_slavers_crafting
from write_json import write_json
from get_lost_purpose import get_lost_purpose_crafting
from get_item_crafting import get_item_crafting

import os

def build_crafting():
    nearlyFinished = json.load(open(f"{os.path.dirname(__file__)}/nearly-finished.json", "r", encoding='utf-8'))
    synonymMap = get_inverted_synonym_map()

    slavers = parse_slavers_crafting()

    lost_purpose = get_lost_purpose_crafting()

    item_crafting = get_item_crafting()

    combined = {}
    combined.update(nearlyFinished)
    combined.update(slavers)
    combined.update(lost_purpose)
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
                            # if the entry does not have a 'name' property at the root level (this is generally limited to augments)
                            # generate what the name should be based on values inside the affix (prior to changing values inside the entry)
                            if 'name' not in craftingEntry:
                                # generation of the parent name property depends on minimum level value
                                # so we populate the value with a default if value is not set
                                if 'ml' not in craftingEntry:
                                    minimumLevel = 1
                                else:
                                    minimumLevel = craftingEntry['ml']

                                craftingEntry['name'] = '%s +%d %s (%s)' % (affixEntry['name'], affixEntry['value'], affixEntry['type'], minimumLevel)

                            affixEntry['name'] = synonymMap[affixEntry['name']]

    write_json(combined, 'crafting')


if __name__ == "__main__":
    build_crafting()