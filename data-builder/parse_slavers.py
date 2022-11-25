import openpyxl 
import json
import os

def parse_slavers_sets():
    wb = openpyxl.load_workbook(f"{os.path.dirname(__file__)}/slavers.xlsx") 
    
    for s in range(len(wb.sheetnames)):
        if wb.sheetnames[s] == 'Set':
            wb.active = s
            ws = wb.active 

    sets = {}

    rows = ws.iter_rows()
    next(rows) # skip header
    for row in rows:
        name = row[0].value
        level = row[1].value
        threshold = row[2].value
        affix = row[3].value
        value = row[4].value
        bonusType = row[5].value

        if level == 28:
            name = 'Legendary ' + name

        if name not in sets:
            sets[name] = []

        if len(sets[name]) == 0 or sets[name][-1]['threshold'] != threshold:
            thr = {}
            thr['threshold'] = threshold
            sets[name].append(thr)
        
        if not 'affixes' in sets[name][-1]:
            sets[name][-1]['affixes'] = []

        aff = {}
        aff['name'] = affix
        aff['value'] = value
        aff['type'] = bonusType

        sets[name][-1]['affixes'].append(aff)

    return sets


def parse_slavers_crafting():
    wb = openpyxl.load_workbook(f"{os.path.dirname(__file__)}/slavers.xlsx") 

    systems = {}
    
    for s in range(len(wb.sheetnames)):
        group = wb.sheetnames[s]

        wb.active = s
        ws = wb.active 

        if group == 'Set':
            continue

        system = "Slaver's " + group + ' Slot'
        legendarySystem = 'Legendary ' + system

        if system not in systems:
            systems[system] = {}
            systems[system]['*'] = []

        if legendarySystem not in systems:
            systems[legendarySystem] = {}
            systems[legendarySystem]['*'] = []

        rows = ws.iter_rows()
        next(rows) # skip header
        for row in rows:
            name = row[0].value
            level = row[1].value
            value = row[2].value
            bonusType = row[3].value
        
            affix = {}
            affix['name'] = name
            affix['value'] = value
            affix['type'] = bonusType

            if affix['name'] == 'Fortification':
                affix['value'] = 100 * affix['value']

            if affix['name'] == 'Use Magic Device (UMD)':
                affix['name'] = 'Use Magic Device'

            if affix['name'] == 'PRR':
                affix['name'] = 'Physical Resistance Rating'

            if affix['name'] == 'MRR':
                affix['name'] = 'Magical Resistance Rating'

            option = {}
            option['affixes'] = [affix]

            mySystem = system if level == 8 else legendarySystem
            
            systems[mySystem]['*'].append(option)

    systems["Slaver's Set Bonus"] = {}
    systems["Slaver's Set Bonus"]['*'] = []

    systems["Legendary Slaver's Set Bonus"] = {}
    systems["Legendary Slaver's Set Bonus"]['*'] = []

    for setName in ["Slave Lord's Might", "Slave Lord's Sorcery", "Slave Lord's Endurance"]:
        option = {}
        option['set'] = setName
        systems["Slaver's Set Bonus"]['*'].append(option)

        option = {}
        option['set'] = 'Legendary ' + setName
        systems["Legendary Slaver's Set Bonus"]['*'].append(option)

    return systems

