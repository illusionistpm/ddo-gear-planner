from bs4 import BeautifulSoup
import os
import re
from write_json import write_json
from crafting_device_packs import (
    DEVICE_PAGES_CACHE_DIR,
    get_crafting_devices_from_category,
    load_device_packs,
    resolve_missing_device_packs,
    save_device_packs,
)

# What the wiki writes for content with no pack.
FREE_TO_PLAY = 'Free to Play'

CRAFTING_RAID_SOURCES = (
    'Ritual Table',
)

# Quests the wiki's pack pages don't list under their pack. The Epic
# Gianthold "Return to" quests are only named in raid-flagging text.
QUEST_PACK_ADDITIONS = {
    'Return to Cabal for One': 'Ruins of Gianthold',
    'Return to Gianthold Tor': 'Ruins of Gianthold',
    'Return to Madstone Crater': 'Ruins of Gianthold',
    'Return to Prison of the Planes': 'Ruins of Gianthold',
}


def _cell_text(cell):
    return cell.getText().replace('\xa0', ' ').strip()


def _is_real_quest_name(name):
    if not name:
        return False
    return name not in {
        'Difficulty',
        'Total',
        'Wilderness adventure area',
        'Wilderness adventure areas',
    }


def get_raids_from_page(soup):
    raids = []

    table = soup.find(id='bodyContent').find(id='mw-content-text').find('div').find('table', class_="wikitable").find('tbody')
    rows = table.find_all('tr', recursive=False)

    # For some reason, the header is showing up as a row
    rows.pop(0)

    for row in rows:
        cells = row.find_all('td')
        raids.append(cells[0].getText().strip())

    return raids


def add_crafting_raid_sources(raids):
    for source in CRAFTING_RAID_SOURCES:
        if source not in raids:
            raids.append(source)
    return raids


def add_quest_pack_additions(quest_packs):
    # The wiki wins if it ever lists one of these itself.
    for quest, pack in QUEST_PACK_ADDITIONS.items():
        quest_packs.setdefault(quest, pack)
    return quest_packs


# The wiki's reference table column has been observed under both names -
# it silently changed from "Name of the pack" to "Name of the pass" at some
# point (same table, same column, just reworded), which broke canonical
# pack-name lookups wiki-wide until this list was updated to include the
# new text. Keep both: if it flips back, or another variant shows up, this
# is the one place to add it.
PACK_NAME_COLUMN_HEADERS = ('Name of the pack', 'Name of the pass')


def get_adventure_pack_name_map_from_page(soup):
    pack_names = {}

    for table in soup.find_all('table', class_='wikitable'):
        table_body = table.find('tbody') or table
        header_row = table_body.find('tr')
        if header_row is None:
            continue

        headers = [_cell_text(cell) for cell in header_row.find_all(['th', 'td'])]
        pack_header = next((header for header in PACK_NAME_COLUMN_HEADERS if header in headers), None)
        if pack_header is None:
            continue

        pack_idx = headers.index(pack_header)
        for row in table_body.find_all('tr', recursive=False)[1:]:
            cells = row.find_all('td', recursive=False)
            if len(cells) <= pack_idx:
                continue

            cell = cells[pack_idx]
            pack_link = cell.find('a', href=True)
            pack_name = _cell_text(pack_link) if pack_link else _cell_text(cell)
            if not pack_name:
                continue

            pack_names[pack_name] = pack_name
            if pack_link:
                title = str(pack_link.get('title') or pack_link.get_text(' ', strip=True)).strip()
                text = pack_link.get_text(' ', strip=True)
                if title:
                    pack_names[title] = pack_name
                if text:
                    pack_names[text] = pack_name

    return pack_names


def _clean_section_heading(heading):
    return heading.get_text(' ', strip=True).replace('[ edit ]', '').strip()


# Each wiki page spells some packs its own way. Items keep the name they
# already carry - it's in url-codec-dictionary.json and in saved links - so
# every source's spelling is mapped back to it. The URL codec step fails on
# any new near-duplicate (case, leading "The", punctuation), naming it.
PACK_NAME_OVERRIDES = {
    'Haunted Halls of Eveningstar': 'The Haunted Halls of Eveningstar',
    'High Road of Shadows': 'The High Road of Shadows',
    'Isle of Dread': 'The Isle of Dread',
    'Ruins of Threnal': 'The Ruins of Threnal',
    'The Borderlands': 'Keep on the Borderlands',
    'The Necropolis, Part 1': 'The Necropolis Part 1',
    'The Necropolis, Part 2': 'The Necropolis Part 2',
    'The Necropolis, Part 3': 'The Necropolis Part 3',
    'The Necropolis, Part 4': 'The Necropolis Part 4',
    "The Reaver's Reach": "Reaver's Reach",
    'The Ruins of Gianthold': 'Ruins of Gianthold',
    'Vault of Night': 'The Vault of Night',
}


