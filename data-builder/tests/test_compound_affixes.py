from compound_affixes import expand_single_affix
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
