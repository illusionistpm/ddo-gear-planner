import build_affix_groups as module


def test_build_affix_groups_includes_kinetic_lore_components(monkeypatch):
    written = {}

    def capture(data, name):
        written[name] = data

    monkeypatch.setattr(module, 'write_json', capture)

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
