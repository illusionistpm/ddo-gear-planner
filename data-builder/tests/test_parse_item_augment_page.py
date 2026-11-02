from bs4 import BeautifulSoup

import parse_item_augment_page
from item_sources import SourceResolver
from parse_item_augment_page import expand_compound_affixes_from_augment_name, get_item_augments_from_page


def test_expand_compound_affixes_from_augment_name_uses_curated_compound(monkeypatch):
    monkeypatch.setattr(parse_item_augment_page, 'expand_single_affix', lambda affix: [
        {'name': 'Speed', 'type': 'Enhancement', 'value': 30},
        {'name': 'Melee Alacrity', 'type': 'Enhancement', 'value': affix['value']},
        {'name': 'Ranged Alacrity', 'type': 'Enhancement', 'value': affix['value']},
    ] if affix['name'] == 'Swiftness' else [affix])
    crafting_entry = {
        'name': 'Topaz of Swiftness 15%',
        'affixes': {
            'Speed': {
                'name': 'Speed',
                'type': 'Enhancement',
                'value': '30',
            },
        },
    }

    expand_compound_affixes_from_augment_name(crafting_entry)

    assert crafting_entry['affixes'] == {
        'Swiftness': {
            'name': 'Swiftness',
            'type': 'Enhancement',
            'value': '15',
        },
    }


def test_expand_compound_affixes_from_augment_name_ignores_non_compounds(monkeypatch):
    monkeypatch.setattr(parse_item_augment_page, 'expand_single_affix', lambda affix: [affix])
    crafting_entry = {
        'name': 'Topaz of Striding 30%',
        'affixes': {
            'Speed': {
                'name': 'Speed',
                'type': 'Enhancement',
                'value': '30',
            },
        },
    }

    expand_compound_affixes_from_augment_name(crafting_entry)

    assert crafting_entry['affixes'] == {
        'Speed': {
            'name': 'Speed',
            'type': 'Enhancement',
            'value': '30',
        },
    }


def test_expand_compound_affixes_from_augment_name_preserves_parsed_parent_type(monkeypatch):
    monkeypatch.setattr(parse_item_augment_page, 'expand_single_affix', lambda affix: [
        {'name': 'Fortitude Save', 'type': affix['type'], 'value': affix['value']},
        {'name': 'Reflex Save', 'type': affix['type'], 'value': affix['value']},
        {'name': 'Will Save', 'type': affix['type'], 'value': affix['value']},
    ] if affix['name'] == 'Good Luck' else [affix])
    crafting_entry = {
        'name': 'Sapphire of Good Luck +1',
        'affixes': {
            'Good Luck': {
                'name': 'Good Luck',
                'type': 'Luck',
                'value': '1',
            },
        },
    }

    expand_compound_affixes_from_augment_name(crafting_entry)

    assert crafting_entry['affixes'] == {
        'Good Luck': {
            'name': 'Good Luck',
            'type': 'Luck',
            'value': '1',
        },
    }


def augment_page(location_cell, effects='<ul><li>Fortitude Save +1</li></ul>'):
    return BeautifulSoup(f'''
    <div id="bodyContent"><div id="mw-content-text"><div>
      <table class="wikitable">
        <tr><th>Item</th><th>Minimum level</th><th>Augment type</th><th>Enchantments</th><th>Location</th></tr>
        <tr><td>Lunar Gem</td><td>5</td><td>Moon</td><td>{effects}</td>{location_cell}</tr>
      </table>
    </div></div></div>
    ''', 'html.parser')


def test_get_item_augments_from_page_keeps_every_source(monkeypatch):
    monkeypatch.setattr(parse_item_augment_page, 'get_affix_map_list_from_tag', lambda tag: [{'name': 'Fortitude Save', 'type': 'Resistance', 'value': '1'}])
    resolver = SourceResolver({'Book Burning': 'Magic of Myth Drannor', 'Toil and Trouble': 'Tavern Tales'})
    found = []

    augments = get_item_augments_from_page(augment_page('''<td><ul>
        <li><a href="/page/Book_Burning" title="Book Burning">Book Burning</a>, end chest</li>
        <li><a href="/page/Toil_and_Trouble" title="Toil and Trouble">Toil and Trouble</a>, end chest</li>
    </ul></td>'''), resolver, found)

    assert augments['Moon Augment Slot']['*'][0]['quests'] == ['Book Burning', 'Toil and Trouble']
    assert resolver.unresolved == {}


def test_get_item_augments_from_page_variant_copies_keep_their_sources(monkeypatch):
    monkeypatch.setattr(parse_item_augment_page, 'get_affix_map_list_from_tag', lambda tag: [
        {'name': 'Fortitude Save', 'type': 'Resistance', 'value': '1'},
        {'name': 'Artifact Bonus', 'type': 'Artifact', 'value': '1', 'uniquePropertyRequired': {'requireMinorArtifact': True}},
    ])

    augments = get_item_augments_from_page(augment_page('''<td><ul>
        <li><a href="/page/Book_Burning" title="Book Burning">Book Burning</a></li>
        <li><a href="/page/Toil_and_Trouble" title="Toil and Trouble">Toil and Trouble</a></li>
    </ul></td>'''))

    assert augments['Moon Augment Slot (artifact)']['*'][0]['quests'] == ['Book Burning', 'Toil and Trouble']


def test_get_item_augments_from_page_leaves_quests_off_a_sourceless_augment(monkeypatch):
    monkeypatch.setattr(parse_item_augment_page, 'get_affix_map_list_from_tag', lambda tag: [{'name': 'Fortitude Save', 'type': 'Resistance', 'value': '1'}])

    augments = get_item_augments_from_page(augment_page('<td>Random loot</td>'))

    assert 'quests' not in augments['Moon Augment Slot']['*'][0]
