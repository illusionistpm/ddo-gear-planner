import json

def get_lost_purpose_crafting():
    systems = {}
    lostPurposeOptions = []
    lostPurposeLegendaryOptions = []
    systems['Lost Purpose'] = { '*': []}
    systems['Lost Purpose']['*'] = lostPurposeOptions
    systems['Legendary Lost Purpose'] = { '*': []}
    systems['Legendary Lost Purpose']['*'] = lostPurposeLegendaryOptions

    lostPurposeSetsData = open('./lost_purpose.json',)

    lostPurposeSets = json.load(lostPurposeSetsData)

    for lostPurposeSet in lostPurposeSets['heroicSets']:
        if 'thresholds' in lostPurposeSet:
            continue

        lostPurposeOptions.append({
            'set': lostPurposeSet['name'],
            'name': lostPurposeSet['name']
        })

    for lostPurposeSet in lostPurposeSets['legendarySets']:
        if 'thresholds' in lostPurposeSet:
            continue
        
        lostPurposeLegendaryOptions.append({
            'set': "Legendary " + lostPurposeSet['name'],
            'name': "Legendary " + lostPurposeSet['name']
        })


    lostPurposeOptions.append({
        'name': "Forbidden Knowledge",
        'set': "Forbidden Knowledge"
    })

    lostPurposeLegendaryOptions.append({
        'name': "Legendary Forbidden Knowledge",
        'set': "Legendary Forbidden Knowledge"
    })

    return systems

def get_lost_purpose_sets():
    systems = {}
    lostPurposeOptions = []
    lostPurposeLegendaryOptions = []
    systems['Lost Purpose'] = { '*': []}
    systems['Lost Purpose']['*'] = lostPurposeOptions
    systems['Legendary Lost Purpose'] = { '*': []}
    systems['Legendary Lost Purpose']['*'] = lostPurposeLegendaryOptions

    lostPurposeSetsData = open('./lost_purpose.json',)

    lostPurposeSets = json.load(lostPurposeSetsData)

    for lostPurposeSet in lostPurposeSets['heroicSets']:
        if 'thresholds' in lostPurposeSet:
            continue

        lostPurposeOptions.append({
            'affixes': lostPurposeSet['affixes'],
            'name': lostPurposeSet['name']
        })

    for lostPurposeSet in lostPurposeSets['legendarySets']:
        if 'thresholds' in lostPurposeSet:
            continue
        
        lostPurposeLegendaryOptions.append({
            'affixes': lostPurposeSet['affixes'],
            'name': "Legendary " + lostPurposeSet['name']
        })


    return systems

if __name__ == "__main__":
    system = get_lost_purpose()
    pprint(system)