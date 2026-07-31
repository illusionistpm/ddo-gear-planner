from bs4 import BeautifulSoup
import pytest

from parse_affixes_from_cell import get_text_map_from_tag, convert_affix_text_map_to_affix_map, translate_list_tag_to_affix_map, get_fake_bonuses, convert_weapon_damage_proc_to_bool


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
            {'name': 'Songblade', 'type': 'Bool', 'value': 1},
        ),
        (
            '<li>Holy 4</li>',
            {'name': 'Holy', 'type': 'Bool', 'value': 1},
        ),
        (
            '<li>Evil Outsider Bane 4</li>',
            {'name': 'Evil Outsider Bane', 'type': 'Bool', 'value': 1},
        ),
        (
            '<li>Feybane 2</li>',
            {'name': 'Feybane', 'type': 'Bool', 'value': 1},
        ),
        (
            '<li>Poisonous 3</li>',
            {'name': 'Poisonous', 'type': 'Bool', 'value': 1},
        ),
        (
            '<li>Destructive Acid +2</li>',
            {'name': 'Destructive Acid', 'type': 'Bool', 'value': 1},
        ),
        (
            '<li>Holy Burst 4</li>',
            {'name': 'Holy Burst', 'type': 'Bool', 'value': 1},
        ),
        (
            '<li>Axiomatic 4</li>',
            {'name': 'Axiomatic', 'type': 'Bool', 'value': 1},
        ),
        (
            '<li><span class="has_tooltip">Heartseeker IV<span class="tooltip">Heartseeker IV: On Critical Hit: 9 to 54 Piercing damage from weapons with a x2 Critical Multiplier.</span></span></li>',
            {'name': 'Heartseeker', 'type': 'Bool', 'value': 1},
        ),
        (
            '<li><span class="has_tooltip">Energy Siphon V<span class="tooltip">Energy Siphon V: On Hit: Gain 25 Temporary Spellpoints which last for up to 1 minute.</span></span></li>',
            {'name': 'Energy Siphon', 'type': 'Bool', 'value': 1},
        ),
        (
            '<li><span class="has_tooltip">Solar Guard III<span class="tooltip">Solar Guard III: When Hit in Melee: Deals 3 to 12 Light damage to your attacker.</span></span></li>',
            {'name': 'Solar Guard', 'type': 'Bool', 'value': 1},
        ),
        (
            '<li><span class="has_tooltip">Improved Deception +9<span class="tooltip">Improved Deception: This item provides a +9 enhancement bonus to Bluff checks and your weapons have a chance to make the target vulnerable to sneak attacks.</span></span></li>',
            {'name': 'Improved Deception', 'type': 'Enhancement', 'value': '9'},
        ),
        (
            '<li><span class="has_tooltip">Good Blast 3<span class="tooltip">Good Blast 3: This weapon sings of virtue, dealing 3d6 Good damage on a successful hit, and an additional 3d6 Good damage on a critical hit.</span></span></li>',
            {'name': 'Good Blast', 'type': 'Bool', 'value': 1},
        ),
        (
            '<li><span class="has_tooltip">Paralyzing 45<span class="tooltip">Paralyzing 45: Any creature struck by this weapon must succeed on a DC 45 Will save or be paralyzed.</span></span></li>',
            {'name': 'Paralyzing', 'type': 'Bool', 'value': 1},
        ),
        (
            '<li><span class="has_tooltip">Sundering V<span class="tooltip">Sundering V: On Hit: Your target suffers a -1 Penalty to Fortitude Saving Throws.</span></span></li>',
            {'name': 'Sundering', 'type': 'Enhancement', 'value': '10'},
        ),
        (
            '<li><span class="has_tooltip">Sundering V<span class="tooltip">Sundering V: On Hit: Your target suffers a -1 Penalty to Fortitude Saving Throws for 6 seconds. Passive: The DC of the saving throw to resist your Sunder combat feats is increased by 10.</span></span></li>',
            {'name': 'Sundering', 'type': 'Enhancement', 'value': '10'},
        ),
        (
            '<li><span class="has_tooltip">Dazing IV<span class="tooltip">Dazing IV: On Hit: Your target suffers a -1 Penalty to Will Saving Throws for 6 seconds. Passive: The DC of the saving throw to resist your Stunning Blow and Stunning Fist combat feats is increased by 8.</span></span></li>',
            {'name': 'Dazing', 'type': 'Enhancement', 'value': '8'},
        ),
        (
            '<li><span class="has_tooltip">Echoes of Angdrelve 6<span class="tooltip">Echoes of Angdrelve 6: Each strike from this weapon deals an additional 6d6 Acid damage on each hit.</span></span></li>',
            {'name': 'Echoes of Angdrelve', 'type': 'Bool', 'value': 1},
        ),
        (
            '<li><span class="has_tooltip">Antimagic Spike 117<span class="tooltip">Antimagic Spike 117: When scoring a critical hit, the target must make a DC 117 Fortitude save or be unable to cast spells.</span></span></li>',
            {'name': 'Antimagic Spike', 'type': 'Bool', 'value': 1},
        ),
        (
            '<li><span class="has_tooltip">Magical Efficiency 5%<span class="tooltip">Magical Efficiency 5%: You take a 5% Enhancement discount to the Spell Point cost of your spells.</span></span></li>',
            {'name': 'Magical Efficiency', 'type': 'Enhancement', 'value': '5'},
        ),
        (
            '<li><span class="has_tooltip">Efficient Metamagic - Maximize II<span class="tooltip">Efficient Metamagic - Maximize II: The additional spell point cost for using the Maximize Metamagic feat is reduced by 4 SP.</span></span></li>',
            {'name': 'Efficient Metamagic - Maximize', 'type': 'Enhancement', 'value': '2'},
        ),
        (
            '<li><span class="has_tooltip">Wizardry II<span class="tooltip">Wizardry II: This item grants the wearer +50 maximum spell points. Sorcerers and Favored Souls gain up to double spell points from items.</span></span></li>',
            {'name': 'Wizardry', 'type': 'Enhancement', 'value': '2'},
        ),
        (
            '<li><span class="has_tooltip">Power I<span class="tooltip">Power I: This item grants the wearer +10 maximum spell points.</span></span></li>',
            {'name': 'Power', 'type': 'Enhancement', 'value': '1'},
        ),
        (
            '<li>Minor Spell Penetration VII</li>',
            {'name': 'Minor Spell Penetration', 'type': 'Enhancement', 'value': '7'},
        ),
        (
            '<li><span class="has_tooltip">Hardened Exterior 2<span class="tooltip">Hardened Exterior 2: You gain a +2 profane bonus to AC.</span></span></li>',
            {'name': 'Hardened Exterior', 'type': 'Profane', 'value': '2'},
        ),
        (
            '<li><span class="has_tooltip">Mystic Incite +23<span class="tooltip">Mystic Incite +23: +23% bonus to increased threat generation from spell damage</span></span></li>',
            {'name': 'Mystic Incite', 'type': 'Enhancement', 'value': '23'},
        ),
        (
            '<li><span class="has_tooltip">Linguistics 10%<span class="tooltip">Linguistics: This item reduced the cooldowns of your Social skills by 10%.</span></span></li>',
            {'name': 'Linguistics', 'type': 'Untyped', 'value': '10'},
        ),
        (
            '<li><span class="has_tooltip">Enhanced Ki +3<span class="tooltip">Enhanced Ki +3: Increases the rate at which the user gains ki with each successful attack.</span></span></li>',
            {'name': 'Ki', 'type': 'Untyped', 'value': '3'},
        ),
        (
            '<li><span class="has_tooltip">Extra Smites 2<span class="tooltip">Extra Smites 2: +2 Smite Evil uses per rest. Smite Evil uses regenerate 10% faster.</span></span></li>',
            {'name': 'Extra Smites', 'type': 'Untyped', 'value': '2'},
        ),
        (
            '<li><span class="has_tooltip">Upgradeable - Tier 2<span class="tooltip">Upgradeable - Tier 2: This is a tier 2 upgradeable item.</span></span></li>',
            {'name': 'Upgradeable - Tier', 'type': 'Untyped', 'value': '2'},
        ),
        (
            '<li><span class="has_tooltip">Lesser Arcane Casting Dexterity<span class="tooltip">Lesser Arcane Casting Dexterity: This ability reduces the arcane spell failure chance by -5%.</span></span></li>',
            {'name': 'Lesser Arcane Casting Dexterity', 'type': 'Untyped', 'value': '5'},
        ),
        (
            '<li><span class="has_tooltip">Lesser Arcane Augmentation I<span class="tooltip">Lesser Arcane Augmentation I: Increases the wearer\'s caster level when casting first level sorcerer or wizard spells by one.</span></span></li>',
            {'name': 'Lesser Arcane Augmentation', 'type': 'Untyped', 'value': '1'},
        ),
        (
            '<li><span class="has_tooltip">Spearblock V<span class="tooltip">Spearblock V: Passive: Reduces physical damage taken by 10, except from Bludgeoning or Slashing weapons.</span></span></li>',
            {'name': 'Spearblock', 'type': 'Untyped', 'value': '5'},
        ),
        (
            '<li><span class="has_tooltip">Negative Energy Absorption +20%<span class="tooltip">Negative Energy Absorption +20%: This effect absorbs 20% of all negative damage the character would have taken.</span></span></li>',
            {'name': 'Negative Energy Absorption', 'type': 'Untyped', 'value': '20'},
        ),
        (
            '<li>Maximum Charge Tier: III</li>',
            {'name': 'Maximum Charge Tier', 'type': 'Untyped', 'value': '3'},
        ),
        (
            '<li><span class="has_tooltip">Rune Arm Imbue: Acid II<span class="tooltip">Rune Arm Imbue: Acid II: Wearing this Rune Arm will imbue any weapon you wield, dealing 2d4 points of Acid damage per hit.</span></span></li>',
            {'name': 'Rune Arm Imbue: Acid', 'type': 'Untyped', 'value': '2'},
        ),
    ],
)
def test_translate_list_tag_parameterized_quality_fixtures(html, expected):
    li = BeautifulSoup(html, 'html.parser').li
    aff = translate_list_tag_to_affix_map('Test Item', li, {}, get_fake_bonuses(), 10, {}, {})
    assert aff == expected


def test_translate_list_tag_does_not_bool_weapon_proc_without_rank():
    assert convert_weapon_damage_proc_to_bool({'name': 'Holy'}) == {'name': 'Holy'}


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
