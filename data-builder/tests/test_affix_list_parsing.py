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


def test_get_affix_map_list_from_tag_skips_timed_stacking_proc_with_multiple_tooltips():
    html = '''
    <ul>
      <li>
        <span class="has_tooltip">Efficient Metamagic - Empower IV
          <span class="tooltip">Efficient Metamagic - Empower IV: The additional spell point cost for using the Empower Metamagic feat is reduced by 4 SP.</span>
        </span>
      </li>
      <li>Once every three seconds when you take physical damage, you get
        <span class="has_tooltip">Psionic Universal Spell Power +8
          <span class="tooltip">Psionic Universal Spell Power +8: Passive: +8 Psionic bonus to Universal Spell Power.</span>
        </span>. This can stack up to three times (up to
        <span class="has_tooltip">Psionic Universal Spell Power +24
          <span class="tooltip">Psionic Universal Spell Power +24: Passive: +24 Psionic bonus to Universal Spell Power.</span>
        </span>) and each stack lasts for 20 seconds.
      </li>
    </ul>
    '''
    ul = BeautifulSoup(html, 'html.parser').ul
    assert get_affix_map_list_from_tag(ul) == [
        {'name': 'Efficient Metamagic - Empower', 'value': '4', 'type': 'Enhancement'},
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


DICE_TOOLTIP_LI = '''
<li>
  <span class="has_tooltip">Freezing
    <span class="tooltip">Freezing: This weapon deals cold damage on each hit.</span>
  </span>
  <span class="has_tooltip">6d6
    <span class="tooltip">Average 21</span>
  </span>
  <span class="has_tooltip">7d20+72
    <span class="tooltip">Average 145.5</span>
  </span>
</li>
'''


def test_get_affix_map_list_from_tag_drops_bare_dice_tooltips():
    ul = BeautifulSoup(f'<ul>{DICE_TOOLTIP_LI}</ul>', 'html.parser').ul
    assert [a['name'] for a in get_affix_map_list_from_tag(ul)] == ['Freezing']


def test_translate_list_tag_drops_bare_dice_tooltips():
    from parse_affixes_from_cell import translate_list_tag_to_affix_map, get_fake_bonuses

    li = BeautifulSoup(DICE_TOOLTIP_LI, 'html.parser').li
    res = translate_list_tag_to_affix_map('Test Item', li, {}, get_fake_bonuses(), 10, {}, {})
    assert [a['name'] for a in res] == ['Freezing']


def test_is_bare_dice_text():
    from parse_affixes_from_cell import is_bare_dice_text

    for text in ['6d6', '+2d4', ' 17d10 ', '7d20+72', '3d4 + 3']:
        assert is_bare_dice_text(text), text
    for text in ['Freezing', 'Acidic 12d6', '12d120 Acid damage on vorpal hit', '', None]:
        assert not is_bare_dice_text(text), text
