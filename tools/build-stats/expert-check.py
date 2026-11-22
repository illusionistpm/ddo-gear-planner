"""Compare an expert's gear priorities with what the game data says about each effect.

The expert lists are Lominal's "Gearing at cap" tables (Lominal's Endgame Builds), transcribed by
hand into lominal-priorities.json (shared with the suggestion harness): for each role, the effects in each tier (critical / strong / filler) and the colour he gives
each one, which says two things - is it hard to find, and can it be augmented:

    cyan    not hard to find, not an augment (may be craftable)
    green   not hard to find, can be augmented
    orange  rare / hard to find
    yellow  rare, but also an augment

Each effect is mapped to the planner's (affix, bonus type) pairs. An effect named without a bonus
type means its main type, as he says ("assume it is enhancement, the highest value of each stat").
Two effects aren't mapped: off-stat trance (it isn't a gear affix).

For each mapped pair this works out, from items and augments at level 28-34:
  - item slots: equipment slots with an item carrying it at >= NEAR of its best value,
  - craft slots: slots whose items carry a non-augment crafting system offering it at >= NEAR,
  - items: how many endgame items carry it natively at >= NEAR of its best value,
  - augment: the best augment (coloured, Colorless, Sun, Moon) as a share of its best value,
and classes it with the same two questions. "Hard to find" is judged two ways: by slots (what the
planner's AffixAvailabilityService does today) and by items. Then it prints where each agrees.

Usage, from the repository root: python3 tools/build-stats/expert-check.py data [--json out.json]
"""
import collections
import json
import os
import sys

DATA = sys.argv[1]
MIN_ML, MAX_ML = 28, 34
NEAR = 0.7          # "near best" for items and augments
HARD_SLOTS = 4      # slot rule: at most this many slots carry it near best -> hard to find
HARD_ITEMS = 25     # item rule: at most this many items carry it near best, or at most
HARD_ITEM_SLOTS = 3  # this many slots (weapon-only effects) -> hard to find

PRIORITIES = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lominal-priorities.json')))
EXPERT = {}
for role, entries in PRIORITIES['roles'].items():
    tiers = EXPERT.setdefault(role, {'critical': [], 'strong': [], 'filler': []})
    for e in entries:
        tiers[e['tier']].append((e['label'], e['colour'], [(a, t) for a, t in e['pairs']]))

items = json.load(open(f'{DATA}/items.json'))
craft = json.load(open(f'{DATA}/crafting.json'))
groups = {g['name']: g['affixes'] for g in json.load(open(f'{DATA}/affix-groups.json'))}
synonyms = {s: e['name'] for e in json.load(open(f'{DATA}/affix-synonyms.json')) for s in e['synonyms']}


def expand(name):
    name = synonyms.get(name, name)
    return [synonyms.get(n, n) for n in groups.get(name, [name])]


def num(v):
    try:
        return float(str(v).replace('+', '').replace('%', ''))
    except ValueError:
        return 1.0


endgame = [i for i in items if MIN_ML <= i['ml'] <= MAX_ML]
ACCEPTS = {'Purple': ['Purple', 'Blue', 'Red', 'Colorless'], 'Orange': ['Orange', 'Yellow', 'Red', 'Colorless'],
           'Green': ['Green', 'Yellow', 'Blue', 'Colorless'], 'Blue': ['Blue', 'Colorless'], 'Red': ['Red', 'Colorless'],
           'Yellow': ['Yellow', 'Colorless'], 'Colorless': ['Colorless'], 'Sun': ['Sun'], 'Moon': ['Moon']}

native = collections.defaultdict(lambda: collections.defaultdict(float))   # (affix,type) -> slot -> best
for i in endgame:
    slot = i['slot']
    for a in i['affixes']:
        for n in expand(a['name']):
            k = (n, a.get('type', 'Bool'))
            native[k][slot] = max(native[k][slot], num(a.get('value', 1)))

augment = collections.defaultdict(lambda: collections.defaultdict(float))  # (affix,type) -> list -> best
crafted = collections.defaultdict(lambda: collections.defaultdict(float))  # (affix,type) -> system -> best
for cname, cv in craft.items():
    is_aug = cname.endswith(' Augment Slot')
    for key, opts in cv.items():
        for o in opts:
            if (o.get('ml') or 0) > MAX_ML:
                continue
            for a in o.get('affixes', []):
                for n in expand(a['name']):
                    k = (n, a.get('type', 'Bool'))
                    target = augment if is_aug else crafted
                    sysname = cname[:-len(' Augment Slot')] if is_aug else cname
                    target[k][sysname] = max(target[k][sysname], num(a.get('value', 1)))

# Which slots offer each crafting system / augment list on endgame items.
system_slots = collections.defaultdict(set)
for i in endgame:
    for c in i.get('crafting', []):
        if c.endswith(' Augment Slot'):
            for lst in ACCEPTS.get(c[:-len(' Augment Slot')], []):
                system_slots['aug:' + lst].add(i['slot'])
        else:
            system_slots[c].add(i['slot'])

