from bs4 import BeautifulSoup
import pytest

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


@pytest.mark.parametrize(
    'html,expected',
    [
        (
            '<li>+5% Quality bonus to Light and Alignment Spell Crit Damage.</li>',
            {'name': 'Light and Alignment Spell Crit Damage', 'type': 'Quality', 'value': '5'},
        ),
        (
            '<li><span class="has_tooltip">Search <span class="tooltip">+1 Insight bonus to Search</span></span></li>',
            {'name': 'Search', 'type': 'Insight', 'value': '1'},
        ),
        (
            '<li>Striding 30%</li>',
            {'name': 'Striding', 'type': 'Enhancement', 'value': '30'},
        ),
        (
            '<li>Deathblock</li>',
            {'name': 'Deathblock', 'type': 'Bool', 'value': 1},
        ),
        (
            '<li><span class="has_tooltip">Ghostly <span class="tooltip">Ghostly: Enemy attacks have a 10% chance to miss you due to incorporeality. You receive a +5 Enhancement bonus to your Hide and Move Silently skills.</span></span></li>',
            {'name': 'Ghostly', 'type': 'Bool', 'value': 1},
        ),
        (
            '<li><span class="has_tooltip">Songblade <span class="tooltip">Songblade: +2 enhancement bonus to the Perform skill.</span></span></li>',
            {'name': 'Perform', 'type': 'Enhancement', 'value': '2'},
        ),
    ],
)
def test_translate_list_tag_parameterized_quality_fixtures(html, expected):
    li = BeautifulSoup(html, 'html.parser').li
    aff = translate_list_tag_to_affix_map('Test Item', li, {}, get_fake_bonuses(), 10, {}, {})
    assert aff == expected


def test_nested_crafting_option_keeps_multiple_affixes_grouped():
    html = '''
    <li>One of the following combinations:
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
    </li>
    '''
    crafting_systems = {}
    aff = translate_list_tag_to_affix_map(
        'Belashyrra Test',
        BeautifulSoup(html, 'html.parser').li,
        {},
        get_fake_bonuses(),
        16,
        crafting_systems,
        {},
    )

    assert aff == {'name': 'One of the following combinations', 'type': 'Bool', 'value': 1}
    assert crafting_systems == {
        'One of the following combinations': {
            'Belashyrra Test': [
                {
                    'affixes': [
                        {'name': 'Evocation Focus', 'value': '2', 'type': 'Equipment'},
                        {'name': 'Kinetic Lore', 'value': '15', 'type': 'Equipment'},
                    ],
                },
            ],
        },
    }


@pytest.mark.parametrize('system_name', ['Sealed in Mist', 'Sealed in Undeath'])
def test_known_tooltip_crafting_system_ignores_embedded_effect_options(system_name):
    html = f'''
    <li>
      <span class="popup has_tooltip">{system_name}
        <span class="popup tooltip">
          <b>{system_name}:</b> This item seethes with a sealed power.
          <br /><br />Effect options:
          <span class="popup has_tooltip">Legendary Salt
            <span class="popup tooltip">Legendary Salt: Your attacks slow your enemies.</span>
          </span>
          <span class="popup has_tooltip">Legendary Ooze
            <span class="popup tooltip">Legendary Ooze: Your attacks summon oozes.</span>
          </span>
        </span>
      </span>
    </li>
    '''
    aff = translate_list_tag_to_affix_map(
        'Sealed Test Item',
        BeautifulSoup(html, 'html.parser').li,
        {},
        get_fake_bonuses(),
        30,
        {system_name: {'*': []}},
        {},
    )

    assert aff == {'name': system_name}
