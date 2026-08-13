from bs4 import BeautifulSoup

import parse_slavers as module


def slavers_html():
    return BeautifulSoup(
        '''
        <table><tr><th>Other</th></tr></table>
        <table>
            <tr><th>Group</th><th>Enchantment name</th><th>Enchantment value</th><th>Ingredient cost</th></tr>
            <tr><th>Heroic ML 8</th><th>Legendary ML 28</th><th>Heroic</th><th>Legendary</th></tr>
            <tr><td>Prefix</td><td>Attributes</td><td>+5</td><td>+13</td><td></td><td></td></tr>
            <tr><td>Fortification</td><td>+70%</td><td>+142%</td></tr>
            <tr><td>Suffix</td><td>Spell Lore (single type) (Equipment Bonus)</td><td>+10</td><td>+21</td><td></td><td></td></tr>
            <tr><td>Spell Power (single type) (Equipment Bonus)</td><td>+70</td><td>+142</td></tr>
            <tr><td>Damage Guards (don't stack with each other)</td><td>+2d8</td><td>+8d8</td></tr>
            <tr><td>Extra</td><td>UMD ( note: barter displays incorrect values.)</td><td>+1</td><td>+5</td><td></td><td></td></tr>
            <tr><td>Spell Focus Mastery</td><td>+2</td><td>+6</td></tr>
            <tr><td>Spell Penetration</td><td>+3</td><td>+8</td></tr>
            <tr><td>Bonus Note: values</td><td>Quality Attributes</td><td>+1</td><td>+3</td><td></td><td></td></tr>
            <tr><td>Quality False Life</td><td>+4</td><td>+12</td></tr>
            <tr><td>Quality MRR</td><td>+2</td><td>+8</td></tr>
            <tr><td>Augment Slot addition</td><td>Colorless Augment Slot</td><td></td><td></td></tr>
        </table>
        <table>
            <tr><th>Name</th><th colspan="2">Heroic</th><th colspan="2">Legendary</th></tr>
            <tr><th>3 pieces</th><th>5 pieces</th><th>3 pieces</th><th>5 pieces</th></tr>
            <tr>
                <td>Slave Lord's Sorcery</td>
                <td>+2 artifact bonus to Spell Power +1 artifact bonus to Spell Focus Mastery</td>
                <td>+1 artifact bonus to Int/Wis/Cha +5 artifact bonus to Spell Power +2 artifact bonus to Spell Focus Mastery</td>
                <td>+5 artifact bonus to Spell Power +2 artifact bonus to Spell Focus Mastery</td>
                <td>+2 artifact bonus to Int/Wis/Cha +10 artifact bonus to Spell Power +4 artifact bonus to Spell Focus Mastery</td>
            </tr>
            <tr>
                <td>Slaver's Endurance</td>
                <td>+1 artifact bonus to MRR/PRR +1 artifact bonus to Resistance +1 artifact bonus to Spell Saves</td>
                <td>+1 artifact bonus to Constitution +2 artifact bonus to MRR/PRR +2 artifact bonus to Resistance +2 artifact bonus to Spell Saves</td>
                <td>+2 artifact bonus to MRR/PRR +2 artifact bonus to Resistance +2 artifact bonus to Spell Saves</td>
                <td>+2 artifact bonus to Constitution +4 artifact bonus to MRR/PRR +4 artifact bonus to Resistance +4 artifact bonus to Spell Saves</td>
            </tr>
        </table>
        ''',
        'html.parser',
    )


def test_parse_slavers_crafting_expands_wiki_groups_and_uses_wiki_values(monkeypatch):
    monkeypatch.setattr(module, 'load_slavers_crafting_soup', slavers_html)

    crafting = module.parse_slavers_crafting()

    assert crafting["Slaver's Prefix Slot"]['*'][0] == {'affixes': [{'name': 'Strength', 'type': 'Enhancement', 'value': 5}]}
    assert {'affixes': [{'name': 'Fortification', 'type': 'Enhancement', 'value': 70.0}]} in crafting["Slaver's Prefix Slot"]['*']
    assert {'affixes': [{'name': 'Radiance Lore', 'type': 'Equipment', 'value': 10}]} in crafting["Slaver's Suffix Slot"]['*']
    assert {'affixes': [{'name': 'Radiance', 'type': 'Equipment', 'value': 70}]} in crafting["Slaver's Suffix Slot"]['*']
    assert {'affixes': [{'name': 'Use Magic Device', 'type': 'Competence', 'value': 1}]} in crafting["Slaver's Extra Slot"]['*']
    assert {'affixes': [{'name': 'Spell Penetration', 'type': 'Equipment', 'value': 3}]} in crafting["Slaver's Extra Slot"]['*']
    assert {'affixes': [{'name': 'Spell Focus Mastery', 'type': 'Equipment', 'value': 6}]} in crafting["Legendary Slaver's Extra Slot"]['*']
    assert {'affixes': [{'name': 'False Life', 'type': 'Quality', 'value': 4}]} in crafting["Slaver's Bonus Slot"]['*']
    assert {'affixes': [{'name': 'Magical Resistance Rating', 'type': 'Quality', 'value': 8}]} in crafting["Legendary Slaver's Bonus Slot"]['*']


def test_parse_slavers_sets_preserves_legacy_output_shape(monkeypatch):
    monkeypatch.setattr(module, 'load_slavers_crafting_soup', slavers_html)
    monkeypatch.setattr(module, 'get_inverted_synonym_map', lambda: {})

    sets = module.parse_slavers_sets()

    assert sets["Slave Lord's Sorcery"][1]['affixes'] == [
        {'name': 'Spell Power', 'type': 'Artifact', 'value': 5},
        {'name': 'Spell Focus Mastery', 'type': 'Artifact', 'value': 2},
        {'name': 'Intelligence', 'type': 'Artifact', 'value': 1},
        {'name': 'Wisdom', 'type': 'Artifact', 'value': 1},
        {'name': 'Charisma', 'type': 'Artifact', 'value': 1},
    ]
    assert "Slave's Endurance" in sets
    assert sets["Legendary Slave's Endurance"][1]['affixes'] == [
        {'name': 'Constitution', 'type': 'Artifact', 'value': 2},
        {'name': 'Magical Sheltering', 'type': 'Artifact', 'value': 4},
        {'name': 'Physical Sheltering', 'type': 'Artifact', 'value': 4},
        {'name': 'Resistance', 'type': 'Artifact', 'value': 4},
        {'name': 'Spell Saves', 'type': 'Artifact', 'value': 4},
    ]
