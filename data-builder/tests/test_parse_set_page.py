from bs4 import BeautifulSoup

import parse_set_page as module


def test_normalize_set_universal_affixes_renames_to_per_element_groups():
    sets = {
        'Example Set': [
            {
                'threshold': 3,
                'affixes': [
                    {'name': 'Universal Spell Power', 'type': 'Artifact', 'value': '25'},
                    {'name': 'Universal Spell Lore', 'type': 'Artifact', 'value': '6'},
                ],
            },
            {
                'threshold': 7,
                'affixes': [
                    {'name': 'Universal Spell Critical Damage', 'type': 'Legendary', 'value': '15'},
                ],
            },
        ],
    }

    result = module.normalize_set_universal_affixes(sets)

    assert result['Example Set'] == [
        {
            'threshold': 3,
            'affixes': [
                {'name': 'Potency', 'type': 'Artifact', 'value': '25'},
                {'name': 'Spell Lore', 'type': 'Artifact', 'value': '6'},
            ],
        },
        {
            'threshold': 7,
            'affixes': [
                {'name': 'Spell Critical Damage', 'type': 'Legendary', 'value': '15'},
            ],
        },
    ]


def test_normalize_set_universal_affixes_leaves_other_affixes_alone():
    affixes = [
        {'name': 'Potency', 'type': 'Equipment', 'value': '24'},
        {'name': 'Fire Spell Power', 'type': 'Artifact', 'value': '20'},
        {'name': 'Melee Power', 'type': 'Profane', 'value': '5'},
    ]
    sets = {'Example Set': [{'threshold': 2, 'affixes': [dict(a) for a in affixes]}]}

    module.normalize_set_universal_affixes(sets)

    assert sets['Example Set'][0]['affixes'] == affixes


def test_parsed_set_page_universal_spell_power_becomes_potency():
    soup = BeautifulSoup(
        '''
        <div id="mw-content-text">
            <table class="wikitable">
                <tr><th>Set name</th><th>Effects</th></tr>
                <tr>
                    <td>Example Set</td>
                    <td><p>3 Pieces Equipped:</p><ul><li>Artifact Universal Spell Power +20</li></ul></td>
                </tr>
            </table>
        </div>
        ''',
        'html.parser',
    )

    sets = module.normalize_set_universal_affixes(module.get_sets_from_page(soup))

    assert sets['Example Set'][0]['threshold'] == 3
    assert {'name': 'Potency', 'type': 'Artifact', 'value': '20'} in [
        {key: affix[key] for key in ('name', 'type', 'value')} for affix in sets['Example Set'][0]['affixes']
    ]