def _canonical_pack_name(pack, heading=None, pack_name_map=None):
    pack = _lookup_pack_name(PACK_NAME_OVERRIDES.get(pack, pack), heading, pack_name_map)
    return PACK_NAME_OVERRIDES.get(pack, pack)


def canonicalise_pack_layer(layer, pack_name_map):
    return {quest: _canonical_pack_name(pack, pack_name_map=pack_name_map) for quest, pack in layer.items()}


def _lookup_pack_name(pack, heading=None, pack_name_map=None):
    if not pack_name_map:
        return pack

    if pack in pack_name_map:
        return pack_name_map[pack]

    if heading is not None:
        for link in heading.find_all('a', href=True):
            if link.get_text(' ', strip=True).lower() == 'edit':
                continue
            title = str(link.get('title') or link.get_text(' ', strip=True)).strip()
            text = link.get_text(' ', strip=True)
            if title in pack_name_map:
                return pack_name_map[title]
            if text in pack_name_map:
                return pack_name_map[text]

    for delimiter in (' - ', ' ('):
        if delimiter in pack:
            prefix = pack.split(delimiter, 1)[0].strip()
            if prefix in pack_name_map:
                return pack_name_map[prefix]

    return pack


def get_quest_pack_map_from_sectioned_page(soup, pack_name_map=None):
    quest_packs = {}
    content = soup.find(id='mw-content-text') or soup

    for heading in content.find_all(['h2', 'h3', 'h4']):
        pack = _clean_section_heading(heading)
        if not pack or pack in ('Contents', 'Overview', 'Free-to-Play (F2P) Quest List'):
            continue
        pack = _canonical_pack_name(pack, heading, pack_name_map)

        for sibling in heading.find_next_siblings():
            if sibling.name in ['h2', 'h3', 'h4'] and sibling.name <= heading.name:
                break
            if sibling.name != 'table' or 'wikitable' not in sibling.get('class', []):
                continue

            table_body = sibling.find('tbody') or sibling
            header_row = table_body.find('tr')
            if header_row is None:
                continue

            headers = [_cell_text(cell) for cell in header_row.find_all(['th', 'td'])]
            if 'Quest Name' not in headers:
                continue

            quest_idx = headers.index('Quest Name')
            for row in table_body.find_all('tr', recursive=False)[1:]:
                cells = row.find_all('td', recursive=False)
                if len(cells) <= quest_idx:
                    continue

                quest_link = cells[quest_idx].find('a')
                quest = _cell_text(quest_link) if quest_link else _cell_text(cells[quest_idx])
                if _is_real_quest_name(quest):
                    quest_packs[quest] = pack

    return quest_packs


def get_quest_pack_map_from_pack_page(soup, pack):
    quest_packs = {}

    for table in soup.find_all('table', class_='wikitable'):
        table_body = table.find('tbody') or table
        header_row = table_body.find('tr')
        if header_row is None:
            continue

        headers = [_cell_text(cell) for cell in header_row.find_all(['th', 'td'])]
        if 'Quest Name' not in headers:
            continue

        quest_idx = headers.index('Quest Name')
        required_idx = quest_idx
        for header in ('Quest Level', 'Level', 'Base Favor', 'Patron'):
            if header in headers:
                required_idx = max(required_idx, headers.index(header))

        for row in table_body.find_all('tr', recursive=False)[1:]:
            cells = row.find_all('td', recursive=False)
            if len(cells) <= required_idx:
                continue

            quest_link = cells[quest_idx].find('a')
            quest = _cell_text(quest_link) if quest_link else _cell_text(cells[quest_idx])
            if _is_real_quest_name(quest):
                quest_packs[quest] = pack

    # Matched case-insensitively: pack pages capitalise these headings
    # inconsistently ("Wilderness Adventure Area" on Terror of Demogorgon).
    location_section_names = {
        'public zone',
        'public zones',
        'public area',
        'public areas',
        'city zone',
        'wilderness',
        'wilderness adventure area',
        'wilderness adventure areas',
    }
    content = soup.find(id='mw-content-text') or soup
    for heading in content.find_all(['h2', 'h3', 'h4']):
        section_name = _clean_section_heading(heading)
        if section_name.casefold() not in location_section_names:
            continue

        for sibling in heading.find_next_siblings():
            if sibling.name in ['h2', 'h3', 'h4'] and sibling.name <= heading.name:
                break
            for link in sibling.find_all('a', href=True):
                title = str(link.get('title') or link.get_text(' ', strip=True)).strip()
                if _is_real_quest_name(title):
                    quest_packs[title] = pack

    return quest_packs


