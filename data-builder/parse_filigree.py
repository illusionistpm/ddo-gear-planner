"""Filigrees, their sets and where they drop, from the Sentient_Weapon/Filigrees
and Item:Thread_of_Fate pages, into data/filigree.json.

Every effect becomes an affix, numeric or not: a filigree's own bonus is of
type "Filigree" and a set bonus of type "Filigree Set" (every filigree bonus is
unique and stacks with everything). Text-only effects keep their wiki wording
as a "Bool" affix, the type item data gives on/off effects (True Seeing,
Deathblock), so the two meet in one tracked row. Combined effects ("+5 Melee and Ranged Power") are split by
filigree_compound_affixes.json, and names are mapped onto the planner's affix
names by the shared synonym table plus FILIGREE_AFFIX_NAMES.
"""
import os
import re

from bs4 import BeautifulSoup

from compound_affixes import expand_single_affix
from get_inverted_synonym_map import get_inverted_synonym_map
from get_snapshot_path import get_snapshot_path
from parse_affixes_from_cell import canonicalize_affix_name
from read_json import read_json
from write_json import write_json
import json

FILIGREE_TYPE = 'Filigree'
FILIGREE_SET_TYPE = 'Filigree Set'
BOOL_TYPE = 'Bool'
EVENT_GENERATION = 'event'
RAID_GENERATION_SUFFIX = ' raid'

FILIGREE_PAGE_FILE = 'Sentient_Weapon_Filigrees.html'
RAID_PAGE_FILE = 'Thread_of_Fate.html'

# Below these the page has probably changed layout; stop rather than ship a
# half-empty filigree list.
MIN_FILIGREES = 300
MIN_SETS = 50
MIN_RAID_FILIGREES = 15

COMPOUNDS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'filigree_compound_affixes.json')

# Filigree wording the shared synonym table doesn't cover, mapped onto the
# planner's affix names. Kept here rather than in affix_synonyms.json so the
# item parsers' output doesn't move.
FILIGREE_AFFIX_NAMES = {
    'Universal SP': 'Universal Spell Power',
    'Spell Power': 'Universal Spell Power',
    'Spell Crit Chance': 'Universal Spell Lore',
    'Universal Spell Crit Damage': 'Universal Spell Critical Damage',
    'Spell Critical Damage': 'Universal Spell Critical Damage',
    'Cold Spell Crit Damage': 'Ice Intensity',
    'Light Spell Critical Damage': 'Radiance Intensity',
    'Positive Spell Crit Damage': 'Healing Intensity',
    'Sonic Spell Crit Damage': 'Sonic Intensity',
    'Poison Spell Critical Damage': 'Void Intensity',
    'Spell Points': 'Wizardry',
    'Maximum Spellpoints': 'Wizardry',
    'Fortitude Saving Throws': 'Fortitude Save',
    'Reflex Saving Throws': 'Reflex Save',
    'Will Saving Throws': 'Will Save',
    'all Saving Throws': 'Resistance',
    'saving throws versus Poison': 'Saves vs. Poison',
    'Saving Throws Vs Traps': 'Saves vs. Traps',
    'All DC': 'Spell Focus Mastery',
    'Spell DC': 'Spell Focus Mastery',
    'the DCs of all spells': 'Spell Focus Mastery',
    'DC for Enchantment spells': 'Enchantment Focus',
    'Enchantment DC': 'Enchantment Focus',
    'DCs of Necromancy Spells': 'Necromancy Focus',
    'the DC of Assassinate': 'Assassinate',
    'Stunning DC': 'Stunning',
    'Tactics DC': 'Tactical Abilities',
    'Runearm DC': 'Rune Arm DCs',
    'Runearm DCs': 'Rune Arm DCs',
    'Runearm Recharge Rate': 'Rune Arm Recharge Rate',
    'Electricity Absorption': 'Electric Absorption',
    'Negative Absorption': 'Negative Energy Absorption',
    'Threat on Melee Attacks': 'Incite',
    'Threat Increase on Melee Attacks': 'Incite',
    'Chance to Deflect Missiles': 'Missile Deflection',
    'Critical Confirmation and Damage': 'Seeker',
    'Positive, Negative and Repair Amplification': 'each Amplification',
    'Strikethrough': 'Strikethrough Chance',
    'Imbue die': 'Imbue Dice',
    'Pact Die': 'Power in Pact',
    'Bardic Inspiration Charges': 'Bard Song Charge',
    'Turn Undead Charges': 'Turn Undead Charge',
    'Turn Undead Max Charges': 'Turn Undead Charge',
    'Turn Undead Max Dice': 'Turn Undead Maximum Dice',
    'Turn Undead Total Hit Dice': 'Turn Undead Hit Dice',
    'Uses of Wild Empathy': 'Wild Empathy Uses',
    'Caster Level with Arcane Spells': 'Arcane Caster Levels',
    'Caster Level with Positive Spells': 'Positive Caster Levels',
    'caster levels with healing spells': 'Healing Caster Levels',
    'Spell Cooldowns': 'Spell Cooldown Reduction',
    'increased chance for miss with Displacement': 'Displacement Miss Chance',
    'sonic Spell Power': 'Sonic Spell Power',
    'Death Block': 'Deathblock',
    'Permanent Feather Fall': 'Feather Falling',
    'Gain the effects of True Seeing': 'True Seeing',
    'Permanent Haste spell': 'Permanent Haste',
}
_FILIGREE_AFFIX_NAMES_CI = {k.casefold(): v for k, v in FILIGREE_AFFIX_NAMES.items()}

