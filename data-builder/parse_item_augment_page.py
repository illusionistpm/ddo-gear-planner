from bs4 import BeautifulSoup
import re
from parse_affixes_from_cell import get_affix_map_list_from_tag
from parse_affixes_from_cell import replace_item_set_affixes
from read_json import read_json
from write_json import write_json

def convert_augment_type(augment_type):
    augmentTypeTransformMap = {
        'Moon'           : 'Moon Augment Slot',
        'Sun'            : 'Sun Augment Slot',
        'Blue'           : 'Blue Augment Slot',
        'Red'            : 'Red Augment Slot',
        'Yellow'         : 'Yellow Augment Slot',
        'Green'          : 'Green Augment Slot',
        'Purple'         : 'Purple Augment Slot',
        'Orange'         : 'Orange Augment Slot',
        'Colorless'      : 'Colorless Augment Slot',
    }

    pack_name = None

    # Drop the pack name if it exists for brevity
    if ':' in augment_type:
        split = augment_type.split(':')
        pack_name = split[0].strip()
        augment_type = split[1].strip()

    # If item augment is associated with set bonus restore the pack name since it's necessary to differentiate sets
    if augment_type == 'Set Bonus':
        return f"{pack_name}: Set Bonus Slot: Empty" if pack_name else "Set Bonus Slot: Empty"

    return augmentTypeTransformMap.get(augment_type, augment_type)


