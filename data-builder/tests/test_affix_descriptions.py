import json

import pytest

import provenance_io
import write_json
from affix_descriptions import build_descriptions, fill_constants, restates_row, strip_enchantment_name, to_template


@pytest.mark.parametrize('tooltip, name, expected', [
    ('Strength +3: This item gives a +3 bonus.', 'Strength', 'This item gives a +3 bonus.'),
    ('Riposte IV: When Missed by an attack: Deals damage.', 'Riposte', 'When Missed by an attack: Deals damage.'),
    ('Weapon Focus: Falchion: While equipped you gain the feat.', 'Weapon Focus: Falchion', 'While equipped you gain the feat.'),
    # No enchantment name in front: the colon is the effect's own.
    ('Passive: +2 Insight bonus to Spot.', 'Spot', 'Passive: +2 Insight bonus to Spot.'),
    ('+20 Artifact bonus to Universal Spell Power', 'Universal Spell Power', '+20 Artifact bonus to Universal Spell Power'),
    ('This grants you the Proficiency: Bastard Sword feat.', 'Proficiency: Bastard Sword', 'This grants you the Proficiency: Bastard Sword feat.'),
])
def test_strip_enchantment_name(tooltip, name, expected):
    assert strip_enchantment_name(tooltip, name) == expected


def test_to_template_marks_the_value_and_type_and_collects_other_numbers():
    assert to_template('Passive: +5 Insight bonus to Spot for 20 seconds.', 'Insight', '5') == \
        ('Passive: +{v} {type} bonus to Spot for # seconds.', ['20'])


def test_to_template_matches_a_negative_value_and_keeps_its_sign_in_the_text():
    assert to_template('This item gives a -2 penalty to your saves.', 'Penalty', '-2')[0] == \
        'This item gives a -{v} penalty to your saves.'


def test_to_template_leaves_a_bool_affix_numbers_alone():
    assert to_template('Heals 1d2 every 1 second.', 'Bool', '1') == ('Heals #d# every # second.', ['1', '2', '1'])


def test_build_descriptions_separates_cells_the_wiki_ran_together():
    tooltips = {('Frost', 'Bool', '1', 'Frost: Deals cold damage.(duration: 9 seconds)On weapons: Stores cold.')}
    assert build_descriptions(tooltips, set())['Frost']['*'] == 'Deals cold damage.(duration: 9 seconds) On weapons: Stores cold.'


def test_fill_constants_keeps_agreed_numbers_and_marks_the_rest():
    assert fill_constants('Heals #d# every # second.', [['1', '2', '1'], ['2', '2', '1']]) == 'Heals Xd2 every 1 second.'


@pytest.mark.parametrize('text, name, compound, expected', [
    ('Passive: +{v} {type} bonus to Universal Spell Power.', 'Universal Spell Power', False, True),
    ('This item gives a +{v} {type} bonus to your Fortitude saves.', 'Fortitude Save', False, True),
    # Says what Deadly is, which the name doesn't.
    ('+{v} {type} bonus to weapon damage.', 'Deadly', False, False),
    ('Passive: {v}% {type} bonus to Doublestrike. (Doublestrike is a chance to hit again.)', 'Doublestrike', False, False),
    # A compound's parts are listed under it, so a one-line bonus adds nothing.
    ('Passive: +{v} {type} bonus to Fortitude, Reflex, and Will Saving Throws.', 'Resistance', True, True),
    ('When Missed: Deals damage. Passive: +X {type} bonus to Armor Class.', 'Riposte', True, False),
    # "the Search skill" is just Search.
    ('Passive: +{v} {type} bonus to the Search skill.', 'Search', False, True),
    # A penalty is restated the same way a bonus is.
    ('Passive: -{v} penalty to the Spot skill.', 'Spot', False, True),
    ('This item gives a -{v} penalty to your Will saves.', 'Will Save', False, True),
    # A compound's penalty is part of what it does, which its parts don't say.
    ('This item helps you focus, but makes you oblivious, causing a -10 penalty to Search and Spot.', 'Overfocus', True, False),
    # A clicky's spell, caster level and charges are no more than its name.
    ('Flame Strike Caster level: 9 Charges: 5 (5/day)', 'Flame Strike clicky', False, True),
])
def test_restates_row(text, name, compound, expected):
    assert restates_row(text, name, compound) == expected


