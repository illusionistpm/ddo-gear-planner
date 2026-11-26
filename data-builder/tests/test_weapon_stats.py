from bs4 import BeautifulSoup

from weapon_stats import get_type_critical_profiles_from_page, item_type_name, normalize_critical, parse_critical_profile, parse_damage


def test_parse_damage_reads_the_multiplier_and_dice():
    assert parse_damage('5.80[1d8+2] + 15 Slash, Magic') == {'w': 5.8, 'dice': '1d8+2'}
    assert parse_damage('4[2d6] + 7 Pierce, Bludgeon') == {'w': 4.0, 'dice': '2d6'}


def test_parse_damage_takes_a_bare_bracket_as_one_w():
    assert parse_damage('[1d10] + 1 Slash, Magic') == {'w': 1.0, 'dice': '1d10'}
    # One row on the wiki drops the brackets.
    assert parse_damage('1d12 + 5 Slash, Magic') == {'w': 1.0, 'dice': '1d12'}


def test_parse_damage_drops_a_zero_dice_bonus_and_rejects_no_dice():
    assert parse_damage('2.5[1d6+0] + 3 Slash') == {'w': 2.5, 'dice': '1d6'}
    assert parse_damage('[1] + 0 Bludgeon') is None
    assert parse_damage('') is None


def test_critical_profiles_are_normalized():
    assert normalize_critical('17-20 / x2') == '17-20/x2'
    assert normalize_critical('20/x3') == '20/x3'
    assert parse_critical_profile('Critical Profile: 15-20 / x2 Damage Modifier: STR') == '15-20/x2'
    assert parse_critical_profile('Damage Modifier: WIS Attack Modifier: WIS') is None


def test_type_names_match_the_item_pages():
    assert item_type_name('Long Sword') == 'Long Swords'
    assert item_type_name('Khopesh') == 'Khopeshes'
    assert item_type_name('Unarmed') == 'Handwraps'


def test_type_critical_profiles_come_from_the_basic_weapons_table():
    soup = BeautifulSoup('''<table class="wikitable">
      <tr><th>Weapon</th><th>Cost</th><th>Damage</th><th>Critical Profile</th></tr>
      <tr><td>Long Sword</td><td>15 gp</td><td>1d8 Slash</td><td>19-20/x2</td></tr>
      <tr><td>Composite Longbow</td><td>100 gp</td><td>1d8 Pierce</td><td>20/x3</td></tr>
      <tr><td>Heavy Pick</td><td>8 gp</td><td>1d6 Pierce</td><td>20/x4</td></tr>
    </table>''', 'html.parser')
    assert get_type_critical_profiles_from_page(soup) == {'Long Swords': '19-20/x2', 'Heavy Picks': '20/x4'}
