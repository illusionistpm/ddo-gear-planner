import get_data_stats as module
from get_data_stats import _count_affixes, check_stats_thresholds


def test_count_affixes_tolerates_partial_items():
    assert _count_affixes([
        {'name': 'Partial Item'},
        {'name': 'Real Item', 'affixes': [{'name': 'Search'}]},
    ]) == 1


def test_check_stats_thresholds_flags_large_drop():
    oldStats = {'items': {'items': 100}}
    newStats = {'items': {'items': 80}}

    violations = check_stats_thresholds(newStats, oldStats, threshold=0.1)

    assert len(violations) == 1
    assert 'items - items' in violations[0]


def test_check_stats_thresholds_allows_small_drop():
    oldStats = {'items': {'items': 100}}
    newStats = {'items': {'items': 95}}

    assert check_stats_thresholds(newStats, oldStats, threshold=0.1) == []


def test_check_stats_thresholds_ignores_zero_baseline():
    oldStats = {'items': {'items': 0}}
    newStats = {'items': {'items': 0}}

    assert check_stats_thresholds(newStats, oldStats, threshold=0.1) == []


def test_check_stats_thresholds_ignores_increase():
    oldStats = {'items': {'items': 100}}
    newStats = {'items': {'items': 150}}

    assert check_stats_thresholds(newStats, oldStats, threshold=0.1) == []


def test_get_data_stats_counts_pack_map_and_items_with_a_pack(monkeypatch):
    assets = {
        'quests': {'raids': ['A Raid'], 'packs': {'Quest A': 'Pack', 'Quest B': 'Pack'}},
        'items': [{'name': 'Packed', 'pack': 'Pack'}, {'name': 'Free'}, {'name': 'Blank', 'pack': ''}],
    }

    def fake_read_json(name):
        if name in assets:
            return assets[name]
        raise FileNotFoundError(name)

    monkeypatch.setattr(module, 'read_json', fake_read_json)

    stats = module.get_data_stats()

    assert stats['quests'] == {'raids': 1, 'pack map entries': 2}
    assert stats['items']['with pack'] == 1
