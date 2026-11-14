"""Mythic Boosts, Reaper bonuses and Curses: bonuses a player's copy of an item
can carry on top of its fixed affixes (issue #266).

Writes data/item-bonuses.json:

    {
        "curses": [{"name", "affixes"}, ...],         # every slot but Quiver
        "mythic": {"<slot>": [{"name", "affixes"}]},
        "reaper": {"<slot>": [{"name", "affixes"}]},
    }

Every curse on the wiki is kept, including those whose effect the planner can't
express as affixes: they are options with no affixes, for players who know what
they do. Purely cosmetic parts of an effect are dropped.
"""
import re

from bs4 import BeautifulSoup

from get_inverted_synonym_map import get_inverted_synonym_map
from get_snapshot_path import get_snapshot_path
from write_json import write_json

CURSES_PAGE = get_snapshot_path('item_bonuses', 'Deck_of_Many_Curses.html')
REAPER_PAGE = get_snapshot_path('item_bonuses', 'Reaper_bonus.html')
MYTHIC_PAGE = get_snapshot_path('item_bonuses', 'Mythic_Boost.html')

# Every equipment slot but Quiver, which can't take any of these bonuses.
ITEM_SLOTS = ['Weapon', 'Offhand', 'Armor', 'Belt', 'Boots', 'Bracers', 'Cloak',
              'Gloves', 'Goggles', 'Helm', 'Necklace', 'Ring', 'Trinket']

CURSE_TYPE = 'Fortune'
REAPER_TYPE = 'Reaper'
MYTHIC_TYPE = 'Mythic'

# Bonus targets as the wiki words them, lowercased, to the planner's affixes.
# A "%" suffix matches only a percentage bonus. Targets the synonym map already
# knows (PRR, MRR Cap, Spell Penetration, ...) need no entry.
TARGET_AFFIXES = {
    'strength': ['Strength'],
    'dexterity': ['Dexterity'],
    'constitution': ['Constitution'],
    'intelligence': ['Intelligence'],
    'wisdom': ['Wisdom'],
    'charisma': ['Charisma'],
    'all ability scores': ['Well Rounded'],
    'attack': ['Accuracy'],
    'damage': ['Deadly'],
    'saves': ['Resistance'],
    'fortitude saving throws': ['Fortitude Save'],
    'reflex saving throws': ['Reflex Save'],
    'will saving throws': ['Will Save'],
    'saves vs. spells': ['Spell Saves'],
    'physical resistance rating': ['Physical Sheltering'],
    'magical resistance rating': ['Magical Sheltering'],
    'mrr': ['Magical Sheltering'],
    'prr/mrr': ['Physical Sheltering', 'Magical Sheltering'],
    'melee power': ['Melee Power'],
    'ranged power': ['Ranged Power'],
    'melee / ranged power': ['Melee Power', 'Ranged Power'],
    'melee, ranged and spell power': ['Melee Power', 'Ranged Power', 'Universal Spell Power'],
    'melee/ranged/spell power': ['Melee Power', 'Ranged Power', 'Universal Spell Power'],
    'universal spell power': ['Universal Spell Power'],
    'spell, tactical, and assassinate dcs': ['Spell Focus Mastery', 'Combat Mastery', 'Assassinate'],
    'tactical feat dcs': ['Combat Mastery'],
    'assassinate dcs': ['Assassinate'],
    'breath attack dcs': ['Breath Weapon Focus'],
    'rune arm dcs': ['Rune Arm DCs'],
    'abjuration dcs': ['Abjuration Focus'],
    'conjuration dcs': ['Conjuration Focus'],
    'enchantment dcs': ['Enchantment Focus'],
    'evocation dcs': ['Evocation Focus'],
    'illusion dcs': ['Illusion Focus'],
    'necromancy dcs': ['Necromancy Focus'],
    'transmutation dcs': ['Transmutation Focus'],
    'sneak attack dice': ['Sneak Attack Dice'],
    'spell penetration': ['Spell Penetration'],
    'imbue dice': ['Imbue Dice'],
    'all skills': ['All Skills'],
    'search': ['Search'],
    'spot': ['Spot'],
    'open lock': ['Open Lock'],
    'disable device': ['Disable Device'],
    'hide': ['Hide'],
    'move silently': ['Move Silently'],
    'spellcraft': ['Spellcraft'],
    'concentration': ['Concentration'],
    'heal': ['Heal'],
    'repair': ['Repair'],
    'bluff': ['Bluff'],
    'intimidate': ['Intimidate'],
    'perform': ['Perform'],
    'swim': ['Swim'],
    'dodge': ['Dodge'],
    'dodge cap': ['Dodge Cap'],
    'dodge bypass': ['Dodge Bypass'],
    'fortification': ['Fortification'],
    'hit points': ['False Life'],
    'maximum hit points%': ['False Life (%)'],
    'ac%': ['Armor Class (%)'],
    'armor class%': ['Armor Class (%)'],
    'spell cost reduction%': ['Magical Efficiency'],
    'spell crit damage%': ['Spell Critical Damage'],
    'critical confirmation and critical damage': ['Seeker'],
    'damage vs. helpless targets%': ['Damage vs. the Helpless'],
    'strikethrough%': ['Strikethrough'],
    'offhand strike chance%': ['Offhand Strike Chance'],
    'doublestrike': ['Doublestrike'],
    'doubleshot': ['Doubleshot'],
    'maximum dexterity bonus of equipped armor': ['Max Dex Bonus'],
    'rune arm charge rate%': ['Rune Arm Charge Rate'],
    'repair amplification': ['Repair Amplification'],
    'acid, cold, and electricity absorption%': ['Acid Absorption', 'Cold Absorption', 'Electric Absorption'],
    'acid spell power': ['Acid Spell Power'],
    'acid absorption%': ['Acid Absorption'],
    'acid resistance': ['Acid Resistance'],
    'electric spell power': ['Electric Spell Power'],
    'electric absorption%': ['Electric Absorption'],
    'electric resistance': ['Electric Resistance'],
    'cold spell power': ['Cold Spell Power'],
    'cold absorption%': ['Cold Absorption'],
    'cold resistance': ['Cold Resistance'],
    'fire spell power': ['Fire Spell Power'],
    'fire absorption%': ['Fire Absorption'],
    'fire resistance': ['Fire Resistance'],
}

