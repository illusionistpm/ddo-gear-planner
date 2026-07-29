from bs4 import BeautifulSoup

from parse_affixes_from_cell import get_affix_map_list_from_tag


def test_get_affix_map_list_from_tag():
    html = '<ul><li>Accuracy +2</li><li><span class="has_tooltip">Search <span class="tooltip">+1 Insight bonus to Search</span></span></li></ul>'
    ul = BeautifulSoup(html, 'html.parser').ul
    res = get_affix_map_list_from_tag(ul)
    assert isinstance(res, list)
    assert any(a['name'] == 'Search' for a in res)
    assert any(a['name'].startswith('Accuracy') for a in res)
