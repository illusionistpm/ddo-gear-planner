from read_json import read_json
from functools import reduce

def get_data_stats_description(stats, diff):
    ret = ''

    for k,v in stats.items():
        ret += f"{k}:\n"

        for prop, value in v.items():
            delta = diff[k][prop]
            deltaStr = f"({delta})" if delta < 0 else f"(+{delta})" if delta > 0 else ''

            ret += f" - {prop}: {value} {deltaStr}\n"

        ret += "\n"

    return ret

def diff_data_stats(newStats, oldStats):
    diff = {}

    for k,v in newStats.items():
        diff[k] = {}
        for field in v.keys():
            diff[k][field] = newStats[k][field] - oldStats[k][field]

    return diff
        


def get_data_stats():
    stats = {}

    try:
        affixGroups = read_json('affix-groups')
    except FileNotFoundError:
        affixGroups = []
    stats['groups'] = {'items': len(affixGroups)}

    try:
        affixSynonyms = read_json('affix-synonyms')
    except FileNotFoundError:
        affixSynonyms = []
    stats['synonyms'] = {'items': len(affixSynonyms)}

    try:
        cannith = read_json('cannith')
    except FileNotFoundError:
        cannith = {
            'bonusTypes': [],
            'itemTypes': [],
            'progression': []
        }
    stats['cannith'] = {
        'bonus types': len(cannith['bonusTypes']),
        'item types': len(cannith['itemTypes']),
        'progressions': len(cannith['progression']),
    }

    try:
        crafting = read_json('crafting')
    except FileNotFoundError:
        crafting = {}
    stats['crafting'] = {
        'systems': len(crafting),
        'items': reduce(lambda x, v: x + len(v), crafting.values(), 0)
    }

    try:
        quests = read_json('quests')
    except FileNotFoundError:
        quests = {
            'raids': []
        }
    stats['quests'] = {'raids': len(quests['raids'])}

    try:
        sets = read_json('sets')
    except FileNotFoundError:
        sets = {}
    stats['sets'] = {
        'count': len(sets),
        'affixes': reduce(lambda x, v: x + reduce(lambda x2, v2: x2 + len(v2['affixes']), v, 0), sets.values(), 0)
    }
    
    try:
        items = read_json('items')
    except FileNotFoundError:
        items = []
    stats['items'] = {
        'items': len(items),
        'affixes': reduce(lambda x, v: x + len(v['affixes']), items, 0)
    }

    return stats

if __name__ == "__main__":
    oldStats = get_data_stats()
    oldStats['groups']['items'] = oldStats['groups']['items'] +3
    oldStats['cannith']['bonus types'] = oldStats['cannith']['bonus types'] - 5

    newStats = get_data_stats()
    diff = diff_data_stats(newStats, oldStats)
    statsStr = get_data_stats_description(newStats, diff)
    print(statsStr)