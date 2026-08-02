import get_most_common_bonus_type


def test_get_most_common_bonus_type_tolerates_partial_items(monkeypatch):
    monkeypatch.setattr(get_most_common_bonus_type, 'read_json', lambda name: [
        {'name': 'Partial Item'},
        {'name': 'Real Item', 'affixes': [
            {'name': 'Perform', 'type': 'Enhancement'},
            {'name': 'Perform', 'type': 'Enhancement'},
            {'name': 'Perform', 'type': 'Insight'},
        ]},
    ])

    assert get_most_common_bonus_type.get_most_common_bonus_type() == {
        'Perform': 'Enhancement',
    }
