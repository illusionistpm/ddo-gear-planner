import pytest
from bs4 import BeautifulSoup

import parse_filigree as module
from parse_filigree import (
    FILIGREE_SET_TYPE,
    FILIGREE_TYPE,
    build_filigree_data,
    get_filigree_table_rows,
    get_generation_packs,
    get_raid_filigrees,
    parse_effect_text,
    parse_set_bonus_cell,
)

SYNONYMS = {'prr': 'Physical Sheltering', 'mrr': 'Magical Sheltering'}


class CaseInsensitive(dict):
    def get(self, key, default=None):
        return super().get(key.casefold(), default)


def effect(text, bonus_type=FILIGREE_TYPE):
    return parse_effect_text(text, bonus_type, CaseInsensitive(SYNONYMS), module._load_compounds())


@pytest.mark.parametrize('text, expected', [
    ('Constitution +1', [('Constitution', 1)]),
    ('+6 PRR', [('Physical Sheltering', 6)]),
    ('MRR +4', [('Magical Sheltering', 4)]),
    ('+10% Fortification Bypass', [('Fortification Bypass', 10)]),
    ('+2 to all Saving Throws', [('Resistance', 2)]),
    ('50 Spell Points', [('Wizardry', 50)]),
    ('Hit and Damage +1', [('Accuracy', 1), ('Deadly', 1)]),
    ('+5 Melee and Ranged Power', [('Melee Power', 5), ('Ranged Power', 5)]),
    ('+1% Dodge and Maximum Dodge', [('Dodge', 1), ('Dodge Cap', 1)]),
    ('-5% Spell Cooldowns', [('Spell Cooldown Reduction', 5)]),
    ('+1d6 Sneak Attack damage', [('Sneak Attack Dice', 1)]),
    ('Cold Mastery: Gain 50 Cold Spell Power. +1 Imbue Dice', [('Cold Spell Power', 50), ('Imbue Dice', 1)]),
    ('+5% Displacement. Stacks with other sources.', [('Displacement', 5)]),
])
def test_numeric_effects_become_named_affixes(text, expected):
    assert [(a['name'], a['value']) for a in effect(text)] == expected
    assert all(a['type'] == FILIGREE_TYPE for a in effect(text))


def test_arcane_spell_failure_is_arcane_casting_dexterity_stored_positive():
    from get_inverted_synonym_map import get_inverted_synonym_map

    affixes = parse_effect_text('-10% Arcane Spell Failure', FILIGREE_TYPE, get_inverted_synonym_map(), module._load_compounds())

    assert [(a['name'], a['value']) for a in affixes] == [('Arcane Casting Dexterity', 10)]


@pytest.mark.parametrize('text, expected', [
    ('Death Block', ['Deathblock']),
    ('Immune to knockdown', ['Immunity to Knockdown']),
    ('You are Immune to Petrification', ['Immunity to Petrification']),
    ('Energy Drain Immunity', ['Immunity to Energy Drain']),
    ('You are immune to most forms of the Slow spell', ['Immunity to Slow']),
    ('Immune to Mummy Rot and Natural Diseases', ['Immunity to Mummy Rot', 'Immunity to Natural Diseases']),
    ('Gain +50 Melee Power for 10 seconds when an action boost is used.',
     ['Gain +50 Melee Power for 10 seconds when an action boost is used']),
])
def test_text_effects_become_flags(text, expected):
    affixes = effect(text)
    assert [a['name'] for a in affixes] == expected
    assert all(a['value'] == 1 and a['type'] == 'Bool' for a in affixes)


@pytest.mark.parametrize('text', ['', '—', '-'])
def test_empty_effects_have_no_affixes(text):
    assert effect(text) == []


def test_set_bonus_cell_lists_each_threshold_without_asides():
    cell = BeautifulSoup('''<td><ul>
        <li>2 Pieces: +2 Doublestrike and Doubleshot</li>
        <li>3 Pieces: Permanent Haste spell <small>Attack speed only.</small></li>
        <li>4 Pieces: +5 Melee Power, +5 Ranged Power</li>
    </ul></td>''', 'html.parser').td

    bonuses = parse_set_bonus_cell(cell, CaseInsensitive(SYNONYMS), module._load_compounds())

    assert [(b['threshold'], [(a['name'], a['value']) for a in b['affixes']]) for b in bonuses] == [
        (2, [('Doublestrike', 2), ('Doubleshot', 2)]),
        (3, [('Permanent Haste', 1)]),
        (4, [('Melee Power', 5), ('Ranged Power', 5)]),
    ]
    assert [a['type'] for b in bonuses for a in b['affixes']] == [
        FILIGREE_SET_TYPE, FILIGREE_SET_TYPE, 'Bool', FILIGREE_SET_TYPE, FILIGREE_SET_TYPE]


