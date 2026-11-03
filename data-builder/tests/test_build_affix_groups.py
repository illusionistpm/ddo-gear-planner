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
    assert 'Negative and Poison Intensity' not in groups
    assert 'Negative and Poison Spell Crit Damage' not in groups
    assert groups['Kinetic Lore'] == ['Force Lore', 'Physical Lore', 'Untyped Lore']
    assert groups['Dazing'] == ['Stunning']
    assert groups['Sundering'] == ['Shatter']
    assert groups['Improved Deception'] == ['Bluff']
    assert 'Armor Class (%)' not in groups
    assert 'False Life (%)' not in groups
    assert groups['Potency'] == module.get_all_spell_power_types()
    assert groups['Universal Spell Power'] == module.get_all_spell_power_types()
    assert groups['Spell Lore'] == module.get_all_lore_types()
    assert groups['Universal Spell Lore'] == module.get_all_lore_types()
    assert groups['Spell Critical Damage'] == module.get_all_spell_crit_damage_types()
    assert groups['Universal Spell Critical Damage'] == module.get_all_spell_crit_damage_types()
    assert 'Void Intensity' in module.get_all_spell_crit_damage_types()
    assert groups['Frozen Depths Lore'] == ['Cold Lore', 'Poison Lore', 'Negative Lore']
    assert groups['Frozen Storm Lore'] == ['Cold Lore', 'Lightning Lore']
    assert groups['Radiance'] == ['Light Spell Power', 'Alignment Spell Power']
    assert groups['Radiance Lore'] == ['Light Lore', 'Alignment Lore']
    assert groups['Purifying Flame Lore'] == ['Fire Lore', 'Light Lore']
    assert groups['All Skills'] == module.get_all_skills()
    assert not set(module.get_all_saves()).intersection(module.get_all_skills())
    assert 'Resistance' not in module.get_all_skills()
    assert len(module.get_all_skills()) == len(set(module.get_all_skills()))

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


def test_build_affix_groups_riposte_components_from_the_real_compound_map(monkeypatch):
    written = {}

    def capture(data, name):
        written[name] = data

    monkeypatch.setattr(module, 'write_json', capture)

    module.build_affix_groups()

    group = next(entry for entry in written['affix-groups'] if entry['name'] == 'Riposte')
    assert group == {
        'name': 'Riposte',
        'affixes': ['Armor Class', 'Fortitude Save', 'Reflex Save', 'Will Save'],
        'components': [
            {'name': 'Armor Class', 'type': 'Insight', 'value': '<HalfValueRoundedUp>'},
            {'name': 'Fortitude Save', 'type': 'Insight', 'value': '<HalfValueRoundedDown>'},
            {'name': 'Reflex Save', 'type': 'Insight', 'value': '<HalfValueRoundedDown>'},
            {'name': 'Will Save', 'type': 'Insight', 'value': '<HalfValueRoundedDown>'},
        ],
    }


@pytest.mark.parametrize('name, value', [
    ('Lesser Heroism', 1),
    ('Heroism', 2),
    ('Improved Heroism', 3),
    ('Greater Heroism', 4),
    ('Superior Heroism', 5),
])
def test_heroism_family_from_the_real_compound_map(monkeypatch, name, value):
    written = {}

    def capture(data, name):
        written[name] = data

    monkeypatch.setattr(module, 'write_json', capture)

    module.build_affix_groups()

    heroism_affixes = module.get_all_saves() + module.get_all_skills() + ['Accuracy']
    group = next(entry for entry in written['affix-groups'] if entry['name'] == name)
    assert group == {
        'name': name,
        'affixes': heroism_affixes,
        'components': [{'name': affix, 'type': 'Morale', 'value': value} for affix in heroism_affixes],
    }


@pytest.mark.parametrize('name, incorporeality', [('Ghostly', 10), ('Enhanced Ghostly', 15)])
def test_ghostly_splits_into_incorporeality_stealth_and_bypass(monkeypatch, name, incorporeality):
    written = {}

    def capture(data, name):
        written[name] = data

    monkeypatch.setattr(module, 'write_json', capture)

    module.build_affix_groups()

    group = next(entry for entry in written['affix-groups'] if entry['name'] == name)
    assert group == {
        'name': name,
        'affixes': ['Incorporeality', 'Hide', 'Move Silently', 'Incorporeal Bypass'],
        'components': [
            {'name': 'Incorporeality', 'type': 'Enhancement', 'value': incorporeality},
            {'name': 'Hide', 'type': 'Enhancement', 'value': 5},
            {'name': 'Move Silently', 'type': 'Enhancement', 'value': 5},
            {'name': 'Incorporeal Bypass', 'type': 'Bool', 'value': 1},
        ],
    }


