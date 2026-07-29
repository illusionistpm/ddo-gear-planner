from bs4 import BeautifulSoup

from parse_nearly_complete import get_nearly_complete_crafting_from_page
from parse_items import (
    crafting_system_sort_key,
    get_legendary_green_steel_crafting_systems,
    specialize_nearly_complete_crafting_for_item,
)


def test_parse_nearly_complete_crafting_table():
    html = '''
    <table class="wikitable">
      <tr>
        <th>Effect set</th>
        <th>Available upgrades (Heroic)</th>
        <th>Available upgrades (Legendary)</th>
      </tr>
      <tr>
        <td>Ability Score</td>
        <td>
          <ul>
            <li><span class="has_tooltip">Strength +6<span class="tooltip">granting a +6 Enhancement bonus to Strength.</span></span></li>
          </ul>
        </td>
        <td>
          <ul>
            <li><span class="has_tooltip">Strength +15<span class="tooltip">granting a +15 Enhancement bonus to Strength.</span></span></li>
          </ul>
        </td>
      </tr>
      <tr>
        <td>Skill</td>
        <td>
          <ul>
            <li><span class="has_tooltip">Charisma Skills - Exceptional Bonus +6<span class="tooltip">Passive +6 Exceptional bonus to Charisma based skills.</span></span></li>
          </ul>
        </td>
        <td>
          <ul>
            <li><span class="has_tooltip">Charisma Skills - Exceptional Bonus +11<span class="tooltip">Passive +11 Exceptional bonus to Charisma based skills.</span></span></li>
          </ul>
        </td>
      </tr>
    </table>
    '''

    systems = get_nearly_complete_crafting_from_page(BeautifulSoup(html, 'html.parser'))

    ability_options = systems['Nearly Complete: Ability Score']['*']
    assert ability_options[0]['affixes'][0] == {'name': 'Strength', 'value': '6', 'type': 'Enhancement'}
    assert ability_options[0]['ml'] == 11
    assert ability_options[1]['affixes'][0] == {'name': 'Strength', 'value': '15', 'type': 'Enhancement'}
    assert ability_options[1]['ml'] == 35

    skill_options = systems['Nearly Complete: Skill']['*']
    assert skill_options[0]['affixes'][0] == {'name': 'Charisma Skills', 'value': '6', 'type': 'Exceptional'}
    assert skill_options[1]['affixes'][0] == {'name': 'Charisma Skills', 'value': '11', 'type': 'Exceptional'}


def test_specialize_nearly_complete_crafting_for_item_filters_by_item_ml():
    crafting_systems = {
        'Nearly Complete: Ability Score': {
            '*': [
                {'affixes': [{'name': 'Strength', 'value': '6', 'type': 'Enhancement'}], 'ml': 11},
                {'affixes': [{'name': 'Strength', 'value': '15', 'type': 'Enhancement'}], 'ml': 35},
            ],
        },
    }
    item = {
        'name': 'Heroic Nearly Complete Item',
        'ml': 11,
        'type': 'Trinket items',
        'slot': 'Trinket',
        'url': '/page/Item:Heroic_Nearly_Complete_Item',
        'affixes': [],
    }

    specialize_nearly_complete_crafting_for_item(crafting_systems, 'Nearly Complete: Ability Score', item)

    assert crafting_systems['Nearly Complete: Ability Score']['Heroic Nearly Complete Item'] == [
        {'affixes': [{'name': 'Strength', 'value': '6', 'type': 'Enhancement'}]},
    ]


def test_crafting_system_sort_order_puts_named_augments_after_other_systems():
    crafting_systems = [
        'Blue Augment Slot',
        'Nearly Complete: Quality Ability Score',
        'Green Augment Slot',
        'Moon Augment Slot',
        'Cannith: Ring - Prefix',
        'Sun Augment Slot',
        'Colorless Augment Slot',
        'Orange Augment Slot',
        'Yellow Augment Slot',
        'Purple Augment Slot',
        'Red Augment Slot',
    ]

    assert sorted(crafting_systems, key=crafting_system_sort_key) == [
        'Cannith: Ring - Prefix',
        'Nearly Complete: Quality Ability Score',
        'Sun Augment Slot',
        'Moon Augment Slot',
        'Green Augment Slot',
        'Orange Augment Slot',
        'Purple Augment Slot',
        'Red Augment Slot',
        'Yellow Augment Slot',
        'Blue Augment Slot',
        'Colorless Augment Slot',
    ]


def test_get_legendary_green_steel_crafting_systems_uses_weapon_tiers_for_weapons():
    item = {
        'name': 'Legendary Green Steel Longsword',
        'ml': 26,
        'type': 'Long Swords',
        'slot': 'Weapon',
        'url': '/page/Item:Legendary_Green_Steel_Longsword',
        'affixes': [],
    }

    assert get_legendary_green_steel_crafting_systems(item) == [
        'T1 (Weapon)',
        'T2 (Weapon)',
        'T3 (Weapon)',
    ]


def test_get_legendary_green_steel_crafting_systems_uses_equipment_tiers_for_non_weapons():
    item = {
        'name': 'Legendary Green Steel Belt',
        'ml': 26,
        'type': 'Waist items',
        'slot': 'Belt',
        'url': '/page/Item:Legendary_Green_Steel_Belt',
        'affixes': [],
    }

    assert get_legendary_green_steel_crafting_systems(item) == [
        'T1 (Equipment)',
        'T2 (Equipment)',
        'T3 (Equipment)',
    ]