# Reductions the wiki writes as negatives ("-5% Spell Cooldowns"); the planner
# compares bigger as better, so they're stored positive.
POSITIVE_REDUCTIONS = {'Arcane Casting Dexterity', 'Spell Cooldown Reduction'}

# "+1d6 Sneak Attack damage"
SNEAK_ATTACK_DICE = re.compile(r'^\+?(\d+)d6 Sneak Attack damage$', re.IGNORECASE)
# "Cold Mastery: Gain 50 Cold Spell Power" -> "50 Cold Spell Power"
GAIN_PREFIX = re.compile(r'^\w+ Mastery:\s*Gain\s+(?=[+-]?\d)')
# A numeric effect names a stat; anything longer or with a sentence in it is a
# described effect ("gain +50 Melee Power for 10 seconds when ...") and stays text.
MAX_STAT_NAME_LENGTH = 50
DESCRIPTIVE = re.compile(r'[.\[\]\d]| for | when | per ', re.IGNORECASE)
# Trailing remarks that aren't effects of their own.
REMARK = re.compile(r'^(Stacks with|This may only)', re.IGNORECASE)

NUMBER = r'[+-]?\d+(?:\.\d+)?%?'
# "Constitution +1", "PRR +4", "Movement Speed +5% (Enhancement bonus)"
NAME_THEN_VALUE = re.compile(r'^(?P<name>[^+\d][^+]*?)\s*(?P<value>' + NUMBER + r')\s*(?:\((?P<note>[^)]*)\))?\.?$')
# "+6 PRR", "+10% Fortification Bypass", "+2 to all Saving Throws", "50 Spell Points"
VALUE_THEN_NAME = re.compile(r'^(?P<value>' + NUMBER + r')\s+(?:to\s+)?(?P<name>[^\d].*?)\.?$')
PIECES = re.compile(r'^\s*(\d+)\s+pieces?\s*:\s*(.*)$', re.IGNORECASE | re.DOTALL)


def _text(tag):
    """Visible text, without the asides (<small>, <i>, footnotes) the wiki adds to effects."""
    if hasattr(tag, 'find_all'):
        tag = BeautifulSoup(str(tag), 'html.parser')
        for aside in tag.find_all(['small', 'i', 'sup', 'style']):
            aside.decompose()
    return re.sub(r'\s+', ' ', tag.get_text(' ', strip=True)).replace(' :', ':').replace(' ,', ',').replace(' .', '.').strip()


def _load_compounds():
    with open(COMPOUNDS_PATH, 'r', encoding='utf8') as fh:
        return json.load(fh)


def _number(value):
    number = value.rstrip('%').lstrip('+')
    return int(number) if re.fullmatch(r'-?\d+', number) else float(number)


