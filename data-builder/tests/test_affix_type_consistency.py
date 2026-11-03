"""An affix name means one effect, so its bonus types have to be comparable.

Bool next to a typed value for the same name is always a parse problem: an
unnumbered variant (often an older enchantment) fell through to the Bool
catch-all, and the planner then lists "Bool" among that affix's bonus types.
Untyped next to typed values (the planner also shows a missing type as Untyped)
is usually one too, so the exceptions are listed by name.
"""
import json
import os
from collections import defaultdict

import pytest
from bs4 import BeautifulSoup

from parse_affixes_from_cell import convert_affix_text_map_to_affix_map, get_fake_bonuses, translate_list_tag_to_affix_map


def _li(label, tooltip):
    return (
        f'<li><span class="has_tooltip">{label}'
        f'<span class="tooltip"><b>{label}:</b> {tooltip}</span></span></li>'
    )


def _translate(html):
    li = BeautifulSoup(html, 'html.parser').li
    return translate_list_tag_to_affix_map('Test Item', li, {}, get_fake_bonuses(), 10, {}, {})


@pytest.mark.parametrize('html,expected', [
    # Plain Deception is Improved Deception at +3, not the sneak attack bonus.
    (
        _li('Deception', 'This weapon is hard to focus upon and thus provides a +3 enhancement bonus to Bluff checks. '
                         'In addition, Deception weapons have a small chance to envelop the target in darkness, '
                         'making them vulnerable to sneak attacks for a short time.'),
        {'name': 'Improved Deception', 'type': 'Enhancement', 'value': '3'},
    ),
    (
        _li('Deception III', '5% Chance on Hit: Your target becomes Bluffed for four seconds. On sneak attack: '
                             '+3 to Attack Rolls, +6 to Damage.'),
        {'name': 'Deception', 'type': 'Enhancement', 'value': '3'},
    ),
    # The tooltip's heading links the affix's own page, which isn't a bonus type.
    (
        '<li><span class="has_tooltip"><a title="Sneak Attack Bonus">Sneak Attack Bonus +2</a>'
        '<span class="tooltip"><b><a title="Sneak Attack Bonus">Sneak Attack Bonus +2</a></b> : Provides a +2 '
        'Enhancement modifier to your attack bonus and a +3 Enhancement bonus to damage for any attack that would '
        'qualify as a Sneak Attack, even if the wielder is not a Rogue.</span></span></li>',
        {'name': 'Sneak Attack Bonus', 'type': 'Enhancement', 'value': '2'},
    ),
    (
        _li('Finesse', "This weapon has a Small air elemental bound to it. The wielder can use a finesse weapon as if "
                       "he had the Weapon Finesse feat. In addition, the weapon grants a +2 enhancement bonus to the "
                       "wielder's Dexterity score."),
        {'name': 'Finesse', 'type': 'Enhancement', 'value': '2'},
    ),
    (
        _li('Finesse +13', "This weapon has a Small air elemental bound to it. In addition, the weapon grants a +13 "
                           "enhancement bonus to the wielder's Dexterity score."),
        {'name': 'Finesse', 'type': 'Enhancement', 'value': '13'},
    ),
    (
        _li('Protection from Evil', 'Passive: You gain the benefit of the spell Protection from Evil.'),
        {'name': 'Protection from Evil', 'type': 'Deflection', 'value': '2'},
    ),
    # Procs are Bool whether or not the wiki numbers them, like the other Guards.
    (
        _li('Sonic Guard +3', 'Chance to deal 3d8 Sonic damage when hit.'),
        {'name': 'Sonic Guard', 'type': 'Bool', 'value': 1},
    ),
    (
        _li('Thorn Guard +4', 'When you are hit or missed in combat, this item has a chance to deal 4d8 Piercing damage on hit.'),
        {'name': 'Thorn Guard', 'type': 'Bool', 'value': 1},
    ),
    (
        _li('Undead Guard +2', 'Chance to deal 2d8 Good damage to undead when hit.'),
        {'name': 'Undead Guard', 'type': 'Bool', 'value': 1},
    ),
    (
        _li('Wild Frenzy +50', 'On an attack roll of 20 which is confirmed as a critical hit the target will go wild '
                               'and attack its own allies for 15 seconds if it fails a DC 50 Will save.'),
        {'name': 'Wild Frenzy', 'type': 'Bool', 'value': 1},
    ),
    (
        _li('Improved Bashing X', 'On Shield Bash : +5d4 Bludgeoning damage.'),
        {'name': 'Improved Bashing', 'type': 'Bool', 'value': 1},
    ),
    # Different effects from the typed affix of the same name.
    (
        _li('Underwater Action', 'This item grants the wearer the ability to breathe water as if it were air.'),
        {'name': 'Water Breathing', 'type': 'Bool', 'value': 1},
    ),
    (
        _li('Riposte', 'When its wearer is successfully attacked in melee, this shield occasionally allows him or her '
                       'to make an immediate counterattack, dealing bludgeoning damage to the offending enemy.'),
        {'name': 'Riposte (enchantment)', 'type': 'Bool', 'value': 1},
    ),
    (
        _li('Distant Incite +23', '+23% bonus to increased threat generation from ranged damage'),
        {'name': 'Distant Incite', 'type': 'Enhancement', 'value': '23'},
    ),
])
def test_item_row_variants_parse_like_their_typed_affix(html, expected):
    assert _translate(html) == expected


