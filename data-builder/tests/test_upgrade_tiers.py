import json
import os

import pytest
from bs4 import BeautifulSoup

from parse_items import add_upgrade_tier_options, keep_best_of_each_bonus
from parse_vota_items import get_vota_enchantment_cells_from_page, is_vota_placeholder
from upgrade_tiers import UPGRADE_TIER_SYSTEM, get_upgrade_entry, has_tier_markers, own_text, split_upgrade_tiers


def effect(name):
    return f'<span class="popup has_tooltip"><a href="/page/{name}">{name}</a><span class="popup tooltip">{name}: tip</span></span>'


def marker(tier):
    return effect(f'Upgradeable - Tier {tier}')


def cell(html):
    return BeautifulSoup(f'<td>{html}</td>', 'html.parser').td


def own_texts(entries):
    return [own_text(entry) for entry in entries]


# Vaults of the Artificers: each tier's entries nest under its marker.
VOTA_CELL = f'''<ul>
  <li>{marker(1)}<ul>
    <li>{effect('Seeker +9')}</li>
    <li>{effect('Ethereal')}</li>
  </ul></li>
  <li>{marker(2)}<ul>
    <li>{effect('Seeker +9')} → {effect('Seeker +10')}</li>
    <li>Adds {effect('Colorless Augment Slot')}</li>
  </ul></li>
  <li>{marker(3)}<ul>
    <li>Adds {effect('Deception +8')}</li>
  </ul></li>
</ul>'''

# Treasure of Crystal Cove: Tier 1 is flat, the later tiers nest in its last entry.
CRYSTAL_COVE_CELL = f'''<ul>
  <li>{marker(1)}</li>
  <li>{effect('+3 Enhancement Bonus')}</li>
  <li>{effect('Resistance +3')}<ul>
    <li>{marker(2)}<ul><li>{effect('+3 Enhancement Bonus')} → {effect('+4 Enhancement Bonus')}</li></ul></li>
    <li>{marker(3)}<ul><li>Adds {effect('Blue Augment Slot')}</li></ul></li>
  </ul></li>
</ul>'''


def test_vota_layout_splits_into_the_dropped_item_and_each_upgrade():
    base, upgrades = split_upgrade_tiers(cell(VOTA_CELL))

    assert own_texts(base) == ['Seeker +9', 'Ethereal']
    assert [tier for tier, _ in upgrades] == [2, 3]
    assert own_texts(get_upgrade_entry(entry) for entry in upgrades[0][1]) == ['Seeker +10', 'Colorless Augment Slot']
    assert own_texts(get_upgrade_entry(entry) for entry in upgrades[1][1]) == ['Deception +8']


def test_crystal_cove_layout_keeps_its_last_tier_1_entry_without_the_nested_tiers():
    base, upgrades = split_upgrade_tiers(cell(CRYSTAL_COVE_CELL))

    assert own_texts(base) == ['+3 Enhancement Bonus', 'Resistance +3']
    assert [(tier, own_texts(get_upgrade_entry(entry) for entry in entries)) for tier, entries in upgrades] == [
        (2, ['+4 Enhancement Bonus']),
        (3, ['Blue Augment Slot']),
    ]


def test_a_single_marker_only_labels_the_item():
    trinket = cell(f'<ul><li>{marker(2)}</li><li>{effect("Seeker +2")}</li></ul>')

    base, upgrades = split_upgrade_tiers(trinket)

    assert own_texts(base) == ['Seeker +2']
    assert upgrades == []


def test_a_choice_list_inside_a_tier_is_kept_whole():
    choice = cell(f'''<ul><li>{marker(1)}<ul>
      <li>One of the following:<ul><li>{effect('Fire Resistance +10')}</li><li>{effect('Cold Resistance +10')}</li></ul></li>
    </ul></li></ul>''')

    base, upgrades = split_upgrade_tiers(choice)

    assert len(base) == 1 and base[0].find('ul') is not None
    assert upgrades == []


def test_only_cells_with_markers_have_tiers():
    assert has_tier_markers(cell(VOTA_CELL))
    assert not has_tier_markers(cell(f'<ul><li>{effect("Seeker +2")}</li></ul>'))


