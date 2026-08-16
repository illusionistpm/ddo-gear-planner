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
            {'text': 'Spell Focus Mastery +1', 'tooltip': ''},
            {'name': 'Spell Focus Mastery', 'type': 'Equipment', 'value': '1'},
        ),
        (
            {'text': 'Once every three seconds when you take damage', 'tooltip': ''},
            {'name': 'Once every three seconds when you take damage', 'type': 'Untyped', 'value': 1},
        ),
        (
            {'text': 'Combustion +32', 'tooltip': 'This grants a +32 Enhancement bonus to Fire Spell Power.'},
            {'name': 'Fire Spell Power', 'type': 'Enhancement', 'value': '32'},
        ),
        (
            {'text': 'Chilling 9', 'tooltip': 'Chilling 9: This weapon deals 9d6 Cold damage on each hit.'},
            {'name': 'Chilling', 'type': 'Bool', 'value': 1},
        ),
        (
            {
                'text': 'Sacred +10',
                'tooltip': 'Sacred +10: Sacred items provide an +10 Enhancement bonus to your effective level for Turning Undead.',
            },
            {'name': 'Turn Undead', 'type': 'Enhancement', 'value': '10'},
        ),
        (
            {
                'text': '-1 Enhancement Bonus',
                'tooltip': '-1 Enhancement Bonus: This weapon is less well-made than normal, giving a -1 penalty to attack and damage rolls.',
            },
            {'name': 'Enhancement Bonus', 'type': 'Enhancement', 'value': '-1'},
        ),
        (
            {'text': 'Undead Bane 4', 'tooltip': 'Undead Bane 4: This weapon deals extra bane damage vs. Undead.'},
            {'name': 'Undead Bane', 'type': 'Bool', 'value': 1},
        ),
        (
            {'text': 'Glaciation +53', 'tooltip': 'Glaciation +53: Passive: +53 Equipment bonus to Cold Spell Power.'},
            {'name': 'Cold Spell Power', 'type': 'Equipment', 'value': '53'},
        ),
        (
            {'text': 'Ice Spell Power +53', 'tooltip': 'Ice Spell Power +53: Passive: +53 Equipment bonus to Cold Spell Power.'},
            {'name': 'Cold Spell Power', 'type': 'Equipment', 'value': '53'},
        ),
        (
            {'text': 'Lightning Spell Power +53', 'tooltip': 'Lightning Spell Power +53: Passive: +53 Equipment bonus to Electric Spell Power.'},
            {'name': 'Electric Spell Power', 'type': 'Equipment', 'value': '53'},
        ),
        (
            {'text': 'Void Lore +22', 'tooltip': 'Void Lore +22: Passive: +22 Equipment bonus to Negative Spell Critical Chance.'},
            {'name': 'Negative Lore', 'type': 'Equipment', 'value': '22'},
        ),
        (
            {'text': 'Ice Intensity +12', 'tooltip': 'Ice Intensity +12: Passive: +12 Equipment bonus to Cold Spell Critical Damage.'},
            {'name': 'Ice Intensity', 'type': 'Equipment', 'value': '12'},
        ),
        (
            {'text': 'Combustion Intensity +12', 'tooltip': 'Combustion Intensity +12: Passive: +12 Equipment bonus to Fire Spell Critical Damage.'},
            {'name': 'Fire Intensity', 'type': 'Equipment', 'value': '12'},
        ),
        (
            {'text': 'Corrosion Intensity +12', 'tooltip': 'Corrosion Intensity +12: Passive: +12 Equipment bonus to Acid Spell Critical Damage.'},
            {'name': 'Acid Intensity', 'type': 'Equipment', 'value': '12'},
        ),
        (
            {'text': 'Impulse Intensity +12', 'tooltip': 'Impulse Intensity +12: Passive: +12 Equipment bonus to Force Spell Critical Damage.'},
            {'name': 'Kinetic Intensity', 'type': 'Equipment', 'value': '12'},
        ),
        (
            {'text': 'Kinetic Lore +15', 'tooltip': 'Kinetic Lore +15: Passive: Your Force, Physical and Untyped spells gain a 15% Equipment bonus to their chance to critical hit.'},
            {'name': 'Kinetic Lore', 'type': 'Equipment', 'value': '15'},
        ),
        (
            {
                'text': 'Sacred Ground Lore',
                'tooltip': 'Sacred Ground Lore: Passive: Your Acid, Light, and Alignment spells gain a 15% Equipment bonus to their chance to critical hit.',
            },
            {'name': 'Sacred Ground Lore', 'type': 'Bool', 'value': 1},
        ),
        (
            {'text': 'Lightning Intensity +12', 'tooltip': 'Lightning Intensity +12: Passive: +12 Equipment bonus to Electric Spell Critical Damage.'},
            {'name': 'Lightning Intensity', 'type': 'Equipment', 'value': '12'},
        ),
        (
            {'text': 'Nullification Intensity +12', 'tooltip': 'Nullification Intensity +12: Passive: +12 Equipment bonus to Negative Spell Critical Damage.'},
            {'name': 'Void Intensity', 'type': 'Equipment', 'value': '12'},
        ),
        (
            {'text': 'Devotion Intensity +12', 'tooltip': 'Devotion Intensity +12: Passive: +12 Equipment bonus to Positive Spell Critical Damage.'},
            {'name': 'Healing Intensity', 'type': 'Equipment', 'value': '12'},
        ),
        (
            {'text': 'Reconstruction Intensity +12', 'tooltip': 'Reconstruction Intensity +12: Passive: +12 Equipment bonus to Repair Spell Critical Damage.'},
            {'name': 'Repair Intensity', 'type': 'Equipment', 'value': '12'},
        ),
        (
            {'text': 'Resonance Intensity +12', 'tooltip': 'Resonance Intensity +12: Passive: +12 Equipment bonus to Sonic Spell Critical Damage.'},
            {'name': 'Sonic Intensity', 'type': 'Equipment', 'value': '12'},
        ),
        (
            {'text': 'Radiance Lore +22', 'tooltip': 'Radiance Lore +22: Passive: +22 Equipment bonus to Light Spell Critical Chance.'},
            {'name': 'Radiance Lore', 'type': 'Equipment', 'value': '22'},
        ),
        (
            {'text': 'Artifact Spell Lore +6', 'tooltip': 'Artifact Spell Lore 6: Passive: All of your spells gain a 6% Artifact bonus to their chance to critical hit.'},
            {'name': 'Spell Lore', 'type': 'Artifact', 'value': '6'},
        ),
        (
            {'text': '+10% Artifact Bonus to Damage vs. the Helpless', 'tooltip': ''},
            {'name': 'Damage vs. the Helpless', 'type': 'Artifact', 'value': '10'},
        ),
        (
            {'text': 'False Life +10', 'tooltip': 'False Life: +10% Legendary bonus to your maximum hit points.'},
            {'name': 'False Life (%)', 'type': 'Legendary', 'value': '10'},
        ),
        (
            {
                'text': 'Greater Dragonmark Enhancement',
                'tooltip': 'Greater Dragonmark Enhancement: This will increase the total number of Greater Dragonmarks you can use by 3.',
            },
            {'name': 'Greater Dragonmark Charges', 'type': 'Untyped', 'value': '3'},
        ),
        (
            {'text': 'Greater Dragonmark charges +1', 'tooltip': ''},
            {'name': 'Greater Dragonmark Charges', 'type': 'Untyped', 'value': '1'},
        ),
        (
            {
                'text': 'Hidden effect: Cursed Defiance',
                'tooltip': 'Cursed Defiance: 5% on-being-hit chance to be unable to move and gain DR 20/- for 20 seconds',
            },
            {'name': 'Cursed Defiance', 'type': 'Bool', 'value': 1},
        ),
        (
            {
                'text': 'Proficiency: Bastard Sword',
                'tooltip': 'This grants you the Proficiency: Bastard Sword feat.',
            },
            {'name': 'Proficiency: Bastard Sword', 'type': 'Bool', 'value': 1},
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
