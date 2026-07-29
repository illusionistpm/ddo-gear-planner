from bs4 import BeautifulSoup

from parse_affixes_from_cell import get_text_map_from_tag, convert_affix_text_map_to_affix_map, translate_list_tag_to_affix_map, get_fake_bonuses


def test_get_text_map_without_tooltip():
    html = '<li>Accuracy +2</li>'
    li = BeautifulSoup(html, 'html.parser').li
    tm = get_text_map_from_tag(li)
    assert 'text' in tm and 'tooltip' not in tm


def test_percentage_name_appends_percent():
    tm = {'text': 'Armor Class +5%', 'tooltip': ''}
    am = convert_affix_text_map_to_affix_map(tm)
    assert am['name'].startswith('Armor Class')


def test_once_every_parses_as_untyped_bool():
    tm = {'text': 'Once every three seconds when you take damage', 'tooltip': ''}
    am = convert_affix_text_map_to_affix_map(tm)
    assert am['type'] == 'Untyped'
    assert am['value'] == 1


def test_translate_list_tag_detects_unique_property_required():
    html = '<li>Special Effect (if Quarterstaff)</li>'
    li = BeautifulSoup(html, 'html.parser').li
    aff = translate_list_tag_to_affix_map('Test Item', li, {}, get_fake_bonuses(), 10, {}, {})
    assert 'uniquePropertyRequired' in aff
    assert aff['uniquePropertyRequired'] == 'Quarterstaff' or ('requireQuarterstaff' in aff.get('uniquePropertyRequired', {}))
