import openpyxl 
import json
  
wb = openpyxl.load_workbook('cannith-crafting.xlsx') 
  
for s in range(len(wb.sheetnames)):
    if wb.sheetnames[s] == 'Sheet1':
        break
wb.active = s

ws = wb.active 

affixIdx = 1
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

rows = ws.iter_rows()
next(rows)
for row in rows:
    affix = row[0].value
    affix = affix.replace('Ins.', 'Insightful')

    progVals = []
    for val in range(levelStart, levelEnd + 1):
        progVals.append(row[val].value)
    
    progression[affix] = progVals

    for itemInfo in itemTypeInfoList:
        isMarked = row[itemInfo['col']].value
        if isMarked and len(isMarked) > 0:
            if itemInfo['itemType'] not in itemTypes:
                itemTypes[itemInfo['itemType']] = {}

            if itemInfo['affixLoc'] not in itemTypes[itemInfo['itemType']]:
                itemTypes[itemInfo['itemType']][itemInfo['affixLoc']] = []

            itemTypes[itemInfo['itemType']][itemInfo['affixLoc']].append(affix)


out = json.dumps(output, sort_keys=True, indent=4)
open("../site/src/assets/cannith.json", 'w', encoding='utf8').write(out)

    