def parse_effect_text(text, bonus_type, synonyms=None, compounds=None):
    """One wiki effect -> affixes. Returns [] for an empty effect ("—")."""
    synonyms = synonyms if synonyms is not None else get_inverted_synonym_map()
    compounds = compounds if compounds is not None else _load_compounds()

    text = re.sub(r'\s+', ' ', text).strip()
    if not text or text in ('—', '-', '–'):
        return []

    affixes = []
    for affix in _raw_affixes(text, bonus_type, compounds):
        for part in expand_single_affix(affix, compounds):
            part['type'] = affix['type']
            part['name'] = _canonical_name(part['name'], synonyms)
            if part['name'] in POSITIVE_REDUCTIONS and isinstance(part['value'], (int, float)):
                part['value'] = abs(part['value'])
            affixes.append(part)
    return affixes


def _numeric_affix(text, bonus_type, compounds=None):
    text = GAIN_PREFIX.sub('', text.strip().rstrip('.'))
    dice = SNEAK_ATTACK_DICE.match(text)
    if dice:
        return {'name': 'Sneak Attack Dice', 'type': bonus_type, 'value': int(dice.group(1))}
    match = NAME_THEN_VALUE.match(text) or VALUE_THEN_NAME.match(text)
    if not match:
        return None
    name = match.group('name').strip().rstrip(':').strip()
    known = name.casefold() in _FILIGREE_AFFIX_NAMES_CI or name in (compounds or {})
    if not known and (len(name) > MAX_STAT_NAME_LENGTH or DESCRIPTIVE.search(name)):
        return None
    return {'name': name, 'type': bonus_type, 'value': _number(match.group('value'))}


def _raw_affixes(text, bonus_type, compounds):
    """Numeric effects as name/value; anything else keeps its wording, as a flag.

    A numeric first sentence followed by more ("Cold Mastery: Gain 50 Cold Spell
    Power. +1 Imbue Dice") is read a sentence at a time."""
    whole = _numeric_affix(text, bonus_type, compounds)
    if whole:
        return [whole]
    sentences = [s for s in re.split(r'(?<=\.)\s+', text) if s.strip()]
    if len(sentences) > 1 and _numeric_affix(sentences[0], bonus_type, compounds):
        out = []
        for sentence in sentences:
            if REMARK.match(sentence):
                continue
            out.append(_numeric_affix(sentence, bonus_type, compounds) or _flag_affix(sentence, bonus_type))
        return out
    return [_flag_affix(text, bonus_type)]


def _flag_affix(text, _bonus_type):
    name = text.strip().lstrip('+').strip().rstrip('.').strip()
    return {'name': _immunity_name(name), 'type': BOOL_TYPE, 'value': 1}


def _immunity_name(name):
    """'Immune to knockdown', 'You are Immune to X', 'Energy Drain Immunity' -> 'Immunity to X'."""
    match = re.fullmatch(r'(?:You are\s+)?immune to (?:most forms of )?(?:the )?(.+?)(?: spell)?', name, re.IGNORECASE)
    if not match:
        match = re.fullmatch(r'(.+?) Immunity', name)
    if not match:
        return name
    subject = match.group(1)
    if ' and ' in subject:
        return name  # split by filigree_compound_affixes.json
    return 'Immunity to ' + ' '.join(w if w.isupper() else w[:1].upper() + w[1:] for w in subject.split())


def _canonical_name(name, synonyms):
    name = _FILIGREE_AFFIX_NAMES_CI.get(name.casefold(), name)
    name = synonyms.get(name, name)
    name = _FILIGREE_AFFIX_NAMES_CI.get(name.casefold(), name)
    return canonicalize_affix_name(name)


def parse_set_bonus_cell(cell, synonyms=None, compounds=None):
    """The set bonus column -> [{threshold, affixes}], thresholds cumulative as listed."""
    items = cell.find_all('li') or [cell]
    bonuses = []
    for item in items:
        match = PIECES.match(_text(item))
        if not match:
            continue
        threshold = int(match.group(1))
        affixes = []
        for effect in _split_set_effects(match.group(2)):
            affixes.extend(parse_effect_text(effect, FILIGREE_SET_TYPE, synonyms, compounds))
        bonuses.append({'threshold': threshold, 'affixes': affixes})
    return bonuses


