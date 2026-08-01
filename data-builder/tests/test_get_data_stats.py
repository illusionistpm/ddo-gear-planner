from get_data_stats import _count_affixes


def test_count_affixes_tolerates_partial_items():
    assert _count_affixes([
        {'name': 'Partial Item'},
        {'name': 'Real Item', 'affixes': [{'name': 'Search'}]},
    ]) == 1
