import json
import os

import pytest
from bs4 import BeautifulSoup

import item_sources
from item_sources import PSEUDO_PACKS, SourceResolver, extract_sources, merge_resolved_source_packs, normalize_source_name

# Trimmed real location cells from the wiki snapshot.
LUNAR_GEM_CELL = '''<td>
<p class="mw-empty-elt">
</p>
<ul><li><a href="/page/Book_Burning" title="Book Burning">Book Burning</a>, end chest</li>
<li><a href="/page/Toil_and_Trouble" title="Toil and Trouble">Toil and Trouble</a>, end chest</li>
<li><a href="/page/A_Light_in_the_Attic" title="A Light in the Attic">A Light in the Attic</a>, secret area chest</li>
<li><a href="/page/Thrall_of_Duty" title="Thrall of Duty">Thrall of Duty</a>, end chest</li>
<li><a href="/page/Flocked_Together" title="Flocked Together">Flocked Together</a>, <a href="/page/The_Decomposter" title="The Decomposter">The Decomposter</a>'s chest</li>
<li><a href="/page/Stealing_from_Sorcere" title="Stealing from Sorcere">Stealing from Sorcere</a>, <a href="/page/Romira" title="Romira">Romira</a> and <a href="/page/Juvian" title="Juvian">Juvian</a>'s chest (requires completion of <a href="/page/Sleeping_with_the_Fishes" title="Sleeping with the Fishes">Sleeping with the Fishes</a> and visits to <a href="/page/The_Cerulean_Hills" title="The Cerulean Hills">The Cerulean Hills</a> and <a href="/page/Ruins_of_Myth_Drannor" title="Ruins of Myth Drannor">Ruins of Myth Drannor</a>)</li></ul>
</td>'''

ISLE_OF_DREAD_CELL = '''<td><a href="/page/Isle_of_Dread_(wilderness)" title="Isle of Dread (wilderness)">Isle of Dread (wilderness)</a>, purple named rare encounter chests; <a href="/page/Skeletons_in_the_Closet" title="Skeletons in the Closet">Skeletons in the Closet</a>, <a href="/page/The_Mountain_Keeper" title="The Mountain Keeper">The Mountain Keeper</a>'s chest; trade with <a href="/page/Sharpened_Bone" title="Sharpened Bone">Sharpened Bone</a>
</td>'''

VECNA_CELL = '''<td><a href="/page/Vecna_Unleashed" title="Vecna Unleashed">Vecna Unleashed</a>, any chest or trade with <a href="/page/Steps_Obliss" title="Steps Obliss">Steps Obliss</a>
</td>'''

FABLES_CELL = '''<td><a href="/page/Fables_of_the_Feywild" title="Fables of the Feywild">Fables of the Feywild</a>, any chest, or turn in 20 <a href="/page/Item:Chunk_of_Ferrocrystal" title="Item:Chunk of Ferrocrystal">Chunks of Ferrocrystal</a> at the <a href="/page/Cauldron_of_Cadence" title="Cauldron of Cadence">Cauldron of Cadence</a>
</td>'''

LUNAR_GEM_PACKS = {
    'Book Burning': 'Magic of Myth Drannor',
    'Toil and Trouble': 'Tavern Tales',
    'A Light in the Attic': 'The Chill of Ravenloft',
    'Thrall of Duty': "The Dragons' Hand",
    'Flocked Together': 'Terror of Demogorgon',
    'Stealing from Sorcere': 'Terror of Demogorgon',
    # Linked in the cell, but an NPC's chest and a prerequisite, not sources.
    'Sleeping with the Fishes': 'Terror of Demogorgon',
    'The Cerulean Hills': 'Magic of Myth Drannor',
    'Ruins of Myth Drannor': 'Magic of Myth Drannor',
}


def cell(html):
    return BeautifulSoup(html, 'html.parser').td


def knows_everything(name):
    return True


