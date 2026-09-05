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
