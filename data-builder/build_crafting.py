import json
from get_inverted_synonym_map import get_inverted_synonym_map
from parse_slavers import parse_slavers_crafting
from parse_augments import parse_augments
from write_json import write_json
from parse_dinosaur_bone_crafting import parse_dinosaur_bone_crafting
from get_lost_purpose import get_lost_purpose_crafting
import os

def build_crafting():
    nearlyFinished = json.load(open(f"{os.path.dirname(__file__)}/nearly-finished.json", "r", encoding='utf-8'))
    synonymMap = get_inverted_synonym_map()

    slavers = parse_slavers_crafting()

    dino_bone = parse_dinosaur_bone_crafting()

    lost_purpose = get_lost_purpose_crafting()

    augments = parse_augments()

    combined = {}
    combined.update(nearlyFinished)
    combined.update(slavers)
    combined.update(dino_bone)
    combined.update(augments)
    combined.update(lost_purpose)

    # loop through all entries to identify effect names that need to be transformed
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