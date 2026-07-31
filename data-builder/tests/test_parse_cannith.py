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


def test_parse_cannith_normalizes_songblade_to_perform(monkeypatch):
    written = {}

    monkeypatch.setattr(module, 'get_most_common_bonus_type', lambda: {'Songblade': 'Enhancement'})
    monkeypatch.setattr(module.openpyxl, 'load_workbook', lambda path: FakeWorkbook())
    monkeypatch.setattr(module, 'write_json', lambda data, name: written.setdefault(name, data))

    module.parse_cannith()

    assert 'Songblade' not in written['cannith']['progression']
    assert 'Songblade' not in written['cannith']['bonusTypes']
    assert written['cannith']['progression']['Perform'] == [2, 2]
    assert written['cannith']['bonusTypes']['Perform'] == 'Enhancement'
    assert written['cannith']['itemTypes']['Melee']['Prefix'] == ['Perform']