MAIN_TYPES = ['Enhancement', 'Competence', 'Equipment', 'Bool']


def best_of(k):
    return max([*native[k].values(), *augment[k].values(), *crafted[k].values(), 0])


def resolve(affix, typ):
    if typ:
        return typ
    for t in MAIN_TYPES:
        if best_of((affix, t)) > 0:
            return t
    return 'Enhancement'


rows = []
for role, tiers in EXPERT.items():
    for tier, entries in tiers.items():
        for label, colour, pairs in entries:
            parts = []
            for affix, typ in pairs:
                typ = resolve(affix, typ)
                k = (affix, typ)
                best = best_of(k)
                if best <= 0:
                    parts.append(dict(affix=affix, type=typ, best=0, item_slots=0, items=0, craft_slots=0, aug_share=0, aug_lists=[]))
                    continue
                item_slots = {s for s, v in native[k].items() if v >= NEAR * best}
                n_items = sum(1 for i in endgame if any(
                    n == affix and a.get('type', 'Bool') == typ and num(a.get('value', 1)) >= NEAR * best
                    for a in i['affixes'] for n in expand(a['name'])))
                craft_slots = set()
                for system, v in crafted[k].items():
                    if v >= NEAR * best:
                        craft_slots |= system_slots.get(system, set())
                aug_lists = [l for l, v in augment[k].items() if v >= NEAR * best]
                aug_share = max([v for v in augment[k].values()] + [0]) / best
                parts.append(dict(affix=affix, type=typ, best=best, item_slots=len(item_slots | craft_slots), items=n_items,
                                  native_slots=len(item_slots), craft_slots=len(craft_slots - item_slots),
                                  aug_share=round(aug_share, 2), aug_lists=sorted(aug_lists)))
            if not parts:
                rows.append(dict(role=role, tier=tier, label=label, colour=colour, ours=None, parts=[]))
                continue
            # A multi-part effect (sheltering, absorbs) is as hard as its hardest part, and augmentable only
            # if every part is.
            colour_of = {(False, False): 'cyan', (False, True): 'green', (True, False): 'orange', (True, True): 'yellow'}
            aug = all(p['aug_lists'] for p in parts)
            by_slots = colour_of[(any(p['item_slots'] <= HARD_SLOTS for p in parts), aug)]
            by_items = colour_of[(any(p['items'] <= HARD_ITEMS or p['item_slots'] <= HARD_ITEM_SLOTS for p in parts), aug)]
            rows.append(dict(role=role, tier=tier, label=label, colour=colour, ours=by_items, by_slots=by_slots, parts=parts))

mapped = [r for r in rows if r['ours']]


def is_hard(colour):
    return colour in ('orange', 'yellow')


def is_aug(colour):
    return colour in ('green', 'yellow')


print(f'{len(mapped)} mapped entries.')
print(f"  augmentable: agrees on {sum(is_aug(r['ours']) == is_aug(r['colour']) for r in mapped)}")
print(f"  hard to find, by slots (<= {HARD_SLOTS} slots near best, as the planner does today): agrees on "
      f"{sum(is_hard(r['by_slots']) == is_hard(r['colour']) for r in mapped)}")
print(f"  hard to find, by items (<= {HARD_ITEMS} items or <= {HARD_ITEM_SLOTS} slots near best): agrees on "
      f"{sum(is_hard(r['ours']) == is_hard(r['colour']) for r in mapped)}")
print(f"  whole colour, by items: agrees on {sum(r['ours'] == r['colour'] for r in mapped)}")
print()
print('| Role | Tier | Effect | His | Ours (items) | Ours (slots) | Items near best | Slots near best | Best augment (share of best) |')
print('|---|---|---|---|---|---|---|---|---|')
for r in rows:
    if not r['ours']:
        print(f"| {r['role']} | {r['tier']} | {r['label']} | {r['colour']} | n/a | n/a | | | |")
        continue
    mark = '' if r['ours'] == r['colour'] else ' **≠**'
    short = lambda p: f"{p['affix'].replace(' Absorption', '').replace(' Sheltering', '')} {p['type']}"
    items_s = ', '.join(f"{short(p)}: {p['items']}" for p in r['parts'])
    slots = ', '.join(str(p['item_slots']) for p in r['parts'])
    augs = ', '.join(f"{'/'.join(p['aug_lists']) or '-'} ({p['aug_share']:.0%})" for p in r['parts'])
    print(f"| {r['role']} | {r['tier']} | {r['label']} | {r['colour']} | {r['ours']}{mark} | {r['by_slots']} | {items_s} | {slots} | {augs} |")

if '--json' in sys.argv:
    json.dump(rows, open(sys.argv[sys.argv.index('--json') + 1], 'w'), indent=1)