def test_upgrade_options_accumulate_and_keep_the_best_of_each_bonus():
    crafting = {}
    item = {'name': 'Ring', 'slot': 'Ring', 'type': 'Finger items', 'ml': 20, 'affixes': []}
    seeker = lambda value: {'name': 'Seeker', 'type': 'Enhancement', 'value': value}
    deception = {'name': 'Deception', 'type': 'Enhancement', 'value': '8'}

    add_upgrade_tier_options(crafting, item, [(2, [seeker('10')]), (3, [seeker('11'), deception])])

    assert crafting[UPGRADE_TIER_SYSTEM]['Ring'] == [
        {'name': 'Tier 2', 'affixes': [seeker('10')]},
        {'name': 'Tier 3', 'affixes': [seeker('11'), deception]},
    ]
    assert item['crafting'] == [UPGRADE_TIER_SYSTEM]


def test_upgrade_options_name_an_enhancement_bonus_for_the_item():
    crafting = {}
    item = {'name': 'Sword', 'slot': 'Weapon', 'type': 'Short Swords', 'ml': 20, 'affixes': []}

    add_upgrade_tier_options(crafting, item, [(2, [{'name': 'Enhancement Bonus', 'type': 'Enhancement', 'value': '+6'}])])

    assert crafting[UPGRADE_TIER_SYSTEM]['Sword'][0]['affixes'][0]['name'] == 'Enhancement Bonus (Weapon)'


def test_an_item_whose_upgrades_add_only_slots_gets_no_tier_choice():
    crafting = {}
    item = {'name': 'Boots', 'slot': 'Boots', 'type': 'Feet items', 'ml': 20, 'affixes': []}

    add_upgrade_tier_options(crafting, item, [(2, []), (3, [])])

    assert crafting == {}
    assert 'crafting' not in item


def test_keep_best_of_each_bonus_compares_name_and_type():
    affixes = [
        {'name': 'Seeker', 'type': 'Enhancement', 'value': '10'},
        {'name': 'Seeker', 'type': 'Insight', 'value': '2'},
        {'name': 'Seeker', 'type': 'Enhancement', 'value': '11'},
    ]

    assert keep_best_of_each_bonus(affixes) == [affixes[2], affixes[1]]


def test_vota_category_page_maps_each_item_to_its_enchantments():
    page = BeautifulSoup(f'''<div id="mw-content-text"><table>
      <tr><th>Item</th><th>Type</th><th>Enhancements</th><th>ML</th></tr>
      <tr><td><a href="/page/Item:Epic_Ring">Epic Ring</a></td><td>Ring</td><td>{VOTA_CELL}</td><td>20</td></tr>
    </table></div>''', 'html.parser')

    cells = get_vota_enchantment_cells_from_page(page)

    assert list(cells) == ['Epic Ring']
    assert has_tier_markers(cells['Epic Ring'])


def test_vota_placeholder_is_the_bare_cell_text():
    assert is_vota_placeholder(cell('<p>VotAU\n</p>'))
    assert not is_vota_placeholder(cell(VOTA_CELL))


def _load(name):
    with open(os.path.join(os.path.dirname(__file__), '..', '..', 'data', f'{name}.json'), encoding='utf-8') as file:
        return json.load(file)


@pytest.mark.committed_data
def test_committed_items_carry_no_upgrade_placeholders():
    leftovers = [
        (item['name'], affix['name'])
        for item in _load('items')
        for affix in item['affixes']
        if affix['name'] in ('VotAU', 'Upgradeable - Tier')
    ]
    assert leftovers == []


@pytest.mark.committed_data
def test_committed_epic_ring_of_the_stalker_upgrades_through_its_tiers():
    """Issue #51."""
    ring = next(item for item in _load('items') if item['name'] == 'Epic Ring of the Stalker')
    tiers = _load('crafting')[UPGRADE_TIER_SYSTEM]['Epic Ring of the Stalker']

    def values(affixes):
        return {(affix['name'], affix['type']): affix['value'] for affix in affixes}

    assert values(ring['affixes'])[('Seeker', 'Enhancement')] == '9'
    assert {'Upgrade Tier', 'Colorless Augment Slot', 'Green Augment Slot'} <= set(ring['crafting'])
    assert [tier['name'] for tier in tiers] == ['Tier 2', 'Tier 3']
    assert values(tiers[0]['affixes'])[('Seeker', 'Enhancement')] == '10'
    assert values(tiers[1]['affixes'])[('Seeker', 'Enhancement')] == '11'
