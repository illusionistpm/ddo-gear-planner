from bs4 import BeautifulSoup
from parse_legendary_green_steel import parse_legendary_green_steel_tier_options_from_soup
from parse_legendary_green_steel import postprocess_legendary_green_steel_augments


def get_test_tier_options():
    soup = BeautifulSoup('''
        <table>
            <tr>
                <th>Focus</th>
                <th>Gem</th>
                <th>Essence</th>
                <th>Equipment Augment</th>
                <th>Weapon Augment</th>
            </tr>
            <tr>
                <td>Legendary Inferior Focus of Fire</td>
                <td>Legendary Cloudy Gem of Escalation</td>
                <td>Legendary Diluted Ethereal Essence</td>
                <td>Profane Wizardry +151, Competence Intelligence Skills +22, UMD +6</td>
                <td>Intelligence +12</td>
            </tr>
            <tr>
                <td>Legendary Inferior Focus of Air</td>
                <td>Legendary Cloudy Gem of Opposition</td>
                <td>Legendary Diluted Material Essence</td>
                <td>Electric Resistance +50</td>
                <td>Electrical Absorption +25%</td>
            </tr>
        </table>
    ''', 'html.parser')

    return {
        'T1 (Equipment)': {
            '*': parse_legendary_green_steel_tier_options_from_soup(soup, 1),
        },
        'T2 (Equipment)': {
            '*': [
                {
                    'name': 'Green Steel Augment (Equipment, Tier 2, Air Opposition Material)',
                    'ml': 26,
                    'affixes': [
                        {
                            'name': 'Electric Resistance',
                            'type': 'Insight',
                            'value': '25',
                        },
                    ],
                    'quests': ['Legendary Altar of Subjugation'],
                },
            ],
        },
        'T3 (Equipment)': {
            '*': [
                {
                    'name': 'Green Steel Augment (Equipment, Tier 3, Air Opposition Material)',
                    'ml': 26,
                    'affixes': [
                        {
                            'name': 'Electric Resistance',
                            'type': 'Competence',
                            'value': '17',
                        },
                    ],
                    'quests': ['Legendary Altar of Devastation'],
                },
            ],
        },
    }


def test_postprocess_legendary_green_steel_adds_missing_escalation_options():
    item_augments = {
        'T1 (Equipment)': {
            '*': [],
        },
    }

    postprocess_legendary_green_steel_augments(item_augments, tier_options=get_test_tier_options())

    options = item_augments['T1 (Equipment)']['*']
    intelligence_wizardry_options = [
        option for option in options
        if option['affixes'] == [
            {
                'name': 'Intelligence Skills',
                'type': 'Competence',
                'value': '22',
            },
            {
                'name': 'UMD',
                'type': 'Competence',
                'value': '6',
            },
            {
                'name': 'Wizardry',
                'type': 'Profane',
                'value': '151',
            },
        ]
    ]

    assert len(intelligence_wizardry_options) == 1
    intelligence_wizardry = intelligence_wizardry_options[0]
    assert 'name' not in intelligence_wizardry
    assert 'ml' not in intelligence_wizardry
    assert intelligence_wizardry['quests'] == ['Legendary Altar of Invasion']


def test_postprocess_legendary_green_steel_keeps_non_green_steel_names():
    item_augments = {
        'T1 (Equipment)': {
            '*': [
                {
                    'name': 'Green Steel Augment (Equipment, Tier 1, Air Opposition Ethereal)',
                    'ml': 26,
                    'affixes': [
                        {
                            'name': 'Reflex Save',
                            'type': 'Resistance',
                            'value': '13',
                        },
                    ],
                },
            ],
        },
        'Blue Augment Slot': {
            '*': [
                {
                    'name': 'Sapphire of Defense +16',
                    'affixes': [
                        {
                            'name': 'Sheltering',
                            'type': 'Enhancement',
                            'value': '16',
                        },
                    ],
                },
            ],
        },
    }

    postprocess_legendary_green_steel_augments(item_augments, tier_options=get_test_tier_options())

    assert 'name' not in item_augments['T1 (Equipment)']['*'][0]
    assert 'ml' not in item_augments['T1 (Equipment)']['*'][0]
    assert item_augments['Blue Augment Slot']['*'][0]['name'] == 'Sapphire of Defense +16'


def test_postprocess_legendary_green_steel_adds_opposition_material_resistances():
    item_augments = {
        'T1 (Equipment)': {
            '*': [],
        },
    }

    postprocess_legendary_green_steel_augments(item_augments, tier_options=get_test_tier_options())

    options = item_augments['T1 (Equipment)']['*']
    electric_resistance = next(
        option for option in options
        if option['affixes'] == [
            {
                'name': 'Electric Resistance',
                'type': 'Enhancement',
                'value': '50',
            },
        ]
    )

    assert 'name' not in electric_resistance
    assert 'ml' not in electric_resistance
    assert electric_resistance['quests'] == ['Legendary Altar of Invasion']

    tier_2_electric_resistance = next(
        option for option in item_augments['T2 (Equipment)']['*']
        if option['affixes'] == [
            {
                'name': 'Electric Resistance',
                'type': 'Insight',
                'value': '25',
            },
        ]
    )
    tier_3_electric_resistance = next(
        option for option in item_augments['T3 (Equipment)']['*']
        if option['affixes'] == [
            {
                'name': 'Electric Resistance',
                'type': 'Competence',
                'value': '17',
            },
        ]
    )

    assert tier_2_electric_resistance['quests'] == ['Legendary Altar of Subjugation']
    assert tier_3_electric_resistance['quests'] == ['Legendary Altar of Devastation']
