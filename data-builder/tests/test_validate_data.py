from validate_data import audit_items


def test_audit_items_detects_unknown_type_and_missing_numeric_value():
    items = [
        {
            'name': 'Bad Ring',
            'url': '/page/Item:Bad_Ring',
            'affixes': [
                {'name': 'Search', 'type': 'Mystery', 'value': '3'},
                {'name': 'Wizardry', 'type': 'Enhancement', 'value': 'not-a-number'},
            ],
        }
    ]

    issues = audit_items(items, expectations=[])
    categories = {issue['category'] for issue in issues}
    assert 'unknown-type' in categories
    assert 'missing-numeric-value' in categories


def test_audit_items_detects_duplicate_and_suspicious_pairing():
    items = [
        {
            'name': 'Odd Hat',
            'affixes': [
                {'name': 'Wizardry', 'type': 'Bool', 'value': 1},
                {'name': 'Wizardry', 'type': 'Bool', 'value': 1},
            ],
        }
    ]

    issues = audit_items(items, expectations=[])
    categories = {issue['category'] for issue in issues}
    assert 'duplicate-affix' in categories
    assert 'suspicious-pairing' in categories


def test_audit_items_detects_expectation_regression_from_provenance():
    expectations = [
        {
            'id': 'search-tooltip',
            'sourceText': 'Search',
            'sourceTooltip': '+1 Insight bonus to Search',
            'expected': {'name': 'Search', 'type': 'Insight', 'value': '1'},
        }
    ]
    items = [
        {
            'name': 'Buggy Goggles',
            'affixes': [
                {
                    'name': 'Search',
                    'type': 'Bool',
                    'value': 1,
                    'sourceText': 'Search',
                    'sourceTooltip': '+1 Insight bonus to Search',
                },
            ],
        }
    ]

    issues = audit_items(items, expectations=expectations)
    assert any(issue['category'] == 'expectation-regression' for issue in issues)
