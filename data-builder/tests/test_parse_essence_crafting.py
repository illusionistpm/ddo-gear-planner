from bs4 import BeautifulSoup

import parse_essence_crafting as module


class FakeCell:
    def __init__(self, value):
        self.value = value


class FakeWorksheet:
    def __getitem__(self, key):
        assert key == 1
        return [
            FakeCell('Affix'),
            FakeCell('Min Level'),
            *[FakeCell(level) for level in range(1, 35)],
            FakeCell('Melee Prefix'),
        ]

    def iter_rows(self):
        yield [
            FakeCell('Affix'),
            FakeCell('Min Level'),
            *[FakeCell(level) for level in range(1, 35)],
            FakeCell('Melee Prefix'),
        ]
        yield [FakeCell('Songblade'), FakeCell(None), *[FakeCell(1) for _ in range(34)], FakeCell('x')]
        yield [FakeCell('Combustion'), FakeCell(None), *[FakeCell(2) for _ in range(34)], FakeCell('x')]
        yield [FakeCell('Insightful Combustion'), FakeCell(None), *[FakeCell(3) for _ in range(34)], FakeCell('x')]
        yield [FakeCell('Universal Spell Lore'), FakeCell(None), *[FakeCell(4) for _ in range(34)], FakeCell('x')]
        yield [FakeCell('Spell Focus: Evocation'), FakeCell(None), *[FakeCell(5) for _ in range(34)], FakeCell('x')]


class FakeWorkbook:
    sheetnames = ['Sheet1']

    def __init__(self):
        self._active = FakeWorksheet()

    @property
    def active(self):
        return self._active

    @active.setter
    def active(self, value):
        if isinstance(value, int):
            return
        self._active = value


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
        'Universal Spell Lore': 'Exceptional',
        'Evocation Focus': 'Equipment',
    })
    monkeypatch.setattr(module.openpyxl, 'load_workbook', lambda path: FakeWorkbook())
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
    assert output['progression']['Universal Spell Lore'][0] == 7
    assert output['progression']['Evocation Focus'][-1] == 2
    assert output['bonusTypes']['Fire Spell Power'] == 'Equipment'
    assert output['bonusTypes']['Universal Spell Lore'] == 'Exceptional'
    assert 'affixes' not in output
    assert 'Combustion' not in output['bonusTypes']
    assert output['itemTypes']['Melee']['Prefix'] == [
        'Songblade',
        'Fire Spell Power',
        'Insightful Fire Spell Power',
        'Universal Spell Lore',
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
