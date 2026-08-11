from bs4 import BeautifulSoup

import parse_essence_crafting as module


def build_wiki_progression(values):
    assert len(values) == 36
    return ''.join(f'<td>{value}</td>' for value in values)


def build_wiki_html(spell_power_35='??', spell_power_36='??'):
    levels = ''.join(f'<th>{level}</th>' for level in range(1, 37))
    spell_power = list(range(101, 135)) + [spell_power_35, spell_power_36]
    insightful_spell_power = list(range(51, 85)) + ['??', '??']
    universal_lore = [7] * 34 + ['??', '??']
    spell_focus = [2] * 34 + [13, 14]
    return f'''
        <table class="wikitable mw-datatable">
            <tr><th>Min Level</th>{levels}</tr>
            <tr><th>Spellpower</th>{build_wiki_progression(spell_power)}</tr>
            <tr><th>Ins. Spellpower</th>{build_wiki_progression(insightful_spell_power)}</tr>
            <tr><th>Lore (all)</th>{build_wiki_progression(universal_lore)}</tr>
            <tr><th>Spell Focus (one type)</th>{build_wiki_progression(spell_focus)}</tr>
        </table>
    '''


def stub_dependencies(monkeypatch, written, wiki_html):
    monkeypatch.setattr(module, 'get_most_common_bonus_type', lambda: {
        'Songblade': 'Enhancement',
        'Fire Spell Power': 'Equipment',
        'Spell Lore': 'Equipment',
        'Evocation Focus': 'Equipment',
    })
    monkeypatch.setattr(module, 'load_essence_crafting_item_types_from_wiki', lambda: {
        'Melee': {
            'Prefix': [
                'Songblade',
                'Fire Spell Power',
                'Insightful Fire Spell Power',
                'Spell Lore',
                'Evocation Focus',
            ],
            'Suffix': [],
            'Extra': [],
        },
    })
    monkeypatch.setattr(
        module,
        'load_essence_crafting_progression_from_wiki',
        lambda: module.get_essence_crafting_progression_from_wiki(BeautifulSoup(wiki_html, 'html.parser')),
    )
    monkeypatch.setattr(module, 'write_json', lambda data, name: written.setdefault(name, data))


def test_parse_essence_crafting_uses_wiki_values_and_caps_at_known_levels(monkeypatch):
    written = {}
    stub_dependencies(monkeypatch, written, build_wiki_html())

    module.parse_essence_crafting()

    output = written['essence-crafting']
    assert output['maxLevel'] == 34
    assert len(output['progression']['Songblade']) == 34
    assert output['progression']['Songblade'][-1] == 1
    assert output['bonusTypes']['Songblade'] == 'Bool'
    assert output['progression']['Fire Spell Power'][0] == 101
    assert output['progression']['Fire Spell Power'][-1] == 134
    assert output['progression']['Insightful Fire Spell Power'][0] == 51
    assert output['progression']['Insightful Fire Spell Power'][-1] == 84
    assert output['progression']['Spell Lore'][0] == 7
    assert output['progression']['Evocation Focus'][-1] == 2
    assert output['bonusTypes']['Fire Spell Power'] == 'Equipment'
    assert output['bonusTypes']['Spell Lore'] == 'Equipment'
    assert 'affixes' not in output
    assert 'Combustion' not in output['bonusTypes']
    assert output['itemTypes']['Melee']['Prefix'] == [
        'Songblade',
        'Fire Spell Power',
        'Insightful Fire Spell Power',
        'Spell Lore',
        'Evocation Focus',
    ]


def test_parse_essence_crafting_raises_max_level_when_wiki_values_are_known(monkeypatch):
    written = {}
    wiki_html = build_wiki_html(spell_power_35=135, spell_power_36=136)
    wiki_html = wiki_html.replace('<td>??</td>', '<td>85</td>')
    stub_dependencies(monkeypatch, written, wiki_html)

    module.parse_essence_crafting()

    output = written['essence-crafting']
    assert output['maxLevel'] == 36
    assert output['progression']['Fire Spell Power'][-2:] == [135, 136]
    assert output['progression']['Songblade'][-2:] == [1, 1]


def test_get_essence_crafting_affixes_from_wiki_cell_expands_grouped_affixes():
    soup = BeautifulSoup('''
        <td>
            <div>
                <ul>
                    <li>Spell Power (Combustion, Corrosion, Devotion, Glaciation, Impulse, Magnetism, Nullification, Radiance, Reconstruction, Resonance)</li>
                    <li>Insightful Spell Power (Combustion, Corrosion, Devotion, Glaciation, Impulse, Magnetism, Nullification, Radiance, Reconstruction, Resonance)</li>
                    <li>Spell Lore (one type)</li>
                    <li>Skills:
                        <ul>
                            <li>Spellsight</li>
                            <li>Move Silently</li>
                        </ul>
                    </li>
                    <li>Efficient Metamagic (Empower, Enlarge, Extend, Empower Healing, Maximize)</li>
                    <li>Armor Destroying (Armor Piercing + Destruction)</li>
                </ul>
            </div>
        </td>
    ''', 'html.parser')

    affixes = module.get_essence_crafting_affixes_from_cell(soup.find('td'))

    assert affixes == [
        'Fire Spell Power',
        'Acid Spell Power',
        'Positive Spell Power',
        'Cold Spell Power',
        'Force Spell Power',
        'Electric Spell Power',
        'Negative Spell Power',
        'Radiance',
        'Reconstruction',
        'Sonic Spell Power',
        'Insightful Fire Spell Power',
        'Insightful Acid Spell Power',
        'Insightful Positive Spell Power',
        'Insightful Glaciation',
        'Insightful Force Spell Power',
        'Insightful Electric Spell Power',
        'Insightful Negative Spell Power',
        'Insightful Radiance',
        'Insightful Reconstruction',
        'Insightful Sonic Spell Power',
        'Acid Lore',
        'Fire Lore',
        'Healing Lore',
        'Cold Lore',
        'Kinetic Lore',
        'Lightning Lore',
        'Radiance Lore',
        'Repair Lore',
        'Sonic Lore',
        'Negative Lore',
        'Spellcraft',
        'Move Silently',
        'Efficient Metamagic - Empower',
        'Efficient Metamagic - Enlarge',
        'Efficient Metamagic - Extend',
        'Efficient Metamagic - Empower Healing',
        'Efficient Metamagic - Maximize',
    ]


def test_spell_lore_parentheticals_have_distinct_meanings():
    all_types = module.expand_essence_crafting_wiki_affix('Spell Lore (all types)')
    universal = module.expand_essence_crafting_wiki_affix('Spell Lore (universal)')
    one_type = module.expand_essence_crafting_wiki_affix('Spell Lore (one type)')

    assert all_types == ['Spell Lore']
    assert universal == ['Spell Lore']
    assert one_type == module.SPELL_LORE_AFFIXES
