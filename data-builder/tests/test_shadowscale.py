from bs4 import BeautifulSoup

from shadowscale import SHADOWSCALE_UPGRADE_SYSTEM, add_shadowscale_upgrade_options, get_shadowscale_upgrades_from_wiki

# The Thunder-Forged page's Shadowscale Armor table, cut down: the cost and the shared
# properties span every upgrade row, and a footnote follows a compatibility mark.
THUNDER_FORGED = '''
<h2><span class="mw-headline" id="Shadowscale_Armor">Shadowscale Armor</span></h2>
<table><tr><th>Cost</th><th>Base Properties</th></tr></table>
<table class="wikitable">
<tr><th rowspan="2">Cost</th><th colspan="2">Added Properties</th><th colspan="5">Compatibility</th></tr>
<tr><th>Cloth</th><th>Light</th><th>Medium</th><th>Heavy</th><th>Docent</th></tr>
<tr><td rowspan="3">50 scales</td>
<td><ul><li><b><a href="/page/Shadow_Caster">Shadow Caster</a></b><ul><li>+3 Profane bonus to Concentration</li></ul></li></ul></td>
<td rowspan="3"><ul><li>Green Augment Slot</li></ul></td>
<td>✓</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td></tr>
<tr><td><ul><li><b><a href="/page/Shadow_Killer">Shadow Killer</a></b><ul><li>+2d6 Profane bonus to Sneak attack damage</li></ul></li></ul></td>
<td></td><td>✓</td><td>✓</td><td>✓</td><td>✓</td></tr>
<tr><td><ul><li><b><a href="/page/Shadow_Guardian">Shadow Guardian</a></b><ul>
<li><span class="popup has_tooltip"><a href="/page/Damage_Reduction">DR</a><span class="popup tooltip">Damage Reduction 30/Epic</span></span> 30/Epic</li>
<li><span class="popup has_tooltip"><a href="/page/Damage_Reduction">DR</a><span class="popup tooltip">Damage Reduction 60/Epic</span></span> 60/Epic while below 75% health</li>
</ul></li></ul></td>
<td></td><td></td><td></td><td>✓<sup>4</sup></td><td>✓</td></tr>
</table>
<h2><span class="mw-headline" id="Next">Next</span></h2>
'''


def upgrades():
    return get_shadowscale_upgrades_from_wiki(BeautifulSoup(THUNDER_FORGED, 'html.parser'))


def entries(cell):
    return [' '.join(li.get_text(' ', strip=True).split()) for li in cell.ul.find_all('li', recursive=False)]


def test_reads_each_upgrade_and_the_armor_types_it_fits():
    assert [(name, fits) for name, _, fits in upgrades().options] == [
        ('Shadow Caster', {'Cloth', 'Light', 'Medium', 'Heavy', 'Docent'}),
        ('Shadow Killer', {'Light', 'Medium', 'Heavy', 'Docent'}),
        ('Shadow Guardian', {'Heavy', 'Docent'}),
    ]


def test_leaves_out_an_effect_that_only_applies_under_a_condition():
    guardian = upgrades().options[2][1]
    assert entries(guardian) == ['DR Damage Reduction 30/Epic 30/Epic']


def test_reads_what_every_upgrade_adds():
    assert entries(upgrades().shared) == ['Green Augment Slot']


def fake_parse_cell(cell):
    return [{'name': text, 'type': 'Bool', 'value': 1} for text in entries(cell)]


def test_offers_an_item_the_upgrades_its_armor_type_takes_and_returns_the_slot_they_add():
    crafting = {'Green Augment Slot': {}}

    added = add_shadowscale_upgrade_options(crafting, {'name': 'Shadowscale Robe', 'type': 'Cloth armor'}, fake_parse_cell, upgrades())

    assert added == ['Green Augment Slot']
    assert crafting[SHADOWSCALE_UPGRADE_SYSTEM]['Shadowscale Robe'] == [
        {'name': 'Shadow Caster', 'affixes': [{'name': '+3 Profane bonus to Concentration', 'type': 'Bool', 'value': 1}]},
    ]


def test_an_armor_type_the_table_offers_nothing_keeps_its_flag():
    crafting = {'Green Augment Slot': {}}

    added = add_shadowscale_upgrade_options(crafting, {'name': 'Shadow Buckler', 'type': 'Bucklers'}, fake_parse_cell, upgrades())

    assert added is None
    assert SHADOWSCALE_UPGRADE_SYSTEM not in crafting
