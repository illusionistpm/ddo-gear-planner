import openpyxl 
import json
from get_most_common_bonus_type import get_most_common_bonus_type
from write_json import write_json

def parse_cannith():
    assumedBonusTypeMap = get_most_common_bonus_type()

    wb = openpyxl.load_workbook('cannith-crafting.xlsx') 
    
    for s in range(len(wb.sheetnames)):
        if wb.sheetnames[s] == 'Sheet1':
            break
    wb.active = s

    ws = wb.active 

    itemTypeInfoList = []

    for idx, cell in enumerate(ws[1], 0):
        if isinstance(cell.value, str):
            words = cell.value.split()

        if cell.value == 1:
            levelStart = idx
        elif cell.value == 34:
            levelEnd = idx
        elif cell.value in ['Min Level', 'Sort']:
            continue
        elif words[-1] in ['Prefix', 'Suffix', 'Extra']:
            itemType = ' '.join(words[0:-1])
            itemTypeInfoList.append({'col': idx, 'itemType': itemType, 'affixLoc': words[-1]})

    output = {}
    progression = {}
    itemTypes = {}
    output['progression'] = progression
    output['itemTypes'] = itemTypes
    output['bonusTypes'] = assumedBonusTypeMap

    rows = ws.iter_rows()
    next(rows)
    for row in rows:
        affix = row[0].value
        affix = affix.replace('Ins.', 'Insightful')
        affix = affix.title()

        affixes = []

        if affix == 'Universal Spell Lore':
            for lore in ['Acid Lore', 'Cold Lore', 'Electricity Lore', 'Fire Lore', 'Force Lore', 'Light Lore', 'Negative Lore', 'Positive Lore', 'Repair Lore', 'Sonic Lore', 'Spell Lore']:
                affixes.append(lore)

        if affix == 'Spell Resistance (Sr)':
            affix = 'Spell Resistance'

        if affix == 'Resistance (Save)':
            affix = 'Resistance'

        if affix.startswith('Spell Focus: '):
            affix = affix.replace('Spell Focus: ', '') + ' Focus'

        if len(affixes) == 0:
            affixes.append(affix)

        progVals = []
        for val in range(levelStart, levelEnd + 1):
            progVals.append(row[val].value)

        for affix in affixes:
            progression[affix] = progVals

            for itemInfo in itemTypeInfoList:
                isMarked = row[itemInfo['col']].value
                if isMarked and len(isMarked) > 0:
                    if itemInfo['itemType'] not in itemTypes:
                        itemTypes[itemInfo['itemType']] = {}

                    if itemInfo['affixLoc'] not in itemTypes[itemInfo['itemType']]:
                        itemTypes[itemInfo['itemType']][itemInfo['affixLoc']] = []

                    itemTypes[itemInfo['itemType']][itemInfo['affixLoc']].append(affix)

    # Only keep bonus types for things that are actually used by Cannith crafting
    delKeys = []
    for k,v in assumedBonusTypeMap.items():
        if k not in progression:
            delKeys.append(k)

    for k in delKeys:
        del assumedBonusTypeMap[k]

    write_json(output, 'cannith')


if __name__ == "__main__":
    parse_cannith()