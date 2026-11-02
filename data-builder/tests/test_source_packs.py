import json
import os

from bs4 import BeautifulSoup

import source_packs as module
from source_packs import get_crafting_devices_from_category, get_device_pack_from_page, resolve_missing_device_packs


QUEST_PACKS = {'Morgrave University - Upper Commons': 'Vecna Unleashed', 'Research Facility': 'Secrets of the Artificers'}
OFFICIAL_PACKS = {'Vecna Unleashed', 'Secrets of the Artificers'}


def soup(html):
    return BeautifulSoup(f'<div id="mw-content-text">{html}</div>', 'html.parser')


def test_get_crafting_devices_from_category_skips_item_pages():
    category = BeautifulSoup('''
      <div id="mw-pages">
        <a href="/page/Sealed_Altar" title="Sealed Altar">Sealed Altar</a>
        <a href="/page/Item:Black_Stone" title="Item:Black Stone">Item:Black Stone</a>
        <a href="/page/Euphonia%27s_Hat_Box" title="Euphonia's Hat Box">Euphonia's Hat Box</a>
      </div>
    ''', 'html.parser')

    assert get_crafting_devices_from_category(category) == {
        'Sealed_Altar': 'Sealed Altar',
        'Euphonia%27s_Hat_Box': "Euphonia's Hat Box",
    }


def test_get_device_pack_from_page_reads_a_pack_linked_in_the_intro():
    # Trimmed from the Unholy Defiler of the Hidden Hand page.
    page = soup('''
      <p>The Unholy Defiler of the Hidden Hand is a <a href="/page/Crafting" title="Crafting">Crafting</a> device
      introduced with the <a href="/page/Vecna_Unleashed" title="Vecna Unleashed">Vecna Unleashed</a> expansion.</p>
    ''')

    assert get_device_pack_from_page(page, QUEST_PACKS, OFFICIAL_PACKS) == 'Vecna Unleashed'


def test_get_device_pack_from_page_reads_a_located_in_area():
    # Trimmed from the Cannith Binding Station page, whose location sits in a div.
    page = soup('''
      <div>Location in the <a href="/page/Research_Facility" title="Research Facility">Research Facility</a></div>
      <p>The Cannith Binding Station is used to further upgrade your Alchemical items.</p>
    ''')

    assert get_device_pack_from_page(page, QUEST_PACKS, OFFICIAL_PACKS) == 'Secrets of the Artificers'


def test_get_device_pack_from_page_ignores_packs_linked_away_from_the_location():
    # Altar of Fecundity: its location (Meridia) has no known pack; a pack
    # linked further down, in its recipes, must not be picked up.
    page = soup('''
      <h2>Location</h2>
      <p><a href="/page/Meridia" title="Meridia">Meridia</a>, in the central pit.</p>
      <p>An Eldritch Device for crafting.</p>
      <h2>Recipes</h2>
      <table><tr><td>Made from loot from <a href="/page/Vecna_Unleashed" title="Vecna Unleashed">Vecna Unleashed</a>, worth seeing again and again and again and again and again</td></tr></table>
    ''')

    assert get_device_pack_from_page(page, QUEST_PACKS, OFFICIAL_PACKS) is None


def test_resolve_missing_device_packs_scrapes_only_devices_not_in_the_cache(capsys):
    device_packs = {'Known Device': None}
    pages = {'New_Device': soup('<p>Found in <a href="/page/Vecna_Unleashed" title="Vecna Unleashed">Vecna Unleashed</a>.</p>')}
    read = []

    def read_page(page):
        read.append(page)
        return pages.get(page)

    added = resolve_missing_device_packs(
        {'Known_Device': 'Known Device', 'New_Device': 'New Device', 'Undownloaded': 'Undownloaded'},
        device_packs, QUEST_PACKS, OFFICIAL_PACKS, read_page,
    )

    assert added == ['New Device']
    assert device_packs == {'Known Device': None, 'New Device': 'Vecna Unleashed'}
    assert read == ['New_Device', 'Undownloaded']
    assert "'Undownloaded' has no pack entry and no downloaded page" in capsys.readouterr().out


def test_save_source_packs_writes_sorted_json(tmp_path, monkeypatch):
    path = tmp_path / 'source_packs.json'
    monkeypatch.setattr(module, 'SOURCE_PACKS_PATH', str(path))

    module.save_source_packs({'b Device': None, 'A Device': 'Pack'})

    assert path.read_text(encoding='utf-8') == '{\n  "A Device": "Pack",\n  "b Device": null\n}\n'
    assert module.load_source_packs() == {'A Device': 'Pack', 'b Device': None}


def test_checked_in_source_packs_map_names_to_a_pack_a_group_or_null():
    from item_sources import PSEUDO_PACKS

    source_packs = json.load(open(module.SOURCE_PACKS_PATH, encoding='utf-8'))
    quests = json.load(open(os.path.join(os.path.dirname(module.SOURCE_PACKS_PATH), '..', 'data', 'quests.json'), encoding='utf-8'))
    known = set(quests['officialPacks']) | set(quests['packs'].values()) | set(PSEUDO_PACKS)

    assert source_packs
    assert {pack for pack in source_packs.values() if pack} <= known
    # Free quests are scraped into freeSources, never listed by hand.
    assert not set(source_packs) & set(quests['freeSources'])