@pytest.mark.parametrize('name', [
    'Ethereal', 'Ghost Touch', 'Ghostbane', 'Dream Vision',
    'Flameblade', 'Frostblade', 'Mindcleaver', 'Shadowblade', 'Thornblade',
])
def test_incorporeal_miss_chance_bypass_sources(monkeypatch, name):
    written = {}

    def capture(data, name):
        written[name] = data

    monkeypatch.setattr(module, 'write_json', capture)

    module.build_affix_groups()

    group = next(entry for entry in written['affix-groups'] if entry['name'] == name)
    # Groups ungroup one level deep, so the bypass must be a direct component (not via Ghost Touch)
    assert {'name': 'Incorporeal Bypass', 'type': 'Bool', 'value': 1} in group['components']


@pytest.mark.parametrize('name, affixes', [
    ("Hound's Bones", ['Acid Absorption', 'Evil Absorption']),
    ('Mighty Skills Bonus', ['Jump', 'Swim']),
    ('Touch of Immortality', ['Heal', 'Repair']),
    ('Shadow Striker', ['Doublestrike', 'Doubleshot', 'Melee Alacrity', 'Ranged Alacrity']),
    ('Permanent Efficacy', module.get_all_spell_power_types()),
    ("Summer's Impertenence", ['Fire Intensity', 'Radiance Intensity']),
    ("Winter's Impertenence", ['Kinetic Intensity', 'Void Intensity']),
    ('Quori Mind Shield', ['Chaos Absorption']),
    ('Strength of Purpose', ['Undying']),
])
def test_named_multi_stat_affixes_from_the_real_compound_map(monkeypatch, name, affixes):
    written = {}

    def capture(data, name):
        written[name] = data

    monkeypatch.setattr(module, 'write_json', capture)

    module.build_affix_groups()

    group = next(entry for entry in written['affix-groups'] if entry['name'] == name)
    assert group['affixes'] == affixes


def test_build_affix_groups_sight_beyond_sight(monkeypatch):
    written = {}

    def capture(data, name):
        written[name] = data

    monkeypatch.setattr(module, 'write_json', capture)
    monkeypatch.setattr(module, 'load_compound_affixes', lambda: {})

    module.build_affix_groups()

    groups = {entry['name']: entry for entry in written['affix-groups']}
    assert groups['Sight Beyond Sight'] == {
        'name': 'Sight Beyond Sight',
        'affixes': ['Dodge Bypass'],
        'components': [{'name': 'Dodge Bypass', 'type': 'Enhancement', 'value': 5}],
    }


@pytest.mark.parametrize('name, lores', [
    ('Firestorm Lore', ['Fire Lore', 'Lightning Lore']),
    ('Thunderstorm Lore', ['Sonic Lore', 'Lightning Lore']),
    ('Frozen Thunderstorm Lore', ['Cold Lore', 'Sonic Lore', 'Lightning Lore']),
    ('Moonlit Haunt Lore', ['Negative Lore', 'Force Lore', 'Poison Lore']),
    ('Dark Restoration Lore', ['Negative Lore', 'Poison Lore', 'Healing Lore']),
    ('Silver Flame Lore', ['Healing Lore', 'Light Lore', 'Alignment Lore']),
    ('Creeping Dust Lore', ['Cold Lore', 'Acid Lore']),
])
def test_multi_element_lore_affixes_from_the_real_compound_map(monkeypatch, name, lores):
    written = {}

    def capture(data, name):
        written[name] = data

    monkeypatch.setattr(module, 'write_json', capture)

    module.build_affix_groups()

    group = next(entry for entry in written['affix-groups'] if entry['name'] == name)
    assert group == {'name': name, 'affixes': lores}
    assert set(lores) <= set(module.get_all_lore_types())


def test_every_power_of_and_lore_compound_maps_to_known_element_affixes(monkeypatch):
    written = {}

    def capture(data, name):
        written[name] = data

    monkeypatch.setattr(module, 'write_json', capture)

    module.build_affix_groups()

    for entry in written['affix-groups']:
        if entry['name'].startswith('Power of the') or entry['name'].startswith('Power of Creeping'):
            assert set(entry['affixes']) <= set(module.get_all_spell_power_types()), entry
        elif entry['name'].endswith(' Lore') and entry['name'] not in ('Spell Lore', 'Universal Spell Lore'):
            assert set(entry['affixes']) <= set(module.get_all_lore_types()), entry


def test_every_intensity_group_member_is_a_real_intensity_affix(monkeypatch):
    written = {}

    def capture(data, name):
        written[name] = data

    monkeypatch.setattr(module, 'write_json', capture)

    module.build_affix_groups()

    for entry in written['affix-groups']:
        if entry['name'].endswith('Intensity') or entry['name'].endswith('Spell Critical Damage'):
            assert set(entry['affixes']) <= set(module.get_all_spell_crit_damage_types()), entry