# Bonuses the wiki gives without a bonus type that the planner tracks as untyped.
UNTYPED_TARGETS = {
    'bard song': 'Bard Song Charge',
}

# Effects with no number, which the planner tracks as on/off.
FLAG_AFFIXES = {
    'deathblock': 'Deathblock',
    'ghost touch': 'Ghost Touch',
    'feather falling': 'Feather Falling',
    'fear immunity': 'Immunity to Fear',
    'true seeing': 'True Seeing',
    'water breathing': 'Water Breathing',
    'if the item is a weapon, it is always considered a favored weapon': 'Favored Weapon',
}

# Parts of an effect with no bearing on a build.
IGNORED_EFFECTS = {
    'cosmetic butterflies',
    'cosmetic fireflies',
}

# "+2 Fortune Bonus to X", "+1 to Y", "+1 Bard Song": a signed number, then
# what it applies to, up to the next signed number.
BONUS_CLAUSE = re.compile(
    r'([+-]\d+)(%?)\s+(?:(?:\w+\s+)?[Bb]onus\s+)?(?:to\s+)?(.+?)(?=,?\s*(?:and\s+)?[+-]\d|$)')
# A sentence end, but not the one in "vs. Spells".
SENTENCE_END = re.compile(r'(?<!vs)\.(?:\s+|$)')
LIST_SEPARATOR = re.compile(r',\s*(?:and\s+)?|\s+and\s+')


def cleanup_text(text):
    text = re.sub(r'\s+', ' ', text.replace('\xa0', ' ')).strip()
    return re.sub(r'\s+([,.])', r'\1', text)


def _affix(name, bonus_type, value):
    return {'name': name, 'type': bonus_type, 'value': str(value)}


def _flag(name):
    return {'name': name, 'type': 'Bool', 'value': 1}


def _map_target(target, value, percent, bonus_type, synonyms):
    """Affixes for one bonus target, or None when the planner has no affix for it."""
    key = target.lower()
    if key in UNTYPED_TARGETS:
        return [_affix(UNTYPED_TARGETS[key], 'Untyped', value)]

    names = (TARGET_AFFIXES.get(key + '%') if percent else None) or TARGET_AFFIXES.get(key)
    if names is None and target in synonyms:
        names = [synonyms[target]]
    if names is None:
        return None
    return [_affix(name, bonus_type, value) for name in names]


