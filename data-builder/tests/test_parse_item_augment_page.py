import parse_item_augment_page
from parse_item_augment_page import expand_compound_affixes_from_augment_name


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
