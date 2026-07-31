from bs4 import BeautifulSoup

from parse_affixes_from_cell import get_affix_map_list_from_tag


def test_get_affix_map_list_from_tag():
    html = '<ul><li>Accuracy +2</li><li><span class="has_tooltip">Search <span class="tooltip">+1 Insight bonus to Search</span></span></li></ul>'
    ul = BeautifulSoup(html, 'html.parser').ul
    res = get_affix_map_list_from_tag(ul)
    assert isinstance(res, list)
    assert any(a['name'] == 'Search' for a in res)
    assert any(a['name'].startswith('Accuracy') for a in res)


def test_get_affix_map_list_from_tag_splits_multiple_tooltips_in_one_li():
    html = '''
    <ul>
      <li>
        <span class="popup has_tooltip"> Evocation Focus II
          <span class="popup tooltip"> Evocation Focus II: +2 Equipment bonus to the DC of Evocation spells.</span>
        </span>,
        <span class="popup has_tooltip">Kinetic Lore V
          <span class="popup tooltip">Kinetic Lore V: Passive: Your Force, Physical and Untyped spells gain a 15% Equipment bonus to their chance to critical hit.</span>
        </span>
      </li>
    </ul>
    '''
    ul = BeautifulSoup(html, 'html.parser').ul
    assert get_affix_map_list_from_tag(ul) == [
        {'name': 'Evocation Focus', 'value': '2', 'type': 'Equipment'},
        {'name': 'Kinetic Lore', 'value': '15', 'type': 'Equipment'},
    ]