def _parse_clause(target, value, percent, bonus_type, synonyms, unmapped):
    affixes = _map_target(target, value, percent, bonus_type, synonyms)
    if affixes is not None:
        return affixes

    # A list of targets the table doesn't know as a whole: "Strength, Dexterity,
    # and Constitution", "Swim, Water Breathing".
    affixes = []
    for part in LIST_SEPARATOR.split(target):
        part_affixes = _map_target(part, value, percent, bonus_type, synonyms)
        if part_affixes is not None:
            affixes += part_affixes
        else:
            affixes += _parse_flags(part, unmapped)
    return affixes


def _parse_flags(text, unmapped):
    key = text.lower()
    if key in FLAG_AFFIXES:
        return [_flag(FLAG_AFFIXES[key])]
    if key in IGNORED_EFFECTS:
        return []

    # A list of effects - "Feather Falling, Cosmetic Butterflies". A sentence
    # with a number in it ("worth 10,000 Sentient XP") is prose, not a list.
    parts = LIST_SEPARATOR.split(text)
    if len(parts) == 1 or re.search(r'\d', text):
        unmapped.append(text)
        return []
    affixes = []
    for part in parts:
        affixes += _parse_flags(part, unmapped)
    return affixes


def parse_effect(text, bonus_type, synonyms=None):
    """The affixes an effect grants, and the parts of it that grant none.

    A sentence that leads with a condition ("While under the effects of any
    Action Boost, you gain a +6 ...") grants nothing the planner can count, so
    it is unmapped whole rather than read as an unconditional bonus.
    """
    synonyms = get_inverted_synonym_map() if synonyms is None else synonyms
    affixes = []
    unmapped = []

    for sentence in SENTENCE_END.split(cleanup_text(text)):
        sentence = re.sub(r'^Additionally,\s*', '', sentence.strip())
        if not sentence:
            continue

        first_number = re.search(r'[+-]\d', sentence)
        if first_number is None:
            affixes += _parse_flags(sentence, unmapped)
            continue
        if first_number.start() > 0:
            unmapped.append(sentence)
            continue

        for clause in BONUS_CLAUSE.finditer(sentence):
            value, percent, target = clause.group(1), clause.group(2), clause.group(3).strip()
            affixes += _parse_clause(target, value.lstrip('+'), bool(percent), bonus_type, synonyms, unmapped)

    return affixes, unmapped


def _load_soup(path):
    with open(path, 'r', encoding='utf-8') as fh:
        return BeautifulSoup(fh.read(), 'html.parser')


def _find_curse_table(soup):
    for table in soup.find_all('table'):
        header = [cell.get_text(strip=True) for cell in table.find('tr').find_all(['th', 'td'])]
        if header[:2] == ['Curse', 'Effect']:
            return table
    raise ValueError('Unable to find the curse table on the Deck of Many Curses page')


def parse_curses(soup, synonyms=None):
    """Every curse, in page order, with the effects it has unmapped."""
    curses = []
    unmapped = {}
    for row in _find_curse_table(soup).find_all('tr')[1:]:
        cells = row.find_all('td')
        if len(cells) < 2:
            continue
        name = cleanup_text(cells[0].get_text(' '))
        affixes, missing = parse_effect(cells[1].get_text(' '), CURSE_TYPE, synonyms)
        curses.append({'name': name, 'affixes': affixes})
        if missing:
            unmapped[name] = missing
    return curses, unmapped


REAPER_SLOT_WORDS = {
    'Armor': 'Armor',
    'Belt': 'Belt',
    'Boots': 'Boots',
    'Bracers': 'Bracers',
    'Cloak': 'Cloak',
    'Gloves': 'Gloves',
    'Goggles': 'Goggles',
    'Helmet': 'Helm',
    'Necklace': 'Necklace',
    'Shield': 'Offhand',
}


def get_reaper_slots(label):
    """The slots a Reaper bonus can appear in, from its label; None if unrecognised."""
    if label.startswith('Reaper Enchantment:'):
        return list(ITEM_SLOTS)
    if re.fullmatch(r'Reaper Ring Boost \(\d+\)', label):
        return ['Ring']
    search = re.fullmatch(r'Reaper (\w+) Enchantment', label)
    if search and search.group(1) in REAPER_SLOT_WORDS:
        return [REAPER_SLOT_WORDS[search.group(1)]]
    return None


