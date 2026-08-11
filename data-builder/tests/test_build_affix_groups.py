import build_affix_groups as module
import pytest


def test_build_affix_groups_includes_kinetic_lore_components(monkeypatch):
    written = {}

    def capture(data, name):
        written[name] = data

    monkeypatch.setattr(module, 'write_json', capture)
    monkeypatch.setattr(module, 'load_compound_affixes', lambda: {})

    module.build_affix_groups()

    groups = {entry['name']: entry['affixes'] for entry in written['affix-groups']}
    assert groups['Void Intensity'] == ['Negative Intensity', 'Poison Intensity']
    assert 'Negative and Poison Intensity' not in groups
    assert 'Negative and Poison Spell Crit Damage' not in groups
    assert groups['Kinetic Lore'] == ['Force Lore', 'Physical Lore', 'Untyped Lore']
    assert groups['Dazing'] == ['Stunning']
    assert groups['Sundering'] == ['Shatter']
    assert groups['Improved Deception'] == ['Bluff']
    assert 'Armor Class (%)' not in groups
    assert 'False Life (%)' not in groups
    assert groups['Potency'] == [
        'Negative Spell Power',
        'Light Spell Power',
        'Positive Spell Power',
        'Acid Spell Power',
        'Fire Spell Power',
        'Electric Spell Power',
        'Cold Spell Power',
        'Repair Spell Power',
        'Rust Spell Power',
        'Force Spell Power',
        'Sonic Spell Power',
    ]
    assert groups['Spell Lore'] == [
        'Negative Lore',
        'Poison Lore',
        'Light Lore',
        'Radiance Lore',
        'Alignment Lore',
        'Healing Lore',
        'Acid Lore',
        'Fire Lore',
        'Lightning Lore',
        'Cold Lore',
        'Repair Lore',
        'Rust Lore',
        'Kinetic Lore',
        'Force Lore',
        'Sonic Lore',
    ]
    assert groups['Frozen Depths Lore'] == ['Cold Lore', 'Poison Lore', 'Negative Lore']
    assert groups['Frozen Storm Lore'] == ['Cold Lore', 'Lightning Lore']
    assert groups['Radiance'] == ['Light Spell Power', 'Alignment Spell Power']
    assert groups['Radiance Lore'] == ['Light Lore', 'Alignment Lore']
    assert groups['Purifying Flame Lore'] == ['Fire Lore', 'Light Lore']
    assert groups['All Skills'] == module.get_all_skills()
    assert not set(module.get_all_saves()).intersection(module.get_all_skills())
    assert 'Resistance' not in module.get_all_skills()
    assert len(module.get_all_skills()) == len(set(module.get_all_skills()))
    greater_heroism_affixes = module.get_all_saves() + module.get_all_skills() + ['Accuracy']
    assert groups['Greater Heroism'] == greater_heroism_affixes
    assert all(isinstance(affix, str) for affix in groups['Greater Heroism'])

    greater_heroism = next(entry for entry in written['affix-groups'] if entry['name'] == 'Greater Heroism')
    assert greater_heroism == {
        'name': 'Greater Heroism',
        'affixes': greater_heroism_affixes,
        'components': [
            {'name': name, 'type': 'Morale', 'value': 4}
            for name in greater_heroism_affixes
        ],
    }

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
    assert legacy == {
        'name': 'Legacy Compound',
        'affixes': ['Search'],
    }


def test_build_affix_groups_omits_redundant_default_components(monkeypatch):
    written = {}

    def capture(data, name):
        written[name] = data

    monkeypatch.setattr(module, 'write_json', capture)
    monkeypatch.setattr(module, 'load_compound_affixes', lambda: {
        'Default Compound': {
            'components': [
                {'name': 'Search', 'type': '<TypeAlreadyParsed>', 'value': {'mode': 'same_as_affix_number'}},
                {'name': 'Spot', 'type': '__inherit_type__', 'value': {'mode': 'same_as_affix_number'}},
            ],
        },
    })

    module.build_affix_groups()

    group = next(entry for entry in written['affix-groups'] if entry['name'] == 'Default Compound')
    assert group == {
        'name': 'Default Compound',
        'affixes': ['Search', 'Spot'],
    }


def test_add_rejects_nested_affix_lists():
    groups = []

    with pytest.raises(TypeError, match='non-string affixes'):
        module.add(groups, 'Bad Group', [['Search'], 'Spot'])
