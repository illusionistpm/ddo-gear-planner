from compound_affixes import expand_single_affix


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
