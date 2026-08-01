import build_affix_groups as module


def test_build_affix_groups_includes_kinetic_lore_components(monkeypatch):
    written = {}

    def capture(data, name):
        written[name] = data

    monkeypatch.setattr(module, 'write_json', capture)
    monkeypatch.setattr(module, 'load_compound_affixes', lambda: {})

    module.build_affix_groups()

    groups = {entry['name']: entry['affixes'] for entry in written['affix-groups']}
    assert groups['Kinetic Lore'] == ['Force Lore', 'Physical Lore', 'Untyped Lore']
    assert groups['Dazing'] == ['Stunning']
    assert groups['Sundering'] == ['Shatter']
    assert groups['Improved Deception'] == ['Bluff']

    songblade = next(entry for entry in written['affix-groups'] if entry['name'] == 'Songblade')
    assert songblade == {
        'name': 'Songblade',
        'affixes': ['Perform'],
        'components': [{'name': 'Perform', 'type': 'Enhancement', 'value': 2}],
    }

    lifesealed = next(entry for entry in written['affix-groups'] if entry['name'] == 'Lifesealed')
    assert lifesealed == {
        'name': 'Lifesealed',
        'affixes': ['Negative Energy Absorption', 'Deathblock'],
        'components': [
            {'name': 'Negative Energy Absorption', 'type': '<TypeAlreadyParsed>', 'value': '<ValueAlreadyParsed>'},
            {'name': 'Deathblock', 'type': 'Bool', 'value': 1},
        ],
    }


def test_build_affix_groups_adds_reviewed_llm_compounds(monkeypatch):
    written = {}

    def capture(data, name):
        written[name] = data

    monkeypatch.setattr(module, 'write_json', capture)
    monkeypatch.setattr(module, 'load_compound_affixes', lambda: {
        'Ghostly': {
            'components': [
                {'name': 'Incorporeality', 'type': '<TypeAlreadyParsed>', 'value': {'mode': 'same_as_affix_number'}},
                {'name': 'Hide', 'type': 'Enhancement', 'value': {'mode': 'fixed', 'amount': 5}},
                {'name': 'Move Silently', 'type': 'Enhancement', 'value': {'mode': 'fixed', 'amount': 5}},
                {'name': 'Deathblock', 'type': 'Bool', 'value': {'mode': 'boolean_one'}},
            ],
        },
        'Legacy Compound': {
            'components': [
                {'name': 'Search', 'type': '__inherit_type__', 'value': {'mode': 'same_as_affix_number'}},
            ],
        },
    })

    module.build_affix_groups()

    ghostly = next(entry for entry in written['affix-groups'] if entry['name'] == 'Ghostly')
    assert ghostly == {
        'name': 'Ghostly',
        'affixes': ['Incorporeality', 'Hide', 'Move Silently', 'Deathblock'],
        'components': [
            {'name': 'Incorporeality', 'type': '<TypeAlreadyParsed>', 'value': '<ValueAlreadyParsed>'},
            {'name': 'Hide', 'type': 'Enhancement', 'value': 5},
            {'name': 'Move Silently', 'type': 'Enhancement', 'value': 5},
            {'name': 'Deathblock', 'type': 'Bool', 'value': 1},
        ],
    }

    legacy = next(entry for entry in written['affix-groups'] if entry['name'] == 'Legacy Compound')
    assert legacy['components'] == [{'name': 'Search', 'type': '<TypeAlreadyParsed>', 'value': '<ValueAlreadyParsed>'}]