def test_lunar_gem_has_every_quest_and_no_npc_or_prerequisite():
    resolver = SourceResolver(LUNAR_GEM_PACKS)
    sources = extract_sources(cell(LUNAR_GEM_CELL), '', resolver.knows)

    assert sources == [
        'Book Burning', 'Toil and Trouble', 'A Light in the Attic',
        'Thrall of Duty', 'Flocked Together', 'Stealing from Sorcere',
    ]
    assert resolver.resolve_item(sources) == [
        'Magic of Myth Drannor', 'Tavern Tales', 'The Chill of Ravenloft',
        "The Dragons' Hand", 'Terror of Demogorgon', 'Terror of Demogorgon',
    ]
    assert resolver.unresolved == {}


def test_single_source_row_is_unchanged():
    html = '<td><a href="/page/Ends_and_Means" title="Ends and Means">Ends and Means</a>, optional chest</td>'
    assert extract_sources(cell(html), '', knows_everything) == ['Ends and Means']


def test_semicolons_split_entries_and_a_bare_comma_link_is_a_location():
    sources = extract_sources(cell(ISLE_OF_DREAD_CELL), '', knows_everything)
    assert sources == ['Isle of Dread (wilderness)', 'Skeletons in the Closet', 'Sharpened Bone']


def test_or_trade_with_adds_a_known_source():
    assert extract_sources(cell(VECNA_CELL), '', knows_everything) == ['Vecna Unleashed', 'Steps Obliss']


def test_a_later_link_counts_only_when_the_resolver_knows_it():
    assert extract_sources(cell(VECNA_CELL), '', lambda name: name != 'Steps Obliss') == ['Vecna Unleashed']


def test_item_links_are_never_sources():
    sources = extract_sources(cell(FABLES_CELL), '', knows_everything)
    assert sources == ['Fables of the Feywild', 'Cauldron of Cadence']


def test_an_item_link_first_does_not_become_the_primary_source():
    html = '<td><a href="/page/Item:Coin" title="Item:Coin">Coin</a> from <a href="/page/Quest" title="Quest">Quest</a></td>'
    assert extract_sources(cell(html), '', knows_everything) == ['Quest']


def test_text_before_a_list_is_its_own_entry():
    html = '''<td><a href="/page/Festivult" title="Festivult">Festivult</a>, coins
    <ul><li>Purchased from <a href="/page/Otis" title="Otis">Otis</a></li></ul></td>'''
    assert extract_sources(cell(html), '', knows_everything) == ['Festivult', 'Otis']


def test_upgrade_crafting_is_not_a_second_source():
    html = '<td><a href="/page/Q" title="Saltmarsh">Saltmarsh</a>, end chest, or <a href="/page/L" title="Legendary Crafting">Legendary Crafting</a></td>'
    assert extract_sources(cell(html), '', knows_everything) == ['Saltmarsh']


def test_multi_source_entries_are_collected_for_review():
    knows = SourceResolver({**LUNAR_GEM_PACKS, 'Vecna Unleashed': 'Vecna Unleashed', 'Steps Obliss': 'Vecna Unleashed'}).knows
    found = []
    extract_sources(cell(LUNAR_GEM_CELL), '', knows, found)
    extract_sources(cell(VECNA_CELL), '', knows, found)
    assert found == [['Vecna Unleashed', 'Steps Obliss']]


def test_a_row_with_no_link_takes_its_hint_as_the_source():
    assert extract_sources(cell('<td></td>'), 'Lamordia: Woeful Slot', knows_everything) == ['Lamordia']
    assert extract_sources(cell('<td>Viktranium Experiment</td>'), 'Viktranium Experiment', knows_everything) == ['Viktranium Experiment']


def test_sources_are_canonicalised_and_deduplicated():
    html = '''<td><ul><li><a href="/page/A" title="Cannith Crafting Tutorial">x</a></li>
    <li><a href="/page/A" title="Essence Crafting Tutorial">x</a></li></ul></td>'''
    assert extract_sources(cell(html), '', knows_everything) == ['Essence Crafting Tutorial']