def parse_reaper_bonuses(soup, synonyms=None):
    """Reaper options per slot, plus the bonuses whose label or effect wasn't understood."""
    by_slot = {slot: [] for slot in ITEM_SLOTS}
    unmapped = {}
    content = soup.find(id='mw-content-text') or soup
    for item in content.find_all('li'):
        label_tag = item.find('b')
        if label_tag is None:
            continue
        label = cleanup_text(label_tag.get_text(' '))
        if not label.startswith('Reaper'):
            continue

        effect = cleanup_text(item.get_text(' ')[len(label_tag.get_text(' ')):]).lstrip(':').strip()
        affixes, missing = parse_effect(effect, REAPER_TYPE, synonyms)
        slots = get_reaper_slots(label)
        if slots is None:
            unmapped[label] = ['unrecognised slot']
            continue
        if missing:
            unmapped[label] = missing
        for slot in slots:
            by_slot[slot].append({'name': label, 'affixes': affixes})
    return by_slot, unmapped


# The Mythic Boost page states its rules in prose, so they are written out here.
# get_mythic_rule_warnings checks the page still says what they were taken from.
MYTHIC_POWER = ['Melee Power', 'Ranged Power', 'Universal Spell Power']
MYTHIC_DEFENSE = ['Physical Sheltering', 'Magical Sheltering']
MYTHIC_KINDS = {
    'Power': ('Melee/Ranged/Spell Power', MYTHIC_POWER),
    'Defense': ('PRR/MRR', MYTHIC_DEFENSE),
}
MYTHIC_RULES = {
    'Weapon': (['Power'], [2, 4]),
    'Armor': (['Defense'], [2, 4]),
    # Shields, orbs and rune arms: orbs and rune arms can take either boost.
    'Offhand': (['Power', 'Defense'], [2, 4]),
    'Belt': (['Power'], [1, 3]),
    'Gloves': (['Power'], [1, 3]),
    'Goggles': (['Power'], [1, 3]),
    'Ring': (['Power'], [1, 3]),
    'Trinket': (['Power'], [1, 3]),
    'Boots': (['Defense'], [1, 3]),
    'Bracers': (['Defense'], [1, 3]),
    'Cloak': (['Defense'], [1, 3]),
    'Helm': (['Defense'], [1, 3]),
    'Necklace': (['Defense'], [1, 3]),
}
MYTHIC_RULE_SENTENCES = [
    'Weapons, belts, gloves, goggles, rings, and trinkets grant Mythic bonus to Melee, Ranged, and Universal Spell Power.',
    'Armor, boots, bracers, cloaks, headwear, necklaces, shields grant Mythic bonus to Physical and Magical Resistance Rating.',
    'Orbs, rune arms, and collars can appear Shield and/or Weapon boost.',
    'Weapons, armor, shields can have +2 or +4 bonus, +4 is rarer.',
    'Clothing and jewelry can have +1 or +3 bonus, +3 is rarer.',
    'Unlike most bonus types, all sources of Mythic bonus stack.',
]


def build_mythic_options():
    by_slot = {}
    for slot in ITEM_SLOTS:
        kinds, values = MYTHIC_RULES[slot]
        options = []
        for value in values:
            for kind in kinds:
                label, names = MYTHIC_KINDS[kind]
                options.append({
                    'name': f'Mythic +{value} ({label})',
                    'affixes': [_affix(name, MYTHIC_TYPE, value) for name in names],
                })
        by_slot[slot] = options
    return by_slot


def get_mythic_rule_warnings(soup):
    """Rule sentences the Mythic Boost page no longer contains."""
    content = soup.find(id='mw-content-text') or soup
    page_text = cleanup_text(content.get_text(' '))
    return [sentence for sentence in MYTHIC_RULE_SENTENCES if sentence not in page_text]


def build_item_bonuses():
    """The item-bonuses data, and a warning for each thing the parser didn't understand."""
    synonyms = get_inverted_synonym_map()
    curses, unmapped_curses = parse_curses(_load_soup(CURSES_PAGE), synonyms)
    reaper, unmapped_reaper = parse_reaper_bonuses(_load_soup(REAPER_PAGE), synonyms)

    warnings = [f'Mythic Boost page no longer says: "{sentence}"'
                for sentence in get_mythic_rule_warnings(_load_soup(MYTHIC_PAGE))]
    warnings += [f'{label}: {"; ".join(missing)}' for label, missing in unmapped_reaper.items()]

    data = {
        'curses': curses,
        'mythic': build_mythic_options(),
        'reaper': reaper,
    }
    return data, unmapped_curses, warnings


def parse_item_bonuses():
    data, _, warnings = build_item_bonuses()
    write_json(data, 'item-bonuses')
    return warnings


if __name__ == '__main__':
    data, unmapped, warnings = build_item_bonuses()
    for name, missing in unmapped.items():
        print(f'{name}: {missing}')
    for warning in warnings:
        print('WARNING', warning)