def test_build_descriptions_templates_each_affix():
    tooltips = {
        ('Deadly', 'Competence', '3', 'Deadly +3: +3 Competence bonus to weapon damage.'),
        ('Deadly', 'Insight', '5', 'Insightful Deadly +5: +5 Insight bonus to weapon damage.'),
    }
    assert build_descriptions(tooltips, set()) == {'Deadly': {'*': '+{v} {type} bonus to weapon damage.'}}


def test_build_descriptions_skips_restating_text_and_split_lines():
    tooltips = {
        ('Spot', 'Insight', '3', 'Spot +3: Passive: +3 Insight bonus to Spot.'),
        # One wiki line the parser split into two affixes describes neither.
        ('Spot', 'Luck', '2', 'Keen Eyes: +2 Luck bonus to Spot and Search.'),
        ('Search', 'Luck', '2', 'Keen Eyes: +2 Luck bonus to Spot and Search.'),
    }
    assert build_descriptions(tooltips, set()) == {}


def test_build_descriptions_gives_a_type_its_own_wording_when_it_has_one():
    tooltips = {
        ('Armor Class', 'Deflection', '3', 'Protection +3: Passive: +3 Deflection bonus to Armor Class.'),
        ('Armor Class', 'Deflection', '5', 'Protection +5: Passive: +5 Deflection bonus to Armor Class.'),
        ('Armor Class', 'Deflection', '7', 'Protection +7: Passive: +7 Deflection bonus to Armor Class.'),
        ('Armor Class', 'Shield', '4', 'Shield +4: A +4 Shield bonus to Armor Class. It does not stack with a shield.'),
        ('Armor Class', 'Shield', '8', 'Shield +8: A +8 Shield bonus to Armor Class. It does not stack with a shield.'),
        # A lone oddly worded tooltip isn't the type's wording.
        ('Armor Class', 'Insight', '2', 'Odd +2: Something unusual about armor.'),
    }
    assert build_descriptions(tooltips, set()) == {'Armor Class': {
        '*': '',
        'Shield': 'A +{v} {type} bonus to Armor Class. It does not stack with a shield.',
    }}


def test_build_descriptions_leaves_the_default_empty_when_no_wording_dominates():
    tooltips = {
        ('DR', '-', '5', 'Damage Reduction 5/-: Reduces all physical damage by 5.'),
        ('DR', '-', '10', 'Damage Reduction 10/-: Reduces all physical damage by 10.'),
        ('DR', 'Good', '5', 'Damage Reduction 5/Good: Reduces physical damage by 5, except from Good attacks.'),
        ('DR', 'Good', '10', 'Damage Reduction 10/Good: Reduces physical damage by 10, except from Good attacks.'),
        ('DR', 'Evil', '5', 'Damage Reduction 5/Evil: Reduces physical damage by 5, except from Evil attacks.'),
        ('DR', 'Evil', '10', 'Damage Reduction 10/Evil: Reduces physical damage by 10, except from Evil attacks.'),
    }
    assert build_descriptions(tooltips, set()) == {'DR': {
        '*': '',
        '-': 'Reduces all physical damage by {v}.',
        'Evil': 'Reduces physical damage by {v}, except from Evil attacks.',
        'Good': 'Reduces physical damage by {v}, except from Good attacks.',
    }}


def test_write_json_hands_tooltips_to_the_capture_only_while_it_is_on(monkeypatch, tmp_path):
    monkeypatch.setattr(write_json, 'get_asset_json_path', lambda name: str(tmp_path / (name + '.json')))
    affix = {'name': 'Spot', 'type': 'Insight', 'value': '3', 'sourceTooltip': 'Spot +3: Keen.'}

    write_json.write_json([affix], 'before')
    provenance_io.start_tooltip_capture()
    write_json.write_json([affix], 'during')

    assert provenance_io.captured_affix_tooltips() == {('Spot', 'Insight', '3', 'Spot +3: Keen.')}
    assert json.loads((tmp_path / 'during.json').read_text(encoding='utf8')) == [{'name': 'Spot', 'type': 'Insight', 'value': '3'}]
