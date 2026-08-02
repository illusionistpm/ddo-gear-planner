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


def test_get_affix_map_list_from_tag_parses_sacred_turn_undead_bonus():
    html = '''
    <ul>
      <li>
        <span class="has_tooltip">Sacred +10
          <span class="tooltip">Sacred +10: An item with this quality assists only wearers who have the ability to turn undead. Sacred items provide an +10 Enhancement bonus to your effective level for Turning Undead.</span>
        </span>
      </li>
    </ul>
    '''
    ul = BeautifulSoup(html, 'html.parser').ul
    assert get_affix_map_list_from_tag(ul) == [
        {'name': 'Turn Undead', 'type': 'Enhancement', 'value': '10'},
    ]


def test_get_affix_map_list_from_tag_parses_negative_enhancement_bonus():
    html = '''
    <ul>
      <li>
        <span class="has_tooltip">-1 Enhancement Bonus
          <span class="tooltip">-1 Enhancement Bonus: This weapon is less well-made than normal, giving a -1 penalty to attack and damage rolls.</span>
        </span>
      </li>
    </ul>
    '''
    ul = BeautifulSoup(html, 'html.parser').ul
    assert get_affix_map_list_from_tag(ul) == [
        {'name': 'Enhancement Bonus', 'type': 'Enhancement', 'value': '-1'},
    ]


def test_get_affix_map_list_from_tag_canonicalizes_spell_power_name():
    html = '''
    <ul>
      <li>
        <span class="has_tooltip">Glaciation +53
          <span class="tooltip">Glaciation +53: Passive: +53 Equipment bonus to Cold Spell Power.</span>
        </span>
      </li>
    </ul>
    '''
    ul = BeautifulSoup(html, 'html.parser').ul
    assert get_affix_map_list_from_tag(ul) == [
        {'name': 'Cold Spell Power', 'value': '53', 'type': 'Equipment'},
    ]
