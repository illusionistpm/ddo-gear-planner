import pytest
from bs4 import BeautifulSoup

import parse_essence_crafting as module


def build_wiki_progression(values):
    assert len(values) == 36
    return ''.join(f'<td>{value}</td>' for value in values)


def build_wiki_html(spell_power_35='??', spell_power_36='??', extra_rows=''):
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
            {extra_rows}
        </table>
    '''


def stub_dependencies(monkeypatch, written, wiki_html, extra_bonus_types=None, extra_prefixes=()):
    monkeypatch.setattr(module, 'get_most_common_bonus_type', lambda: {
        'Songblade': 'Enhancement',
        'Fire Spell Power': 'Equipment',
        'Spell Lore': 'Equipment',
        'Evocation Focus': 'Equipment',
        **(extra_bonus_types or {}),
    })
    monkeypatch.setattr(module, 'load_essence_crafting_item_types_from_wiki', lambda: {
        'Melee': {
            'Prefix': [
                'Songblade',
                'Fire Spell Power',
                'Insightful Fire Spell Power',
                'Spell Lore',
                'Evocation Focus',
                *extra_prefixes,
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
                    <li>Watchful ( Heightened Awareness + Dodge )</li>
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
        'Armor Destroying (Armor-Piercing + Destruction)',
        'Watchful (Heightened Awareness + Dodge)',
    ]


def test_dual_prefix_effects_take_their_usual_names():
    assert module.get_dual_affix_option('Airwarded ( Electric Resistance + Electric Absorption )') == \
        'Airwarded (Electric Resistance + Electricity Absorption)'
    assert module.get_dual_affix_option('Swift ( Speed + Reflex Save )') == 'Swift (Speed + Reflex)'
    # Bare Resistance is the saving throw bonus, not Spell Saves (Spellwarded has that).
    assert module.get_dual_affix_option('Protected ( Protection + Resistance )') == 'Protected (Protection + Resistance)'
    assert module.get_dual_affix_option('Spellwarded ( Spell Resistance + Spell Saves )') == \
        'Spellwarded (Spell Resistance + Spell Saves)'
    assert module.parse_dual_affix('Spell Power (Combustion, Corrosion)') is None


def test_spell_lore_parentheticals_have_distinct_meanings():
    all_types = module.expand_essence_crafting_wiki_affix('Spell Lore (all types)')
    universal = module.expand_essence_crafting_wiki_affix('Spell Lore (universal)')
    one_type = module.expand_essence_crafting_wiki_affix('Spell Lore (one type)')

    assert all_types == ['Spell Lore']
    assert universal == ['Spell Lore']
    assert one_type == module.SPELL_LORE_AFFIXES


def test_parse_essence_crafting_gives_checklist_affixes_listed_with_dice_a_value_of_1(monkeypatch):
    written = {}
    dice = ['1d6'] * 8 + ['2d6'] * 26 + ['??', '??']
    wiki_html = build_wiki_html(extra_rows=f'<tr><th>Bashing</th>{build_wiki_progression(dice)}</tr>')
    stub_dependencies(monkeypatch, written, wiki_html, {'Bashing': 'Bool'}, ['Bashing'])

    module.parse_essence_crafting()

    assert written['essence-crafting']['progression']['Bashing'] == [1] * 34


def test_parse_essence_crafting_rejects_dice_for_non_checklist_affixes(monkeypatch):
    written = {}
    dice = ['1d6'] * 34 + ['??', '??']
    wiki_html = build_wiki_html(extra_rows=f'<tr><th>Bashing</th>{build_wiki_progression(dice)}</tr>')
    stub_dependencies(monkeypatch, written, wiki_html, {'Bashing': 'Enhancement'}, ['Bashing'])

    with pytest.raises(ValueError, match='Non-numeric'):
        module.parse_essence_crafting()


def test_essence_crafting_names_immunities_as_items_do_but_keeps_its_other_names():
    assert module.normalize_essence_crafting_wiki_affix('Blindness Immunity') == 'Immunity to Blindness'
    assert module.normalize_essence_crafting_wiki_affix('Ins. Blindness Immunity') == 'Insightful Immunity to Blindness'
    # Synonyms that aren't immunities would rename options saved build URLs carry.
    assert module.normalize_essence_crafting_wiki_affix('Vitality') == 'Vitality'
    assert module.normalize_essence_crafting_wiki_affix('Striding') == 'Striding'


def test_dual_prefixes_give_each_effect_its_own_progression(monkeypatch):
    written = {}
    stub_dependencies(
        monkeypatch,
        written,
        build_wiki_html(),
        extra_bonus_types={'Vorpal': 'Bool', 'Holy Blast': 'Bool', 'Speed': 'Enhancement'},
        extra_prefixes=(
            'Attuned (Fire Spell Power + Evocation Focus)',
            'Honed (Vorpal + Holy Blast)',
            'Swift (Speed + Fire Spell Power)',
        ),
    )

    module.parse_essence_crafting()

    output = written['essence-crafting']
    compounds = output['compounds']
    assert compounds['Attuned (Fire Spell Power + Evocation Focus)'] == {
        'name': 'Attuned',
        'affixes': {
            'Fire Spell Power': output['progression']['Fire Spell Power'],
            'Evocation Focus': output['progression']['Evocation Focus'],
        },
    }
    # Checklist effects only need to be present.
    assert compounds['Honed (Vorpal + Holy Blast)'] == {
        'name': 'Honed',
        'affixes': {'Vorpal': [1] * 34, 'Holy Blast': [1] * 34},
    }
    assert output['bonusTypes']['Vorpal'] == 'Bool'
    # The wiki has no Essence Crafting value for Speed, so Swift is left out.
    assert 'Swift (Speed + Fire Spell Power)' not in compounds
    assert 'Speed' not in output['bonusTypes']
    assert output['itemTypes']['Melee']['Prefix'][-2:] == [
        'Attuned (Fire Spell Power + Evocation Focus)',
        'Honed (Vorpal + Holy Blast)',
    ]
    assert not any(option in output['progression'] for option in compounds)


def test_elemental_and_save_resistance_rows_keep_their_own_progressions(monkeypatch):
    written = {}
    elemental = list(range(4, 40))
    insightful_elemental = list(range(1, 37))
    saves = [12] * 36
    wiki_html = build_wiki_html(extra_rows=(
        f'<tr><th>Resistance</th>{build_wiki_progression(elemental)}</tr>'
        f'<tr><th>Ins. Resistance</th>{build_wiki_progression(insightful_elemental)}</tr>'
        f'<tr><th>Resistance (save)</th>{build_wiki_progression(saves)}</tr>'
    ))
    stub_dependencies(
        monkeypatch, written, wiki_html,
        {'Fire Resistance': 'Enhancement', 'Resistance': 'Resistance'},
        ['Fire Resistance', 'Insightful Fire Resistance', 'Resistance'],
    )

    module.parse_essence_crafting()

    progression = written['essence-crafting']['progression']
    assert progression['Fire Resistance'] == elemental[:34]
    assert progression['Insightful Fire Resistance'] == insightful_elemental[:34]
    assert progression['Resistance'] == saves[:34]


def test_essence_crafting_table_rejects_rows_that_normalize_to_one_key():
    wiki_html = build_wiki_html(extra_rows=(
        f'<tr><th>Resistance (save)</th>{build_wiki_progression([1] * 36)}</tr>'
        f'<tr><th>Resistance (Save)*</th>{build_wiki_progression([2] * 36)}</tr>'
    ))

    with pytest.raises(ValueError, match="collide on 'Resistance'"):
        module.get_essence_crafting_progression_from_wiki(BeautifulSoup(wiki_html, 'html.parser'))
