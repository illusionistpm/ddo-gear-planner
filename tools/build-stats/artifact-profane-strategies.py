"""For a tracked-affix profile: how many tracked Artifact / Profane needs does each strategy cover?
Gems only (Sun: Armor, Cloak, Helm, Goggles, Trinket; Moon: Bracers, Necklace, Boots, Belt, Gloves),
or a set (placed preferring non-gem slots) plus gems in the gem slots it leaves free.
Usage, from the repository root: python3 tools/build-stats/artifact-profane-strategies.py data
"""
import json, sys
D = sys.argv[1]
items = json.load(open(f'{D}/items.json')); sets = json.load(open(f'{D}/sets.json'))
craft = json.load(open(f'{D}/crafting.json'))
groups = {g['name']: g['affixes'] for g in json.load(open(f'{D}/affix-groups.json'))}
exp = lambda n: groups.get(n, [n])
GEM_SLOTS = {'Artifact': ['Armor', 'Cloak', 'Helm', 'Goggles', 'Trinket'], 'Profane': ['Bracers', 'Necklace', 'Boots', 'Belt', 'Gloves']}
GEM_LIST = {'Artifact': 'Sun Augment Slot', 'Profane': 'Moon Augment Slot'}
eg = [i for i in items if 28 <= i['ml'] <= 34]
setslots = {}
for i in eg:
    for s in i.get('sets') or []:
        setslots.setdefault(s, set()).add('Ring' if i['slot'] == 'Ring' else i['slot'])
basic = ['Healing Amplification','Physical Sheltering','Magical Sheltering','Constitution','Dodge','Fortitude Save','Reflex Save','Will Save','Concealment','Incorporeality','Fortification','False Life','Speed','Freedom of Movement','Feather Falling','Immunity to Blindness','Immunity to Fear','Deathblock','Heroic Inspiration','Undying','Acid Absorption','Cold Absorption','Fire Absorption','Electric Absorption','Sonic Absorption']
PROFILES = {
 'Melee': basic + ['Melee Alacrity','Melee Power','Doublestrike','Deadly','Seeker','Accuracy','Armor-Piercing','Incorporeal Bypass','Armor Class','Deception','Strength'],
 'Ranged': basic + ['Ranged Alacrity','Ranged Power','Doubleshot','Deadly','Seeker','Accuracy','Armor-Piercing','Incorporeal Bypass','Deception','Dexterity'],
 'Fire caster': basic + ['Spellcraft','Wizardry','Spell Penetration','Concentration','Fire Spell Power','Fire Lore','Fire Intensity','Intelligence','Evocation Focus'],
 'Healer': basic + ['Spellcraft','Wizardry','Spell Penetration','Concentration','Devotion','Healing Lore','Heal','Healing Intensity','Wisdom'],
}
syn = {'Combustion': 'Fire Spell Power', 'Devotion': 'Positive Spell Power'}
def gems(typ):
    out = set()
    for o in craft[GEM_LIST[typ]]['*']:
        if (o.get('ml') or 0) <= 34:
            for a in o['affixes']:
                if a.get('type') == typ:
                    out.update(exp(a['name']))
    return out
for prof, names in PROFILES.items():
    names = {syn.get(n, n) for n in names}
    print(f'===== {prof}')
    for typ in ('Artifact', 'Profane'):
        g = gems(typ) & names
        best_set_rows = []
        for s, tiers in sets.items():
            if s not in setslots: continue
            for t in tiers:
                aff = {x for a in t['affixes'] if a.get('type') == typ for x in exp(a['name'])}
                cov = aff & names
                if not cov: continue
                need = t['threshold']; slots = setslots[s]
                # place pieces in non-gem slots first (rings count twice)
                nongem = [x for x in slots if x not in GEM_SLOTS[typ]]
                cap_nongem = sum(2 if x == 'Ring' else 1 for x in nongem)
                gem_slots_used = max(0, need - cap_nongem)
                if gem_slots_used > len([x for x in slots if x in GEM_SLOTS[typ]]): continue
                free_gems = len(GEM_SLOTS[typ]) - gem_slots_used
                extra = min(free_gems, len(g - cov))
                best_set_rows.append((len(cov) + extra, len(cov), gem_slots_used, extra, s, need, sorted(cov)))
        best_set_rows.sort(reverse=True)
        print(f'  {typ}: tracked needs with a {typ} source: gems can carry {len(g)} ({", ".join(sorted(g))[:150]})')
        print(f'    gems only: {min(5, len(g))}')
        for total, cov, used, extra, s, need, covl in best_set_rows[:6]:
            print(f'    {s} {need}pc: {cov} from set (uses {used} gem slots) + {extra} gems = {total} | {", ".join(covl)[:120]}')