def _split_set_effects(text):
    # "+5 Melee Power, +5 Ranged Power" lists two effects; a comma inside a
    # sentence ("When you ..., gain ...") doesn't, so split only before a number.
    text = text.strip()
    parts = re.split(r',\s*(?=[+-]?\d)', text)
    if len(parts) > 1 and all(VALUE_THEN_NAME.match(p.strip().rstrip('.')) for p in parts):
        return [p.strip() for p in parts]
    return [text]


def get_filigree_table_rows(soup):
    """The filigree list -> [{generation, set, name, effect, rare, setBonusCell}], rowspans resolved."""
    content = soup.find(id='mw-content-text') or soup
    table = content.find('table', class_=lambda c: c and 'wikitable' in c and 'searchable' in c)
    if table is None:
        raise RuntimeError('No filigree list table on the Filigrees page; the wiki layout has changed.')

    rows = table.find_all('tr')
    headers = [_text(c) for c in rows[0].find_all(['th', 'td'])]
    expected = ['Generation', 'Set', 'Name', 'Effect', 'Rare bonus effect', 'Set bonus']
    if headers != expected:
        raise RuntimeError(f'Filigree table headers changed: {headers}, expected {expected}')

    out = []
    carried = {}  # column index -> [cell, rows left]
    for row in rows[1:]:
        cells = iter(row.find_all(['th', 'td'], recursive=False))
        resolved = []
        for idx in range(len(expected)):
            if idx in carried:
                cell, left = carried[idx]
                resolved.append(cell)
                if left <= 1:
                    del carried[idx]
                else:
                    carried[idx] = [cell, left - 1]
                continue
            cell = next(cells)
            span = int(cell.get('rowspan', 1))
            if span > 1:
                carried[idx] = [cell, span - 1]
            resolved.append(cell)
        generation, set_cell, name, effect, rare, set_bonus = resolved
        out.append({
            'generation': _text(generation),
            'set': _text(set_cell),
            'name': _text(name),
            'effect': _text(effect),
            'rare': _text(rare),
            'setBonusCell': set_bonus,
        })
    return out


def _set_name(text):
    """'Deadly Rain (Rare)' -> ('Deadly Rain', True)."""
    match = re.fullmatch(r'(.*?)\s*\(Rare\)', text)
    return (match.group(1), True) if match else (text, False)


def _generation_key(text):
    return text if re.fullmatch(r'\d+', text) else EVENT_GENERATION


def get_generation_packs(soup, pack_aliases):
    """The Generations section's lists -> {"1": [pack, ...], ...}."""
    content = soup.find(id='mw-content-text') or soup
    anchor = content.find(id='Generations')
    heading = anchor.find_parent(['h2', 'h3']) if anchor else None
    if heading is None:
        raise RuntimeError('No Generations section on the Filigrees page.')

    generations = {}
    for el in heading.find_next_siblings():
        if el.name in ('h2', 'h3'):
            break
        if el.name != 'ul':
            continue
        for item in el.find_all('li', recursive=False):
            label = item.find('a')
            match = re.search(r'Generation\s+(\d+)', _text(label) if label else '')
            sublist = item.find('ul')
            if not match or sublist is None:
                continue
            packs = []
            for pack_item in sublist.find_all('li', recursive=False):
                link = pack_item.find('a')
                if link is None:
                    continue
                pack = pack_aliases.get(_text(link), _text(link))
                if pack not in packs:
                    packs.append(pack)
            generations[match.group(1)] = packs
    if not generations:
        raise RuntimeError('No generation pack lists found on the Filigrees page.')
    return generations


