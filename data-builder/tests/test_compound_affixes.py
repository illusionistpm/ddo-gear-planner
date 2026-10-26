import pytest

from compound_affixes import expand_single_affix, load_compound_affixes
import parse_items
from parse_items import expand_affix_names_with_compounds


def test_expand_single_affix_with_same_value_and_inherited_type():
    affix = {'name': 'Dual Skills', 'type': 'Insight', 'value': '7'}
    compound_map = {
        'Dual Skills': {
            'components': [
                {'name': 'Search', 'type': '<TypeAlreadyParsed>', 'value': {'mode': 'same_as_affix_number'}},
                {'name': 'Spot', 'type': '<TypeAlreadyParsed>', 'value': {'mode': 'same_as_affix_number'}},
            ]
        }
    }

    assert expand_single_affix(affix, compound_map) == [
        {'name': 'Search', 'type': 'Insight', 'value': '7'},
        {'name': 'Spot', 'type': 'Insight', 'value': '7'},
    ]


def test_expand_single_affix_accepts_legacy_inherit_type_token():
    affix = {'name': 'Alluring Skills Bonus', 'type': 'Exceptional', 'value': 11}
    compound_map = {
        'Alluring Skills Bonus': {
            'components': [
                {'name': 'Perform', 'type': '__inherit_type__', 'value': {'mode': 'same_as_affix_number'}},
            ]
        }
    }

    assert expand_single_affix(affix, compound_map) == [
        {'name': 'Perform', 'type': 'Exceptional', 'value': 11},
    ]


def test_expand_single_affix_returns_original_when_unknown():
    affix = {'name': 'Search', 'type': 'Insight', 'value': '7'}
    assert expand_single_affix(affix, {}) == [affix]


def test_expand_affix_names_with_compounds_uses_parsed_component_names(monkeypatch):
    monkeypatch.setattr(parse_items, 'expand_single_affix', lambda affix: {
        'Impulse': [
            {'name': 'Force Spell Power'},
            {'name': 'Untyped Spell Power'},
        ],
        'Anathema': [
            {'name': 'Slashing Spell Power'},
            {'name': 'Piercing Spell Power'},
            {'name': 'Bludgeoning Spell Power'},
            {'name': 'Anathema'},
        ],
    }.get(affix['name'], [affix]))

    assert expand_affix_names_with_compounds(['Impulse', 'Anathema']) == {
        'Force Spell Power',
        'Untyped Spell Power',
        'Slashing Spell Power',
        'Piercing Spell Power',
        'Bludgeoning Spell Power',
        'Anathema',
    }


@pytest.mark.parametrize('tier,armor_class,saves', [('8', 4, 4), ('7', 4, 3), ('12', 6, 6)])
def test_riposte_expands_to_insight_ac_and_saves_from_the_real_compound_map(tier, armor_class, saves):
    affix = {'name': 'Riposte', 'type': 'Insight', 'value': tier}

    assert expand_single_affix(affix, load_compound_affixes()) == [
        {'name': 'Armor Class', 'type': 'Insight', 'value': armor_class},
        {'name': 'Fortitude Save', 'type': 'Insight', 'value': saves},
        {'name': 'Reflex Save', 'type': 'Insight', 'value': saves},
        {'name': 'Will Save', 'type': 'Insight', 'value': saves},
    ]


def test_expand_single_affix_halves_the_value_rounding_each_way():
    compound_map = {
        'Halves': {
            'components': [
                {'name': 'Armor Class', 'type': 'Insight', 'value': {'mode': 'half_round_up'}},
                {'name': 'Will Save', 'type': 'Insight', 'value': {'mode': 'half_round_down'}},
            ]
        }
    }

    assert expand_single_affix({'name': 'Halves', 'type': 'Insight', 'value': '5'}, compound_map) == [
        {'name': 'Armor Class', 'type': 'Insight', 'value': 3},
        {'name': 'Will Save', 'type': 'Insight', 'value': 2},
    ]


def test_expand_single_affix_halving_tolerates_a_name_only_affix():
    compound_map = {
        'Halves': {
            'components': [
                {'name': 'Armor Class', 'type': 'Insight', 'value': {'mode': 'half_round_up'}},
            ]
        }
    }

    assert expand_single_affix({'name': 'Halves'}, compound_map) == [
        {'name': 'Armor Class', 'type': 'Insight', 'value': None},
    ]