def _add_linked_name(names, cell, pack):
    # Link titles are page names, which is what item pages cite ("Vecna
    # Unleashed (quest)", "ToEE: Fire Node"); the visible text is kept too
    # unless it already means something else.
    link = cell.find('a', href=True)
    title = str(link.get('title') or '').replace('\xa0', ' ').strip() if link else ''
    text = _cell_text(link) if link else _cell_text(cell)
    if title and _is_real_quest_name(title):
        names[title] = pack
    if text and _is_real_quest_name(text):
        names.setdefault(text, pack)


def get_quest_pack_map_from_level_page(soup):
    """Quests_by_level_and_XP: one row per quest, with its Adventure Pack."""
    quest_packs = {}

    for table in soup.find_all('table', class_='wikitable'):
        table_body = table.find('tbody') or table
        header_row = table_body.find('tr')
        if header_row is None:
            continue

        headers = [_cell_text(cell) for cell in header_row.find_all(['th', 'td'])]
        if 'Quest Name' not in headers or 'Adventure Pack' not in headers:
            continue

        quest_idx = headers.index('Quest Name')
        pack_idx = headers.index('Adventure Pack')
        for row in table_body.find_all('tr', recursive=False)[1:]:
            cells = row.find_all(['td', 'th'], recursive=False)
            if len(cells) <= max(quest_idx, pack_idx):
                continue

            pack = _cell_text(cells[pack_idx])
            if not pack or pack == FREE_TO_PLAY:
                continue
            _add_linked_name(quest_packs, cells[quest_idx], pack)

    return quest_packs


def get_area_pack_map_from_wilderness_page(soup):
    """Wilderness_adventure_area: one row per area. The Access column reads
    "<pack> <store price>"; its link titles aren't pack names ("Gianthold",
    "Amrath"), so the pack comes from the text."""
    area_packs = {}

    for table in soup.find_all('table', class_='wikitable'):
        rows = (table.find('tbody') or table).find_all('tr', recursive=False)
        header_row = next(
            (row for row in rows if 'Access' in [_cell_text(cell) for cell in row.find_all(['th', 'td'])]),
            None,
        )
        if header_row is None:
            continue

        headers = [_cell_text(cell) for cell in header_row.find_all(['th', 'td'])]
        if 'Area' not in headers:
            continue

        area_idx = headers.index('Area')
        access_idx = headers.index('Access')
        for row in rows[rows.index(header_row) + 1:]:
            cells = row.find_all(['td', 'th'], recursive=False)
            if len(cells) <= max(area_idx, access_idx):
                continue

            pack = re.sub(r'\s+[\d,]+$', '', _cell_text(cells[access_idx])).strip()
            if not pack or pack == FREE_TO_PLAY:
                continue
            _add_linked_name(area_packs, cells[area_idx], pack)

    return area_packs


def merge_pack_layer(quest_packs, layer, source):
    # Earlier layers are the better sources; a later one only fills gaps.
    for quest, pack in layer.items():
        existing = quest_packs.setdefault(quest, pack)
        if existing != pack:
            print(f"Pack conflict for '{quest}': keeping '{existing}', {source} says '{pack}'")
    return quest_packs


def get_expansion_pack_pages_from_category(soup):
    expansion_pack_pages = {}
    content = soup.find(id='mw-pages') or soup

    for link in content.find_all('a', href=True):
        href = str(link['href'])
        title = str(link.get('title') or link.getText()).strip()
        if not title or not href.startswith('/page/'):
            continue

        page_name = href.split('/page/', 1)[1].split('#', 1)[0]
        if page_name:
            expansion_pack_pages[page_name] = title

    return expansion_pack_pages