def get_raid_filigrees(soup):
    """Thread of Fate's Double filigrees tables -> [{name, sets, generation, effect, rare}]."""
    content = soup.find(id='mw-content-text') or soup
    out = []
    for anchor in content.find_all(id=re.compile(r'^Generation_\d+_Raid_Filigrees$')):
        generation = re.search(r'\d+', anchor['id']).group(0)
        heading = anchor.find_parent(['h3', 'h4', 'h5']) or anchor
        table = heading.find_next('table')
        for row in table.find_all('tr')[1:]:
            cells = row.find_all('td', recursive=False)
            if len(cells) != 3:
                continue
            sets = [_text(popup.find('a')) for popup in cells[0].find_all('span', class_='has_tooltip', recursive=False)]
            if len(sets) != 2:
                raise RuntimeError(f'Raid filigree row without two sets: {_text(cells[0])[:80]}')
            out.append({
                'name': ' / '.join(sets),
                'sets': sets,
                'generation': generation + RAID_GENERATION_SUFFIX,
                'effect': _text(cells[1]),
                'rare': _text(cells[2]),
            })
    return out


def build_filigree_data(filigree_soup, raid_soup, pack_aliases, synonyms=None, compounds=None):
    synonyms = synonyms if synonyms is not None else get_inverted_synonym_map()
    compounds = compounds if compounds is not None else _load_compounds()

    filigrees = {}
    sets = {}
    for row in get_filigree_table_rows(filigree_soup):
        set_name, rare_set = _set_name(row['set'])
        if set_name not in sets:
            sets[set_name] = {
                'rare': rare_set,
                'bonuses': parse_set_bonus_cell(row['setBonusCell'], synonyms, compounds),
            }
        filigrees[row['name']] = {
            'sets': [set_name],
            'generation': _generation_key(row['generation']),
            'affixes': parse_effect_text(row['effect'], FILIGREE_TYPE, synonyms, compounds),
            'rareAffixes': parse_effect_text(row['rare'], FILIGREE_TYPE, synonyms, compounds),
        }

    raid = get_raid_filigrees(raid_soup)
    for row in raid:
        unknown = [s for s in row['sets'] if s not in sets]
        if unknown:
            raise RuntimeError(f'Raid filigree {row["name"]} names unknown sets {unknown}')
        filigrees[row['name']] = {
            'sets': row['sets'],
            'generation': row['generation'],
            'affixes': parse_effect_text(row['effect'], FILIGREE_TYPE, synonyms, compounds),
            'rareAffixes': parse_effect_text(row['rare'], FILIGREE_TYPE, synonyms, compounds),
        }

    generations = {gen: {'packs': packs} for gen, packs in get_generation_packs(filigree_soup, pack_aliases).items()}
    for gen in sorted({f['generation'] for f in filigrees.values() if f['generation'].endswith(RAID_GENERATION_SUFFIX)}):
        generations[gen] = {'packs': [], 'source': 'Thread of Fate'}
    if any(f['generation'] == EVENT_GENERATION for f in filigrees.values()):
        generations[EVENT_GENERATION] = {'packs': ['Events']}

    check_filigree_data(filigrees, sets, len(raid))
    return {'filigrees': filigrees, 'sets': sets, 'generations': generations}


def check_filigree_data(filigrees, sets, raid_count):
    if len(filigrees) - raid_count < MIN_FILIGREES or len(sets) < MIN_SETS or raid_count < MIN_RAID_FILIGREES:
        raise RuntimeError(
            f'Only {len(filigrees) - raid_count} filigrees, {len(sets)} sets and {raid_count} raid filigrees parsed '
            f'(expected at least {MIN_FILIGREES}, {MIN_SETS}, {MIN_RAID_FILIGREES}); the wiki layout has probably changed.')
    empty = [name for name, f in filigrees.items() if not f['affixes']]
    if empty:
        raise RuntimeError(f'Filigrees with no effect parsed: {empty[:10]}')


def _read_soup(file_name):
    with open(get_snapshot_path('filigree', file_name), 'r', encoding='utf8') as fh:
        return BeautifulSoup(fh.read(), 'html.parser')


def get_pack_aliases():
    """Wiki pack/area page titles -> the pack names quests.json uses (e.g. The Land of Barovia)."""
    quests = read_json('quests')
    packs = set(quests['officialPacks']) | set(quests['packs'].values())
    return {area: pack for area, pack in quests['packs'].items() if area not in packs}


def parse_filigree():
    data = build_filigree_data(_read_soup(FILIGREE_PAGE_FILE), _read_soup(RAID_PAGE_FILE), get_pack_aliases())
    write_json(data, 'filigree')


if __name__ == '__main__':
    parse_filigree()
