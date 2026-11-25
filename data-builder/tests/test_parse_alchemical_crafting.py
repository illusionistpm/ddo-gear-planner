from bs4 import BeautifulSoup

import parse_alchemical_crafting as module
from parse_alchemical_crafting import get_alchemical_crafting_from_page, get_alchemical_crafting_systems


def tip(label, tooltip):
    return f'<span class="popup has_tooltip with-icon basic"><a>{label}</a><span class="popup tooltip"><b>{label}</b>: {tooltip}</span></span>'


def element_rows(cells_by_element):
    return ''.join(
        f'<tr><td>{element}</td>{"".join(f"<td>{cell}</td>" for cell in cells)}</tr>'
        for element, cells in cells_by_element.items()
    )


def heroic_tier(tier, cells_by_element):
    return f'''
    <h3><span class="mw-headline" id="Tier_{tier}_Elemental_Binding">Tier {tier} Elemental Binding - Cannith Binding Station</span></h3>
    <table class="wikitable"><tr><th></th><th>Martial effects</th><th>Mystical effects</th></tr>
    {element_rows(cells_by_element)}</table>
    '''


def legendary_tier(tier, lines_by_element):
    return f'''
    <h2><span class="mw-headline" id="Tier_{tier}">Tier {tier}</span></h2>
    <table class="wikitable">
    {element_rows({element: ['<ul>' + ''.join(f'<li>{line}</li>' for line in lines) + '</ul>'] for element, lines in lines_by_element.items()})}
    </table>
    '''


STR = tip('Alchemical Strength +2', 'granting a +2 Alchemical bonus to Strength.')
PAGE = f'''
<h3><span class="mw-headline" id="Refinement">Refinement - Cannith Reforging Station</span></h3>
<table class="wikitable">
<tr><th>Material type</th><th>Refinement effect</th><th>Tier 1 Mystical effect</th><th>Tier 2 Mystical effect</th></tr>
<tr><td>Adamantine</td><td>Adamantine DR</td><td>{tip('Impulse +90', 'Passive: +90 Equipment bonus to Force, Untyped, Slashing, Piercing, and Bludgeoning Spell Power.')}</td><td>x</td></tr>
<tr><td>Crystal</td><td>Crystal DR</td><td>{tip('Impulse +90', 'Passive: +90 Equipment bonus to Force, Untyped, Slashing, Piercing, and Bludgeoning Spell Power.')}</td><td>x</td></tr>
<tr><td>Cold Iron</td><td>Cold Iron DR</td><td>{tip('Resonance +90', 'Passive: +90 Equipment bonus to Sonic Spell Power.')}</td><td>x</td></tr>
</table>
{heroic_tier(1, {
    'Air': [tip('Stunning +10', '+10 Enhancement bonus to the DC of Stunning Blow.'), tip('Magnetism +90', 'Passive: +90 Equipment bonus to Electricity Spell Power.') + ', &lt;Metal Type Effect&gt; +90'],
    # Icy Burst's unclosed dice spans swallow the next effect, as on the wiki.
    'Earth': ['<span class="popup has_tooltip with-icon basic"><a>Icy Burst</a><span class="popup tooltip">cold damage <span class="popup has_tooltip no-icon basic">1d10 for x2, '
              + tip('Freezing Ice', '<ul><li>On items: freezes</li><li>On weapons: freezes</li></ul>') + '</span></span></span>',
              tip('Corrosion +90', 'Passive: +90 Equipment bonus to Acid Spell Power.')],
    'Water': [tip('Seeker +10', 'Provides a +10 Enhancement bonus to confirm critical hits.'), tip('Glaciation +90', 'Passive: +90 Equipment bonus to Cold Spell Power.')],
    'Fire': [STR, tip('Combustion +90', 'Passive: +90 Equipment bonus to Fire Spell Power.')],
})}
{heroic_tier(2, {element: [STR, tip('Fire Lore VI', 'Passive: Your Fire spells gain a 16% Equipment bonus to their chance to critical hit.')] for element in ['Air', 'Earth', 'Water', 'Fire']})}
{heroic_tier(3, {element: [STR + ', <span class="popup has_tooltip with-icon augment red"><span class="title"><a>Red Augment Slot</a></span></span>', tip('Evocation Focus +2', '+2 Equipment bonus to the DC of Evocation spells.')] for element in ['Air', 'Earth', 'Water', 'Fire']})}
<h1><span class="mw-headline" id="Legendary">Legendary</span></h1>
{legendary_tier(1, {
    'Air': ['Heightened Awareness +6 (+6 Insightful AC, does not include saves), Legendary Lightning Storm Guard', 'Magnetism +148, Lightning Lore +22%'],
    'Earth': ['Fortification +148%, Physical Sheltering +35'],
    'Water': ['Fire Shield (Cold) (constantly on), Legendary Ice Shards Guard'],
    'Fire': ['Seeker +13, Legendary Magma Surge Guard'],
})}
{legendary_tier(2, {
    'Air': ['Alchemical Dexterity +2', 'Doubleshot +8% (<b>Warning</b>: Does not function on melee weapons.)'],
    'Earth': ['Alchemical Constitution +2', 'Alchemical Intelligence +2'],
    'Water': ['Efficient Metamagic - Extend II'],
    'Fire': ['Alchemical Strength +2'],
})}
{legendary_tier(3, {element: [f'Alchemical {element} Attunement, Orange slot'] for element in ['Air', 'Earth', 'Water', 'Fire']})}
'''