FILIGREE_PAGE = '''<div id="mw-content-text">
<h2><span id="Generations">Generations</span></h2>
<p>Each generation drops in these packs.</p>
<ul>
  <li><a href="#Generation_1">Generation 1</a><ul>
    <li><a href="/page/Mists_of_Ravenloft">Mists of Ravenloft</a> (including <a href="/page/The_Land_of_Barovia">the Land of Barovia</a>)</li>
    <li><a href="/page/The_Land_of_Barovia">The Land of Barovia</a></li>
  </ul></li>
</ul>
<h2><span id="Filigree_list">Filigree list</span></h2>
<table class="mw-collapsible searchable sticky-header wikitable">
<tr><th>Generation</th><th>Set</th><th>Name</th><th>Effect</th><th>Rare bonus effect</th><th>Set bonus</th></tr>
<tr><th rowspan="2">1</th><th rowspan="2">Celerity</th><td>Celerity: Dexterity</td><td>Dexterity +1</td><td>PRR +2</td>
    <td rowspan="2"><ul><li>2 Pieces: +2 Doublestrike</li></ul></td></tr>
<tr><td>Celerity: Wisdom</td><td>Wisdom +1</td><td>—</td></tr>
<tr><th rowspan="1">—</th><th rowspan="1">Zephyr (Rare)</th><td>Zephyr: Tumble</td><td>Tumble +2</td><td>MRR +2</td>
    <td><ul><li>2 Pieces: +5 MRR</li></ul></td></tr>
</table></div>'''

RAID_PAGE = '''<div id="mw-content-text">
<h4><span id="Generation_1_Raid_Filigrees">Generation 1 Raid Filigrees</span></h4>
<table class="wikitable sortable">
<tr><th>Name</th><th>Effect</th><th>Rare bonus effect</th></tr>
<tr><td><span class="popup has_tooltip"><a href="#">Celerity</a><span class="popup tooltip">Celerity: 2 Pieces</span></span> /
        <span class="popup has_tooltip"><a href="#">Zephyr</a><span class="popup tooltip">Zephyr: 2 Pieces</span></span></td>
    <td>+2 Wisdom</td><td>+4 MRR</td></tr>
</table></div>'''


def soup(html):
    return BeautifulSoup(html, 'html.parser')


def test_table_rows_carry_rowspanned_generation_set_and_bonus():
    rows = get_filigree_table_rows(soup(FILIGREE_PAGE))

    assert [(r['generation'], r['set'], r['name']) for r in rows] == [
        ('1', 'Celerity', 'Celerity: Dexterity'),
        ('1', 'Celerity', 'Celerity: Wisdom'),
        ('—', 'Zephyr (Rare)', 'Zephyr: Tumble'),
    ]
    assert rows[0]['setBonusCell'] is rows[1]['setBonusCell']


def test_generation_packs_resolve_areas_to_their_pack_once():
    assert get_generation_packs(soup(FILIGREE_PAGE), {'the Land of Barovia': 'Mists of Ravenloft',
                                                      'The Land of Barovia': 'Mists of Ravenloft'}) == {
        '1': ['Mists of Ravenloft'],
    }


def test_raid_filigrees_belong_to_both_sets():
    assert get_raid_filigrees(soup(RAID_PAGE)) == [{
        'name': 'Celerity / Zephyr',
        'sets': ['Celerity', 'Zephyr'],
        'generation': '1 raid',
        'effect': '+2 Wisdom',
        'rare': '+4 MRR',
    }]


def test_build_filigree_data_shape(monkeypatch):
    monkeypatch.setattr(module, 'check_filigree_data', lambda *args: None)

    data = build_filigree_data(soup(FILIGREE_PAGE), soup(RAID_PAGE), {}, CaseInsensitive(SYNONYMS))

    assert data['filigrees']['Celerity: Dexterity'] == {
        'sets': ['Celerity'],
        'generation': '1',
        'affixes': [{'name': 'Dexterity', 'type': FILIGREE_TYPE, 'value': 1}],
        'rareAffixes': [{'name': 'Physical Sheltering', 'type': FILIGREE_TYPE, 'value': 2}],
    }
    assert data['filigrees']['Celerity: Wisdom']['rareAffixes'] == []
    assert data['filigrees']['Zephyr: Tumble']['generation'] == 'event'
    assert data['filigrees']['Celerity / Zephyr']['sets'] == ['Celerity', 'Zephyr']
    assert data['sets']['Zephyr'] == {
        'rare': True,
        'bonuses': [{'threshold': 2, 'affixes': [{'name': 'Magical Sheltering', 'type': FILIGREE_SET_TYPE, 'value': 5}]}],
    }
    assert data['generations'] == {
        '1': {'packs': ['Mists of Ravenloft', 'The Land of Barovia']},
        '1 raid': {'packs': [], 'source': 'Thread of Fate'},
        'event': {'packs': ['Events']},
    }


def test_raid_filigree_naming_an_unknown_set_fails(monkeypatch):
    monkeypatch.setattr(module, 'check_filigree_data', lambda *args: None)
    raid = RAID_PAGE.replace('>Zephyr<', '>Nonesuch<')

    with pytest.raises(RuntimeError, match='unknown sets'):
        build_filigree_data(soup(FILIGREE_PAGE), soup(raid), {}, CaseInsensitive(SYNONYMS))


def test_changed_table_headers_fail_loudly():
    with pytest.raises(RuntimeError, match='headers changed'):
        get_filigree_table_rows(soup(FILIGREE_PAGE.replace('Rare bonus effect', 'Rare effect')))


def test_too_few_filigrees_fails():
    with pytest.raises(RuntimeError, match='layout has probably changed'):
        module.check_filigree_data({'A: B': {'affixes': [{}]}}, {'A': {}}, 0)