def get_official_packs(pack_name_map, expansion_pack_titles):
    # The wiki's own pack list, so the URL codec dictionary step can tell a
    # newly released pack from a renamed or misparsed one.
    return sorted(
        {_canonical_pack_name(pack, pack_name_map=pack_name_map) for pack in pack_name_map.values()}
        | {_canonical_pack_name(title, pack_name_map=pack_name_map) for title in expansion_pack_titles},
        key=str.casefold,
    )


def _read_cached_page(path):
    if not os.path.exists(path):
        return None
    return BeautifulSoup(open(path, "r", encoding='utf-8').read(), 'html.parser')


def add_crafting_device_packs(quest_packs, official_packs):
    """Items crafted at a device take the device's pack, via the same
    quest -> pack map items already look their source up in."""
    soup = _read_cached_page('./cache/quests/Crafting_devices.html')
    if soup is None:
        return quest_packs

    device_packs = load_device_packs()
    added = resolve_missing_device_packs(
        get_crafting_devices_from_category(soup),
        device_packs,
        quest_packs,
        official_packs,
        lambda page: _read_cached_page(f'{DEVICE_PAGES_CACHE_DIR}{page}.html'),
    )
    if added:
        save_device_packs(device_packs)

    return merge_pack_layer(
        quest_packs,
        {device: pack for device, pack in device_packs.items() if pack},
        'crafting_device_packs.json',
    )


def parse_quests():
    out = {}
    out['packs'] = {}

    raids_path = './cache/quests/Raids.html'
    if os.path.exists(raids_path):
        page = open(raids_path, "r", encoding='utf-8').read()

        soup = BeautifulSoup(page, 'html.parser')

        out['raids'] = get_raids_from_page(soup)
    else:
        out['raids'] = []
    add_crafting_raid_sources(out['raids'])

    pack_name_map = {}
    adventure_pack_path = './cache/quests/Adventure_Pack.html'
    if os.path.exists(adventure_pack_path):
        page = open(adventure_pack_path, "r", encoding='utf-8').read()
        soup = BeautifulSoup(page, 'html.parser')
        pack_name_map = get_adventure_pack_name_map_from_page(soup)

    level_path = './cache/quests/Quests_by_level_and_XP.html'
    if os.path.exists(level_path):
        page = open(level_path, "r", encoding='utf-8').read()
        soup = BeautifulSoup(page, 'html.parser')
        merge_pack_layer(out['packs'], canonicalise_pack_layer(get_quest_pack_map_from_level_page(soup), pack_name_map), 'Quests_by_level_and_XP')

    wilderness_path = './cache/quests/Wilderness_adventure_area.html'
    if os.path.exists(wilderness_path):
        page = open(wilderness_path, "r", encoding='utf-8').read()
        soup = BeautifulSoup(page, 'html.parser')
        merge_pack_layer(out['packs'], canonicalise_pack_layer(get_area_pack_map_from_wilderness_page(soup), pack_name_map), 'Wilderness_adventure_area')

    expansion_pack_pages = {}
    expansion_pack_category_path = './cache/quests/Expansion_Packs.html'
    if os.path.exists(expansion_pack_category_path):
        page = open(expansion_pack_category_path, "r", encoding='utf-8').read()
        soup = BeautifulSoup(page, 'html.parser')
        expansion_pack_pages = get_expansion_pack_pages_from_category(soup)

    for page_name, pack in expansion_pack_pages.items():
        pack_path = f'./cache/quests/{page_name}.html'
        if os.path.exists(pack_path):
            page = open(pack_path, "r", encoding='utf-8').read()
            soup = BeautifulSoup(page, 'html.parser')
            merge_pack_layer(out['packs'], canonicalise_pack_layer(get_quest_pack_map_from_pack_page(soup, pack), pack_name_map), page_name)

    quests_path = './cache/quests/Quests_by_Adventure_Pack.html'
    if os.path.exists(quests_path):
        page = open(quests_path, "r", encoding='utf-8').read()
        soup = BeautifulSoup(page, 'html.parser')
        merge_pack_layer(out['packs'], get_quest_pack_map_from_sectioned_page(soup, pack_name_map), 'Quests_by_Adventure_Pack')

    add_quest_pack_additions(out['packs'])

    out['officialPacks'] = get_official_packs(pack_name_map, expansion_pack_pages.values())

    add_crafting_device_packs(out['packs'], set(out['officialPacks']))

    write_json(out, 'quests')


if __name__ == "__main__":
    parse_quests()
