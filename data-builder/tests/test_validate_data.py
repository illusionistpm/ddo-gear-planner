from validate_data import audit_items, audit_seal_upgrades


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


def test_audit_seal_upgrades_flags_upgradeable_items_without_extracted_upgrade():
    items = [
        {'name': 'Quiver of Alacrity', 'crafting': ['Upgradeable Item']},
        {'name': 'New Raid Hat', 'crafting': ['Upgradeable Item']},
        {'name': 'Litany of the Dead', 'crafting': ['Upgradeable Item']},
        {'name': 'Plain Ring', 'affixes': []},
    ]
    crafting = {'Upgradeable Item': {'Quiver of Alacrity': [{'affixes': []}]}}

    issues = audit_seal_upgrades(items, crafting)

    assert [(issue['category'], issue['item']) for issue in issues] == [('missing-seal-upgrade', 'New Raid Hat')]
