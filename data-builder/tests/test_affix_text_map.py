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
