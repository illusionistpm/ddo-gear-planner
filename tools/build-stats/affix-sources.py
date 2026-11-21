"""Where can each tracked (affix, bonus type) come from at endgame?

For each pair: best value, item slots that carry it natively near best, augment
colours that grant it near best and how many slots' endgame items host that colour,
Sun/Moon gems, and set bonuses. Reads data/*.json only.

Usage, from the repository root: python3 tools/build-stats/affix-sources.py data rows.json > affix-sources.md
"""
import collections
import json
import sys

DATA = sys.argv[1]
MIN_ML, MAX_ML = 28, 34
NEAR = 0.9

items = json.load(open(f'{DATA}/items.json'))
craft = json.load(open(f'{DATA}/crafting.json'))
sets = json.load(open(f'{DATA}/sets.json'))
groups = {g['name']: g['affixes'] for g in json.load(open(f'{DATA}/affix-groups.json'))}

ACCEPTS = {  # slot colour -> augment lists it takes (gear-db.service.ts _mergeAugmentLists)
    'Purple': ['Purple', 'Blue', 'Red', 'Colorless'],
    'Orange': ['Orange', 'Yellow', 'Red', 'Colorless'],
    'Green': ['Green', 'Yellow', 'Blue', 'Colorless'],
    'Blue': ['Blue', 'Colorless'], 'Red': ['Red', 'Colorless'], 'Yellow': ['Yellow', 'Colorless'],
    'Colorless': ['Colorless'], 'Sun': ['Sun'], 'Moon': ['Moon'],
}
SLOTS = ['Weapon', 'Offhand', 'Armor', 'Belt', 'Boots', 'Bracers', 'Cloak', 'Gloves', 'Goggles',
         'Helm', 'Necklace', 'Ring', 'Trinket']


def num(v):
    try:
        return float(str(v).replace('+', '').replace('%', ''))
    except ValueError:
        return 1.0


def expand(name):
    return groups.get(name, [name])


endgame = [i for i in items if MIN_ML <= i['ml'] <= MAX_ML and i['slot'] in SLOTS]

# (affix, type) -> slot -> best native value
native = collections.defaultdict(lambda: collections.defaultdict(float))
for i in endgame:
    for a in i['affixes']:
        for n in expand(a['name']):
            k = (n, a.get('type','Bool'))
            native[k][i['slot']] = max(native[k][i['slot']], num(a['value']))

# colour -> slots whose endgame items host a slot accepting that augment list
colour_hosts = collections.defaultdict(lambda: collections.Counter())
for i in endgame:
    for c in i.get('crafting', []):
        if c.endswith(' Augment Slot'):
            colour = c[:-len(' Augment Slot')]
            for lst in ACCEPTS.get(colour, []):
                colour_hosts[lst][i['slot']] += 1

# (affix, type) -> list of (colour, value, ml)
augs = collections.defaultdict(list)
for cname, cv in craft.items():
    if not cname.endswith(' Augment Slot'):
        continue
    colour = cname[:-len(' Augment Slot')]
    for opt in cv.get('*', []):
        if (opt.get('ml') or 0) > MAX_ML:
            continue
        for a in opt.get('affixes', []):
            for n in expand(a['name']):
                augs[(n, a.get('type','Bool'))].append((colour, num(a['value']), opt.get('ml')))

setsrc = collections.defaultdict(list)
for sname, tiers in sets.items():
    for t in tiers:
        for a in t['affixes']:
            for n in expand(a['name']):
                setsrc[(n, a.get('type','Bool'))].append((sname, t['threshold'], num(a['value'])))

PACKAGES = {
    'Basic': ['Healing Amplification', 'Physical Sheltering', 'Magical Sheltering', 'Constitution', 'Dodge',
              'Fortitude Save', 'Reflex Save', 'Will Save', 'Concealment', 'Incorporeality', 'Fortification',
              'False Life', 'Speed', 'Freedom of Movement', 'Feather Falling', 'Immunity to Blindness',
              'Immunity to Fear', 'Deathblock', 'Heroic Inspiration', 'Undying', 'Acid Absorption',
              'Cold Absorption', 'Fire Absorption', 'Electric Absorption', 'Sonic Absorption'],
    'Melee': ['Melee Alacrity', 'Melee Power', 'Doublestrike', 'Deadly', 'Seeker', 'Accuracy', 'Armor-Piercing',
              'Incorporeal Bypass', 'Armor Class', 'Deception', 'Strength'],
    'Caster': ['Spellcraft', 'Wizardry', 'Spell Penetration', 'Concentration', 'Fire Spell Power', 'Fire Lore',
               'Evocation Focus', 'Intelligence'],
}

rows = []
for pkg, names in PACKAGES.items():
    for name in names:
        types = {t for (n, t) in list(native) + list(augs) + list(setsrc) if n == name}
        for t in sorted(types):
            k = (name, t)
            best = max([*native[k].values(), *[v for _, v, _ in augs[k]], *[v for _, _, v in setsrc[k]], 0])
            if best <= 0:
                continue
            near_slots = sorted(s for s, v in native[k].items() if v >= NEAR * best)
            near_augs = sorted({c for c, v, _ in augs[k] if v >= NEAR * best})
            aug_slots = set()
            for c in near_augs:
                aug_slots |= {s for s, n in colour_hosts[c].items() if n >= 3}
            near_sets = sorted({s for s, _, v in setsrc[k] if v >= NEAR * best})
            if near_augs and len(aug_slots) >= 8 and not set(near_augs) <= {'Sun', 'Moon'}:
                cls = 'floating (augment anywhere)'
            elif set(near_augs) & {'Sun', 'Moon'}:
                cls = 'sun/moon'
            elif near_slots and len(near_slots) <= 2 and not near_augs:
                cls = 'slot-bound (<=2 slots)'
            elif near_slots and len(near_slots) <= 4 and not near_augs:
                cls = 'limited (3-4 slots)'
            elif near_slots:
                cls = 'items, many slots'
            elif near_sets:
                cls = 'set-only'
            else:
                cls = 'augment, few hosts'
            rows.append(dict(pkg=pkg, affix=name, type=t, best=best, near_slots=near_slots,
                             near_augs=near_augs, aug_slot_count=len(aug_slots), near_sets=near_sets, cls=cls))

print('| Package | Affix | Type | Best | Item slots near best | Augments near best (host slots) | Sets near best | Class |')
print('|---|---|---|---|---|---|---|---|')
for r in rows:
    print(f"| {r['pkg']} | {r['affix']} | {r['type']} | {r['best']:g} | {len(r['near_slots'])} {','.join(s[:4] for s in r['near_slots'])} | "
          f"{','.join(r['near_augs'])} ({r['aug_slot_count']}) | {len(r['near_sets'])} | {r['cls']} |")

print()
print('Endgame item counts hosting each augment list, by slot (items with >=3 hosting):')
for c in ['Colorless', 'Blue', 'Yellow', 'Red', 'Green', 'Purple', 'Orange', 'Sun', 'Moon']:
    print(c, dict(colour_hosts[c].most_common()))
json.dump(rows, open(sys.argv[2], 'w'), indent=1)
