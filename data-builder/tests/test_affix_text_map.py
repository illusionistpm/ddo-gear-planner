from bs4 import BeautifulSoup
import pytest

from parse_affixes_from_cell import get_text_map_from_tag, convert_affix_text_map_to_affix_map


def test_get_text_map_with_tooltip():
    html = '<li><span class="has_tooltip">Search <span class="tooltip">+1 Insight bonus to Search</span></span></li>'
    li = BeautifulSoup(html, 'html.parser').li
    tm = get_text_map_from_tag(li)
    assert 'text' in tm and 'tooltip' in tm
    assert tm['text'].startswith('Search')
    assert '+1 Insight' in tm['tooltip']


def test_convert_affix_text_map_artifact():
    tm = {'text': 'Artifact Universal Spell Power +20', 'tooltip': ''}
    am = convert_affix_text_map_to_affix_map(tm)
    assert am['name'] == 'Universal Spell Power'
    assert am['type'] == 'Artifact'
    assert am['value'] == '20'


def test_convert_affix_text_map_roman_numeral_and_tooltip_value():
    # Roman numeral in text but numeric value in tooltip
    tm = {'text': 'Insightful Spell Power V', 'tooltip': '+10% Insight bonus to Spell Power'}
    am = convert_affix_text_map_to_affix_map(tm)
    assert am['name'] == 'Spell Power'
    assert am['type'] == 'Insight'
    assert am['value'] == '10'


@pytest.mark.parametrize(
    'text_map,expected',
    [
        (
            {'text': '+2% Artifact Bonus to Missile Deflection', 'tooltip': ''},
            {'name': 'Missile Deflection', 'type': 'Artifact', 'value': '2'},
        ),
        (
            {'text': 'Insightful Natural Armor Bonus +5', 'tooltip': ''},
            {'name': 'Armor Class', 'type': 'Insight', 'value': '5'},
        ),
        (
            {'text': 'Shield Armor Class +9', 'tooltip': ''},
            {'name': 'Armor Class', 'type': 'Untyped Shield', 'value': '9'},
        ),
        (
            {'text': 'Ghostly', 'tooltip': ''},
            {'name': 'Ghostly', 'type': 'Bool', 'value': 1},
        ),
        (
            {'text': 'Once every three seconds when you take damage', 'tooltip': ''},
            {'name': 'Once every three seconds when you take damage', 'type': 'Untyped', 'value': 1},
        ),
        (
            {'text': 'Combustion +32', 'tooltip': 'This grants a +32 Enhancement bonus to Fire Spell Power.'},
            {'name': 'Combustion', 'type': 'Enhancement', 'value': '32'},
        ),
    ],
)
def test_convert_affix_text_map_parameterized_quality_fixtures(text_map, expected):
    assert convert_affix_text_map_to_affix_map(text_map.copy()) == expected


def test_convert_affix_text_map_can_include_debug_provenance(monkeypatch):
    monkeypatch.setenv('DDO_AFFIX_PROVENANCE', '1')
    am = convert_affix_text_map_to_affix_map({
        'text': 'Artifact Universal Spell Power +20',
        'tooltip': '+20 Artifact bonus to Universal Spell Power',
    })
    assert am['sourceText'] == 'Artifact Universal Spell Power +20'
    assert am['sourceTooltip'] == '+20 Artifact bonus to Universal Spell Power'
    assert am['parserSource'] == 'convert_affix_text_map_to_affix_map'
