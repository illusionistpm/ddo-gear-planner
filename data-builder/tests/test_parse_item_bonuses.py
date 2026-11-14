import json
import os

import pytest
from bs4 import BeautifulSoup

import parse_item_bonuses as module
from parse_item_bonuses import (
    ITEM_SLOTS,
    build_item_bonuses,
    build_mythic_options,
    get_mythic_rule_warnings,
    get_reaper_slots,
    parse_curses,
    parse_effect,
)

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'data')


def names_and_values(affixes):
    return [(affix['name'], affix['type'], affix['value']) for affix in affixes]


def effect(text, bonus_type='Fortune'):
    affixes, unmapped = parse_effect(text, bonus_type)
    return names_and_values(affixes), unmapped


def test_single_bonus():
    assert effect('+1 Fortune Bonus to Strength') == ([('Strength', 'Fortune', '1')], [])


def test_a_list_of_targets_gets_the_same_value():
    assert effect('+1 Fortune Bonus to Strength, Dexterity, and Constitution') == ([
        ('Strength', 'Fortune', '1'),
        ('Dexterity', 'Fortune', '1'),
        ('Constitution', 'Fortune', '1'),
    ], [])


def test_several_bonuses_in_one_effect():
    assert effect('+5 Fortune Bonus to Acid Spell Power, +1% Fortune Bonus to Acid Absorption, '
                  '+3 Fortune Bonus to Acid Resistance') == ([
        ('Acid Spell Power', 'Fortune', '5'),
        ('Acid Absorption', 'Fortune', '1'),
        ('Acid Resistance', 'Fortune', '3'),
    ], [])


def test_a_percentage_bonus_maps_to_the_percentage_affix():
    assert effect('+2% Fortune Bonus to Maximum Hit Points, +3% Fortune Bonus to Armor Class') == ([
        ('False Life (%)', 'Fortune', '2'),
        ('Armor Class (%)', 'Fortune', '3'),
    ], [])


def test_targets_go_through_the_synonym_map():
    assert effect('+4 Fortune Bonus to PRR') == ([('Physical Sheltering', 'Fortune', '4')], [])


def test_a_bonus_without_a_type_word():
    assert effect('+1 Reaper Bonus to attack and +1 to Spell Penetration', 'Reaper') == ([
        ('Accuracy', 'Reaper', '1'),
        ('Spell Penetration', 'Reaper', '1'),
    ], [])


def test_bard_songs_are_untyped():
    assert effect('+2 Fortune Bonus to Perform, +1 Bard Song') == ([
        ('Perform', 'Fortune', '2'),
        ('Bard Song Charge', 'Untyped', '1'),
    ], [])


def test_flags_are_bool_affixes_and_cosmetics_are_dropped():
    assert effect('Feather Falling, Cosmetic Butterflies') == ([('Feather Falling', 'Bool', 1)], [])
    assert effect('+2 Fortune Bonus to Swim, Water Breathing') == ([
        ('Swim', 'Fortune', '2'),
        ('Water Breathing', 'Bool', 1),
    ], [])


def test_vs_does_not_end_a_sentence():
    assert effect('If the item is a weapon, it is always considered a Favored Weapon. '
                  'Additionally, +4 Fortune Bonus to PRR, and +1 Fortune Bonus to Saves vs. Spells') == ([
        ('Favored Weapon', 'Bool', 1),
        ('Physical Sheltering', 'Fortune', '4'),
        ('Spell Saves', 'Fortune', '1'),
    ], [])


def test_a_conditional_bonus_counts_for_nothing():
    affixes, unmapped = effect('While under the effects of any Action Boost, you gain a +6 Fortune Bonus to Strength.')
    assert affixes == []
    assert unmapped == ['While under the effects of any Action Boost, you gain a +6 Fortune Bonus to Strength']


def test_an_unknown_target_is_reported_and_the_rest_kept():
    assert effect('+3% Fortune Bonus to Rune Arm Charge Rate, -3% Fortune Bonus to Rune Arm Cooldown Rate') == (
        [('Rune Arm Charge Rate', 'Fortune', '3')], ['Rune Arm Cooldown Rate'])


def test_prose_with_numbers_is_reported_whole():
    assert effect('This item is now worth 10,000 Sentient XP') == ([], ['This item is now worth 10,000 Sentient XP'])


def test_parse_curses_keeps_curses_with_no_affixes():
    soup = BeautifulSoup('''
        <table><tr><th>Card</th><th>Primary drop location</th></tr></table>
        <table>
            <tr><th>Curse</th><th>Effect</th><th>Type</th></tr>
            <tr><td>Curse of Minor Strength</td><td>+1 Fortune Bonus to Strength</td><td>Common</td></tr>
            <tr><td>Curse of the Unbreakable</td><td>This item is now immune to item damage.</td><td>Misc</td></tr>
        </table>''', 'html.parser')

    curses, unmapped = parse_curses(soup)

    assert [(curse['name'], names_and_values(curse['affixes'])) for curse in curses] == [
        ('Curse of Minor Strength', [('Strength', 'Fortune', '1')]),
        ('Curse of the Unbreakable', []),
    ]
    assert unmapped == {'Curse of the Unbreakable': ['This item is now immune to item damage']}