BONUS_TYPES = {
    'Electric Spell Power': 'Equipment', 'Lightning Lore': 'Equipment', 'Fortification': 'Enhancement',
    'Physical Sheltering': 'Enhancement', 'Seeker': 'Enhancement', 'Doubleshot': 'Enhancement',
}


def parse(monkeypatch):
    monkeypatch.setattr(module, 'get_most_common_bonus_type', lambda: BONUS_TYPES)
    return get_alchemical_crafting_from_page(BeautifulSoup(PAGE, 'html.parser'))


def options(systems, system):
    return {option['name']: option for option in systems[system]['*']}


def affixes(option):
    return {(affix['name'], affix['type'], str(affix['value'])) for affix in option['affixes']}


def test_prototype_flags_become_tier_systems():
    assert get_alchemical_crafting_systems('Alchemical (Prototype)') == ['Alchemical Tier 1', 'Alchemical Tier 2', 'Alchemical Tier 3']
    assert get_alchemical_crafting_systems('Legendary Alchemical Crafting (Prototype)') == [
        'Legendary Alchemical Tier 1', 'Legendary Alchemical Tier 2', 'Legendary Alchemical Tier 3']
    assert get_alchemical_crafting_systems('Alchemical Air Attunement') is None


def test_heroic_martial_grants_its_alchemical_stat(monkeypatch):
    tier2 = options(parse(monkeypatch), 'Alchemical Tier 2')
    assert ('Strength', 'Alchemical', '2') in affixes(tier2['Fire (Martial)'])
    assert tier2['Fire (Martial)']['ml'] == 18
    assert 'quests' not in tier2['Fire (Martial)']


def test_heroic_mystical_is_one_option_per_material_effect(monkeypatch):
    tier1 = options(parse(monkeypatch), 'Alchemical Tier 1')
    # Adamantine and Crystal add the same effect, so they share an option.
    assert set(tier1) >= {'Air (Mystical, Adamantine or Crystal)', 'Air (Mystical, Cold Iron)'}
    assert affixes(tier1['Air (Mystical, Cold Iron)']) == {
        ('Electric Spell Power', 'Equipment', '90'),
        ('Sonic Spell Power', 'Equipment', '90'),
    }
    # A Mystical cell with no material effect is a single option.
    assert 'Earth (Mystical)' in tier1


def test_heroic_effect_nested_in_another_is_kept(monkeypatch):
    tier1 = options(parse(monkeypatch), 'Alchemical Tier 1')
    assert {name for name, _, _ in affixes(tier1['Earth (Martial)'])} == {'Icy Burst', 'Freezing Ice'}


def test_augment_slots_are_left_out(monkeypatch):
    systems = parse(monkeypatch)
    assert affixes(options(systems, 'Alchemical Tier 3')['Air (Martial)']) == {('Strength', 'Alchemical', '2')}
    assert affixes(options(systems, 'Legendary Alchemical Tier 3')['Air: Alchemical Air Attunement']) == {
        ('Alchemical Air Attunement', 'Bool', '1')}


def test_legendary_lines_are_separate_options(monkeypatch):
    tier2 = options(parse(monkeypatch), 'Legendary Alchemical Tier 2')
    assert affixes(tier2['Earth: Alchemical Constitution +2']) == {('Constitution', 'Alchemical', '2')}
    assert affixes(tier2['Earth: Alchemical Intelligence +2']) == {('Intelligence', 'Alchemical', '2')}
    assert tier2['Earth: Alchemical Intelligence +2']['ml'] == 29
    assert 'quests' not in tier2['Earth: Alchemical Intelligence +2']


def test_legendary_commentary_is_dropped_and_types_filled_in(monkeypatch):
    systems = parse(monkeypatch)
    tier1 = options(systems, 'Legendary Alchemical Tier 1')
    assert affixes(tier1['Air: Heightened Awareness +6, Legendary Lightning Storm Guard']) == {
        ('Heightened Awareness', 'Insight', '6'),
        ('Legendary Lightning Storm Guard', 'Bool', '1'),
    }
    assert affixes(tier1['Air: Magnetism +148, Lightning Lore +22%']) == {
        ('Electric Spell Power', 'Equipment', '148'),
        ('Lightning Lore', 'Equipment', '22'),
    }
    assert ('Fire Shield (Cold)', 'Bool', '1') in affixes(tier1['Water: Fire Shield (Cold), Legendary Ice Shards Guard'])

    tier2 = options(systems, 'Legendary Alchemical Tier 2')
    assert affixes(tier2['Air: Doubleshot +8%']) == {('Doubleshot', 'Enhancement', '8')}
    assert affixes(tier2['Water: Efficient Metamagic - Extend II']) == {('Efficient Metamagic - Extend', 'Enhancement', '2')}


def test_legendary_improved_augmentation_is_worth_three_caster_levels(monkeypatch):
    page = PAGE.replace('Alchemical Fire Attunement, Orange slot', 'Improved Fire Augmentation IX, Purple slot')
    monkeypatch.setattr(module, 'get_most_common_bonus_type', lambda: BONUS_TYPES)
    tier3 = options(get_alchemical_crafting_from_page(BeautifulSoup(page, 'html.parser')), 'Legendary Alchemical Tier 3')
    assert affixes(tier3['Fire: Improved Fire Augmentation IX']) == {('Improved Fire Augmentation', 'Untyped', '3')}