def get_item_augments_from_page(soup):
    itemAugmentMap = {}

    dataTable = soup.find(id='bodyContent').find(id='mw-content-text').contents[0].find('table', class_="wikitable")

    rows = dataTable.find_all('tr')

    # safe to assume the first row will have the headers we are looking for
    dataTableItemNameCell = rows[0].find('th', string=re.compile('Item'))
    if dataTableItemNameCell:
        dataTableItemNameCellIndex = rows[0].find_all('th').index(dataTableItemNameCell)

    dataTableMinimumLevelCell = rows[0].find('th', string=re.compile('Minimum level'))
    if dataTableMinimumLevelCell:
        dataTableMinimumLevelCellIndex = rows[0].find_all('th').index(dataTableMinimumLevelCell)

    dataTableAugmentTypeCell = rows[0].find('th', string=re.compile('Augment type'))
    if dataTableAugmentTypeCell:
        dataTableAugmentTypeCellIndex = rows[0].find_all('th').index(dataTableAugmentTypeCell)

    dataTableEffectsCell = rows[0].find('th', string=re.compile('Enchantments'))
    if dataTableEffectsCell:
        dataTableEffectsCellIndex = rows[0].find_all('th').index(dataTableEffectsCell)

    dataTableLocationCell = rows[0].find('th', string=re.compile('Location'))
    if dataTableLocationCell:
        dataTableLocationCellIndex = rows[0].find_all('th').index(dataTableLocationCell)

    # process each item augment row
    for row in rows[1:]:
        cells = row.find_all('td')

        craftingEntry = {}
        craftingEntry['name'] = cells[dataTableItemNameCellIndex].get_text(strip=True)

        craftingEntry['ml'] = int(cells[dataTableMinimumLevelCellIndex].get_text(strip=True))

        affixMapList = get_affix_map_list_from_tag(cells[dataTableEffectsCellIndex].find_all('ul')[0])

        affixMap = {}
        affixMapArtifactVariant     = {}
        affixMapQuarterstaffVariant = {}
        for affix in affixMapList:
            if (
                ('uniquePropertyRequired' in affix)
                and ('requireMinorArtifact' in affix['uniquePropertyRequired'])
                and (affix['uniquePropertyRequired']['requireMinorArtifact'] == True)
                ):
                # add the affix variant to a staging list
                affixMapArtifactVariant[affix['name']] = affix
            elif (
                ('uniquePropertyRequired' in affix)
                and ('requireQuarterstaff' in affix['uniquePropertyRequired'])
                and (affix['uniquePropertyRequired']['requireQuarterstaff'] == True)
                ):
                # add the affix variant to a staging list
                affixMapQuarterstaffVariant[affix['name']] = affix
            else:
                affixMap[affix['name']] = affix

        craftingEntry['affixes'] = affixMap

        itemQuestsTooltipSpan = cells[dataTableLocationCellIndex].find('a')
        itemQuestsTooltip     = itemQuestsTooltipSpan.get('title') if itemQuestsTooltipSpan else None
        if (itemQuestsTooltip):
            quests = str(itemQuestsTooltip)
            craftingEntry['quests'] = [quests]

        itemAugmentType = convert_augment_type(cells[dataTableAugmentTypeCellIndex].get_text(strip=True))

        if (itemAugmentType not in itemAugmentMap):
            itemAugmentMap[itemAugmentType] = {}
            itemAugmentMap[itemAugmentType]['*'] = {}

        # *** can remove this once drift is cleared up
        # *** it may be helpful to leave these data points in
        if (craftingEntry['name'].startswith('Set Bonus: ')):
            del craftingEntry['ml']
            del craftingEntry['quests']
            craftingEntry['name'] = craftingEntry['name'].replace('Set Bonus: ', '')

        itemAugmentMap[itemAugmentType]['*'][craftingEntry['name']] = craftingEntry

        if (affixMapArtifactVariant):
            itemAugmentTypeArtifactVariant = itemAugmentType + ' (artifact)'

            if (itemAugmentTypeArtifactVariant not in itemAugmentMap):
                itemAugmentMap[itemAugmentTypeArtifactVariant] = {}
                itemAugmentMap[itemAugmentTypeArtifactVariant]['*'] = {}

            itemAugmentMap[itemAugmentTypeArtifactVariant]['*'][craftingEntry['name']] = {
                'affixes' : affixMapArtifactVariant,
                'ml'      : craftingEntry['ml'],
                'name'    : craftingEntry['name'],
                'quests'  : craftingEntry['quests'],
            }

        if (affixMapQuarterstaffVariant):
            itemAugmentTypeQuarterstaffVariant = itemAugmentType + ' (quarterstaff)'

            if (itemAugmentTypeQuarterstaffVariant not in itemAugmentMap):
                itemAugmentMap[itemAugmentTypeQuarterstaffVariant] = {}
                itemAugmentMap[itemAugmentTypeQuarterstaffVariant]['*'] = {}

            itemAugmentMap[itemAugmentTypeQuarterstaffVariant]['*'][craftingEntry['name']] = {
                'affixes' : affixMapQuarterstaffVariant,
                'ml'      : craftingEntry['ml'],
                'name'    : craftingEntry['name'],
                'quests'  : craftingEntry['quests'],
            }


    # pass through each element of the item augment crafting map
    # searching for elements related to variants
    # if element is a variant, perform deep merge with non variant source to populate all items needed for variant
    for craftingSlotKey, craftingSlotValue in itemAugmentMap.items():
        if (("artifact" in craftingSlotKey) or ("quarterstaff" in craftingSlotKey)):
            nonVariantCraftingSlotName = craftingSlotKey.replace(' (artifact)', '').replace(' (quarterstaff)', '')

            # loop through each item in the non variant wildcard crafting slot map
            for itemAugmentKey, itemAugmentValue in itemAugmentMap[nonVariantCraftingSlotName]['*'].items():
                if (itemAugmentKey in itemAugmentMap[craftingSlotKey]['*']):
                    for affixKey, affixValue in itemAugmentMap[nonVariantCraftingSlotName]['*'][itemAugmentKey]['affixes'].items():
                        if (affixKey not in itemAugmentMap[craftingSlotKey]['*'][itemAugmentKey]['affixes']):
                            itemAugmentMap[craftingSlotKey]['*'][itemAugmentKey]['affixes'][affixKey] = affixValue
                else:
                    itemAugmentMap[craftingSlotKey]['*'][itemAugmentKey] = itemAugmentValue

    # original variable was collection of maps to help simplify processing
    # convert some maps to lists before returning to standardize on the data structure
    returnMap = {}
    for key, value in itemAugmentMap.items():
        returnMap[key] = {}
        for ikey, ivalue in value.items():
            returnMap[key][ikey] = []
            for iikey, iivalue in ivalue.items():
                affixList = []
                for affixEntry in iivalue['affixes'].values():
                    affixList.append(affixEntry)
                newMap = iivalue.copy()
                newMap['affixes'] = affixList
                returnMap[key][ikey].append(newMap)

    return returnMap


def parse_item_augment_page():
    page = open('./cache/item_augments/Raw data_Item augments.html', 'r', encoding='utf-8').read()

    soup = BeautifulSoup(page, 'html.parser')

    item_augments = get_item_augments_from_page(soup)

    item_augments = replace_item_set_affixes(item_augments)

    crafting = read_json('crafting')

    mergedCrafting = {**crafting, **item_augments}

    # add sorting to crafting system entries
    for craftingSystemName in mergedCrafting.keys():
        for craftingSystemItem in mergedCrafting[craftingSystemName]:
            if isinstance(mergedCrafting[craftingSystemName][craftingSystemItem], list):
                mergedCrafting[craftingSystemName][craftingSystemItem].sort(key=lambda x: x.get('name', ''))

    write_json(mergedCrafting, 'crafting')


if __name__ == "__main__":
    parse_item_augment_page()