@pytest.mark.parametrize('label, slots', [
    ('Reaper Enchantment: Power', ITEM_SLOTS),
    ('Reaper Helmet Enchantment', ['Helm']),
    ('Reaper Shield Enchantment', ['Offhand']),
    ('Reaper Ring Boost (3)', ['Ring']),
    ('Reaper Quiver Enchantment', None),
])
def test_get_reaper_slots(label, slots):
    assert get_reaper_slots(label) == slots


def test_mythic_values_depend_on_the_slot():
    mythic = build_mythic_options()

    assert set(mythic) == set(ITEM_SLOTS)
    assert [option['name'] for option in mythic['Weapon']] == [
        'Mythic +2 (Melee/Ranged/Spell Power)', 'Mythic +4 (Melee/Ranged/Spell Power)']
    assert [option['name'] for option in mythic['Cloak']] == ['Mythic +1 (PRR/MRR)', 'Mythic +3 (PRR/MRR)']
    assert names_and_values(mythic['Ring'][1]['affixes']) == [
        ('Melee Power', 'Mythic', '3'), ('Ranged Power', 'Mythic', '3'), ('Universal Spell Power', 'Mythic', '3')]


def test_offhand_items_can_take_either_mythic_boost():
    assert [option['name'] for option in build_mythic_options()['Offhand']] == [
        'Mythic +2 (Melee/Ranged/Spell Power)', 'Mythic +2 (PRR/MRR)',
        'Mythic +4 (Melee/Ranged/Spell Power)', 'Mythic +4 (PRR/MRR)']


def test_mythic_rule_warnings_name_a_missing_sentence():
    soup = BeautifulSoup('<div id="mw-content-text">Nothing about mythics.</div>', 'html.parser')
    assert len(get_mythic_rule_warnings(soup)) == len(module.MYTHIC_RULE_SENTENCES)


# The committed snapshot pages. A change here is a change to what players can pick.

def test_snapshot_curses_with_no_planner_affixes():
    data, unmapped, warnings = build_item_bonuses()

    assert len(data['curses']) == 93
    assert {curse['name'] for curse in data['curses'] if not curse['affixes']} == {
        'Curse of Minor Masterworks',
        'Curse of Major Masterworks',
        'Curse of the Pact',
        "Curse of the Sentient's Meal",
        'Curse of Unparalleled Might',
        'Curse of the Commander',
        'Curse of the Unbreakable',
        'Curse of the Winding Dirge',
        'Curse of the Overloaded',
    }
    # Partly understood: the rest of the curse still counts.
    assert unmapped['Curse of the Mechanical Marvel'] == ['Rune Arm Cooldown Rate']
    assert warnings == []


def test_snapshot_reaper_options():
    data, _, _ = build_item_bonuses()
    reaper = data['reaper']

    assert set(reaper) == set(ITEM_SLOTS)
    general = ['Reaper Enchantment: Power', 'Reaper Enchantment: Physical Resistance Rating',
               'Reaper Enchantment: Magical Resistance Rating']
    assert [option['name'] for option in reaper['Weapon']] == general
    assert [option['name'] for option in reaper['Helm']] == general + ['Reaper Helmet Enchantment']
    assert [option['name'] for option in reaper['Ring']] == general + [
        'Reaper Ring Boost (+1 Spell, Tactical, and Assassinate DCs)',
        'Reaper Ring Boost (+10 Universal Spell Power)',
        'Reaper Ring Boost (+5 Melee / Ranged Power)',
        'Reaper Ring Boost (+3% Spell Cost Reduction, +3 MRR)',
    ]
    assert names_and_values(reaper['Belt'][-1]['affixes']) == [
        ('False Life', 'Reaper', '10'), ('Physical Sheltering', 'Reaper', '3')]


def _load(name):
    with open(os.path.join(DATA_DIR, f'{name}.json'), encoding='utf8') as fh:
        return json.load(fh)


def _affix_names(value, names):
    if isinstance(value, dict):
        if isinstance(value.get('name'), str) and 'type' in value and 'value' in value:
            names.add(value['name'])
        for child in value.values():
            _affix_names(child, names)
    elif isinstance(value, list):
        for child in value:
            _affix_names(child, names)
    return names


@pytest.mark.committed_data
def test_every_item_bonus_affix_is_one_the_planner_knows():
    known = set()
    for name in ['items', 'sets', 'crafting']:
        _affix_names(_load(name), known)
    known |= {group['name'] for group in _load('affix-groups')}

    assert sorted(_affix_names(_load('item-bonuses'), set()) - known) == []
