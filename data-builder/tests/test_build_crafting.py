import build_crafting as module
import parse_slavers as slavers_module
from build_crafting import add_sealed_in_fire_crafting
from parse_slavers import parse_slavers_crafting
from test_parse_slavers import slavers_html


def test_add_sealed_in_fire_crafting_copies_sealed_in_mist_options():
    item_crafting = {
        'Sealed in Mist': {
            '*': [
                {
                    'affixes': [
                        {
                            'name': 'Legendary Dust',
                            'type': 'Bool',
                            'value': 1,
                        },
                    ],
                },
            ],
        },
    }

    add_sealed_in_fire_crafting(item_crafting)

    assert item_crafting['Sealed in Fire'] == item_crafting['Sealed in Mist']
    assert item_crafting['Sealed in Fire'] is not item_crafting['Sealed in Mist']


def test_build_crafting_does_not_synthesize_names_for_synonymized_affixes(monkeypatch):
    written = {}

    monkeypatch.setattr(module, 'get_inverted_synonym_map', lambda: {'Devotion': 'Positive Spell Power'})
    monkeypatch.setattr(module, 'parse_nearly_complete_crafting', lambda: {})
    monkeypatch.setattr(module, 'parse_slavers_crafting', lambda: {
        "Legendary Slaver's Suffix Slot": {
            '*': [
                {'affixes': [{'name': 'Devotion', 'type': 'Equipment', 'value': 142}]},
            ],
        },
    })
    monkeypatch.setattr(module, 'get_item_crafting', lambda: {})
    monkeypatch.setattr(module.json, 'load', lambda _: {})
    monkeypatch.setattr(module, 'write_json', lambda data, name: written.setdefault(name, data))

    module.build_crafting()

    option = written['crafting']["Legendary Slaver's Suffix Slot"]['*'][0]
    assert option == {'affixes': [{'name': 'Positive Spell Power', 'type': 'Equipment', 'value': 142}]}


def test_slavers_radiance_spell_power_is_not_radiance_lore(monkeypatch):
    monkeypatch.setattr(slavers_module, 'load_slavers_crafting_soup', slavers_html)

    slavers = parse_slavers_crafting()

    heroic_suffixes = slavers["Slaver's Suffix Slot"]['*']
    legendary_suffixes = slavers["Legendary Slaver's Suffix Slot"]['*']

    assert {'affixes': [{'name': 'Radiance Lore', 'type': 'Equipment', 'value': 10}]} in heroic_suffixes
    assert {'affixes': [{'name': 'Radiance', 'type': 'Equipment', 'value': 70}]} in heroic_suffixes
    assert {'affixes': [{'name': 'Radiance Lore', 'type': 'Equipment', 'value': 21}]} in legendary_suffixes
    assert {'affixes': [{'name': 'Radiance', 'type': 'Equipment', 'value': 142}]} in legendary_suffixes
