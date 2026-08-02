import parse_cannith as module


class FakeCell:
    def __init__(self, value):
        self.value = value


class FakeWorksheet:
    def __getitem__(self, key):
        assert key == 1
        return [
            FakeCell('Affix'),
            FakeCell('Min Level'),
            FakeCell(1),
            FakeCell(34),
            FakeCell('Melee Prefix'),
        ]

    def iter_rows(self):
        yield [FakeCell('Affix'), FakeCell('Min Level'), FakeCell(1), FakeCell(34), FakeCell('Melee Prefix')]
        yield [FakeCell('Songblade'), FakeCell(None), FakeCell(1), FakeCell(1), FakeCell('x')]
        yield [FakeCell('Combustion'), FakeCell(None), FakeCell(2), FakeCell(2), FakeCell('x')]
        yield [FakeCell('Insightful Combustion'), FakeCell(None), FakeCell(3), FakeCell(3), FakeCell('x')]
        yield [FakeCell('Universal Spell Lore'), FakeCell(None), FakeCell(4), FakeCell(4), FakeCell('x')]


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


def test_parse_cannith_keeps_songblade_as_fixed_mapping_source(monkeypatch):
    written = {}

    monkeypatch.setattr(module, 'get_most_common_bonus_type', lambda: {
        'Songblade': 'Enhancement',
        'Fire Spell Power': 'Equipment',
        'Acid Lore': 'Equipment',
        'Cold Lore': 'Equipment',
        'Lightning Lore': 'Equipment',
        'Fire Lore': 'Equipment',
        'Force Lore': 'Equipment',
        'Light Lore': 'Equipment',
        'Negative Lore': 'Equipment',
        'Healing Lore': 'Equipment',
        'Repair Lore': 'Equipment',
        'Sonic Lore': 'Equipment',
        'Universal Spell Lore': 'Exceptional',
    })
    monkeypatch.setattr(module.openpyxl, 'load_workbook', lambda path: FakeWorkbook())
    monkeypatch.setattr(module, 'write_json', lambda data, name: written.setdefault(name, data))

    module.parse_cannith()

    assert written['cannith']['maxLevel'] == 34
    assert len(written['cannith']['progression']['Songblade']) == 2
    assert written['cannith']['progression']['Songblade'][0] == 1
    assert written['cannith']['progression']['Songblade'][-1] == 1
    assert written['cannith']['bonusTypes']['Songblade'] == 'Bool'
    assert written['cannith']['progression']['Fire Spell Power'][0] == 2
    assert written['cannith']['progression']['Fire Spell Power'][-1] == 2
    assert written['cannith']['progression']['Insightful Fire Spell Power'][0] == 3
    assert written['cannith']['progression']['Insightful Fire Spell Power'][-1] == 3
    assert written['cannith']['progression']['Universal Spell Lore'][0] == 4
    assert written['cannith']['progression']['Universal Spell Lore'][-1] == 4
    assert written['cannith']['bonusTypes']['Fire Spell Power'] == 'Equipment'
    assert written['cannith']['bonusTypes']['Universal Spell Lore'] == 'Exceptional'
    assert 'affixes' not in written['cannith']
    assert 'Combustion' not in written['cannith']['bonusTypes']
    assert written['cannith']['itemTypes']['Melee']['Prefix'] == [
        'Songblade',
        'Fire Spell Power',
        'Insightful Fire Spell Power',
        'Universal Spell Lore',
    ]