def test_item_row_drops_a_charge_tier_with_no_tier():
    # Coronach (historic)
    assert _translate('<li>Maximum Charge Tier:</li>') == []


@pytest.mark.parametrize('text_map,expected', [
    (
        {'text': 'Radiance', 'tooltip': 'Radiance : This weapon is imbued with a brilliant, radiant power that deals an '
                                        'additional 4d6 light damage and blinds the target on a successful critical hit.'},
        {'name': 'Radiance (enchantment)', 'type': 'Bool', 'value': 1},
    ),
    ({'text': 'Underwater Action'}, {'name': 'Water Breathing', 'type': 'Bool', 'value': 1}),
    (
        {'text': 'Improved Bashing', 'tooltip': 'Improved Bashing : This shield does an additional 2d6 damage when used to shield bash.'},
        {'name': 'Improved Bashing', 'type': 'Bool', 'value': 1},
    ),
])
def test_text_map_variants_parse_like_their_typed_affix(text_map, expected):
    affix = convert_affix_text_map_to_affix_map(text_map)
    assert {key: affix[key] for key in ('name', 'type', 'value')} == expected


# Untyped alongside typed values that is right, with why.
UNTYPED_WITH_TYPED = {
    # Set bonuses: "+N additional Rage/Greater Dragonmark Charges after resting"
    # stacks with the items' Enhancement bonus to the same charges.
    'Greater Dragonmark Charges',
    'Rage Charges',
}


def _load(name):
    with open(os.path.join(os.path.dirname(__file__), '..', '..', 'data', f'{name}.json'), encoding='utf-8') as file:
        return json.load(file)


def _collect_affix_types(node, types):
    if isinstance(node, dict):
        # A set entry names its set rather than being an affix of its own.
        if isinstance(node.get('name'), str) and 'value' in node and 'set' not in node:
            types[node['name']].add(node.get('type') or 'Untyped')
        for child in node.values():
            _collect_affix_types(child, types)
    elif isinstance(node, list):
        for child in node:
            _collect_affix_types(child, types)


def _essence_affix_types(essence, types):
    # Mirrors EssenceCraftingService: an option's affix is renamed through
    # "affixes", Insightful options are Insight, and anything else takes the
    # affix's entry in bonusTypes, defaulting to Enhancement.
    renamed = essence.get('affixes', {})
    for option in essence['progression']:
        affixes = renamed.get(option, option)
        for affix in affixes if isinstance(affixes, list) else [affixes]:
            if option.startswith('Insightful'):
                types[affix.replace('Insightful ', '')].add('Insight')
            else:
                types[affix].add(essence['bonusTypes'].get(affix, 'Enhancement'))


def _committed_affix_types():
    types = defaultdict(set)
    for name in ('items', 'crafting', 'sets'):
        _collect_affix_types(_load(name), types)
    _essence_affix_types(_load('essence-crafting'), types)
    return types


@pytest.mark.committed_data
def test_committed_data_has_no_affix_that_is_bool_and_typed():
    mixed = {
        name: sorted(types)
        for name, types in _committed_affix_types().items()
        if 'Bool' in types and len(types) > 1
    }
    assert mixed == {}


@pytest.mark.committed_data
def test_committed_data_has_untyped_alongside_typed_only_where_expected():
    mixed = {
        name
        for name, types in _committed_affix_types().items()
        if 'Untyped' in types and types - {'Untyped', 'Bool'}
    }
    # Exact, so an exception that stops applying is taken off the list.
    assert mixed == UNTYPED_WITH_TYPED