@pytest.mark.parametrize('name, key', [
    ('The  Pit\xa0', 'the pit'),
    ('Shop ’til You Drop', "shop 'til you drop"),
    ('Legendary Tempest\'s Spine', "tempest's spine"),
    ('Wicked Viktranium Experiment Crafting', 'viktranium experiment'),
    ('Three-Barrel Cove (heroic)', 'three-barrel cove'),
    ('Vecna Unleashed (quest)', 'vecna unleashed'),
    ('Flurry (NPC)', 'flurry'),
    ('Schism Shard Crafting', 'schism shard'),
])
def test_normalize_source_name(name, key):
    assert normalize_source_name(name) == key


def test_resolver_strips_a_vendor_location():
    resolver = SourceResolver({}, source_packs={'Randall Lyric': None})
    assert resolver.resolve('Randall Lyric (Gravenhollow)') == (True, None)


def test_resolver_records_fallback_pairings():
    resolver = SourceResolver(
        {'Quest A': 'Pack A'},
        official_packs=['The Vale of Twilight', 'Pack A'],
        source_packs={'Altar of Invasion': 'The Vale of Twilight', 'Morten Edgewright': 'Keep on the Borderlands'},
    )

    for source in ('Quest A', 'Pack A', 'Legendary Altar of Invasion', 'Morten Edgewright', 'Lamordia', 'Heroic Viktranium Experiment Crafting', 'Sharn quests'):
        resolver.resolve(source)

    assert resolver.resolved_source_packs == {
        'Pack A': 'Pack A',
        'Legendary Altar of Invasion': 'The Vale of Twilight',
        'Morten Edgewright': 'Keep on the Borderlands',
        'Lamordia': 'The Chill of Ravenloft',
        'Heroic Viktranium Experiment Crafting': 'The Chill of Ravenloft',
        'Sharn quests': 'Masterminds of Sharn',
    }


def test_resolver_tries_every_exact_name_before_a_normalised_one():
    # The wiki lists the legendary version as free; the heroic one is in a pack.
    resolver = SourceResolver({'Hound of Xoriat': 'The Vale of Twilight'}, free_sources=['Legendary Hound of Xoriat'])
    assert resolver.resolve('Legendary Hound of Xoriat') == (True, None)
    assert resolver.resolve('Epic Hound of Xoriat') == (True, 'The Vale of Twilight')


def test_resolver_knows_the_pseudo_packs_and_counts_unresolved():
    resolver = SourceResolver({}, source_packs={'Anniversary Party': 'Events'})
    assert resolver.resolve_item(['DDO Store', 'Anniversary Party', 'Nowhere', 'Nowhere']) == ['DDO Store', 'Events', None, None]
    assert resolver.unresolved == {'Nowhere': 2}
    assert set(PSEUDO_PACKS) == {'DDO Store', 'Events'}


def test_merge_resolved_source_packs_adds_fallbacks_and_the_wiki_wins(monkeypatch, capsys):
    quests = {'packs': {'Quest A': 'Pack A', 'Disputed': 'Wiki Pack'}}
    written = {}
    monkeypatch.setattr(item_sources, 'read_json', lambda name: quests)
    monkeypatch.setattr(item_sources, 'write_json', lambda data, name: written.setdefault(name, data))

    merge_resolved_source_packs({'Legendary Altar of Invasion': 'The Vale of Twilight', 'Disputed': 'Fallback Pack'})

    assert written['quests']['packs'] == {
        'Quest A': 'Pack A',
        'Disputed': 'Wiki Pack',
        'Legendary Altar of Invasion': 'The Vale of Twilight',
    }
    assert "keeping 'Wiki Pack'" in capsys.readouterr().out


@pytest.mark.committed_data
def test_committed_data_has_no_unresolved_sources():
    from get_data_stats import get_unresolved_sources

    data_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'data')

    def load(name):
        with open(os.path.join(data_dir, f'{name}.json'), encoding='utf-8') as file:
            return json.load(file)

    assert get_unresolved_sources(load('quests'), load('items'), load('crafting')) == []
