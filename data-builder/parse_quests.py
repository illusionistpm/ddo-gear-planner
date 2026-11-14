from bs4 import BeautifulSoup
from datetime import datetime, timezone
import os
import re
from write_json import write_json
from source_packs import (
    DEVICE_PAGES_DIR,
    get_crafting_devices_from_category,
    load_source_packs,
    resolve_missing_device_packs,
    save_source_packs,
)
from get_snapshot_path import get_snapshot_path

# What the wiki writes for content with no pack. The level and wilderness
# pages' parsers keep it as a pack value while layers merge, so an older
# source can't give one of those quests a pack; drop_free_to_play removes it.
FREE_TO_PLAY = 'Free to Play'

CRAFTING_RAID_SOURCES = (
    'Ritual Table',
)


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


def drop_free_to_play(quest_packs):
    """Removes the free-to-play quests from the pack map and returns them."""
    free = [quest for quest, pack in quest_packs.items() if pack == FREE_TO_PLAY]
    for quest in free:
        del quest_packs[quest]
    return free


def _name_order(name):
    # Casefolded, then exact, so names differing only in case ("Durk's Got A
    # Secret", "Durk's Got a Secret") keep one order from build to build.
    return (name.casefold(), name)


def get_free_quests_from_category_page(soup):
    """Category:Free_to_Play_quests: its quest table, and the category's own
    page list, which also has the quests the table leaves out. Under 200
    pages, so the list fits on one page."""
    free = {}
    for table in soup.find_all('table', class_='wikitable'):
        table_body = table.find('tbody') or table
        header_row = table_body.find('tr')
        if header_row is None:
            continue

        headers = [_cell_text(cell) for cell in header_row.find_all(['th', 'td'])]
        name_header = next((header for header in ('Quest Name', 'Name') if header in headers), None)
        if name_header is None:
            continue

        name_idx = headers.index(name_header)
        for row in table_body.find_all('tr', recursive=False)[1:]:
            cells = row.find_all(['td', 'th'], recursive=False)
            if len(cells) > name_idx:
                _add_linked_name(free, cells[name_idx], FREE_TO_PLAY)

    pages = soup.find(id='mw-pages')
    if pages is not None:
        for link in pages.find_all('a', href=True):
            title = str(link.get('title') or '').replace('\xa0', ' ').strip()
            if not str(link['href']).startswith('/page/'):
                continue
            if _is_real_quest_name(title) and not title.startswith('Category:'):
                free[title] = FREE_TO_PLAY

    return sorted(free, key=_name_order)


def get_free_sources(free_quests, quest_packs):
    """The free quests, less any a pack claims - the pack wins."""
    free = set()
    for quest in free_quests:
        if quest in quest_packs:
            print(f"Free-to-play quest '{quest}' is also in pack '{quest_packs[quest]}'; keeping the pack")
            continue
        free.add(quest)
    return sorted(free, key=_name_order)


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


RELEASE_COLUMN_HEADERS = ('Release Date', 'Released')


def get_pack_releases_from_page(soup, pack_name_map=None):
    """{pack: 'YYYY-MM-DD'} from a pack table's release column. The cell
    shows an update name ("Module 4.3", "Update 44"); the date is its sort
    key, seconds since 1970."""
    releases = {}

    for table in soup.find_all('table', class_='wikitable'):
        table_body = table.find('tbody') or table
        header_row = table_body.find('tr')
        if header_row is None:
            continue

        headers = [_cell_text(cell) for cell in header_row.find_all(['th', 'td'])]
        pack_header = next((header for header in PACK_NAME_COLUMN_HEADERS if header in headers), None)
        # "Release<br>Date": the break leaves no space in the cell's text.
        spaced = [' '.join(cell.get_text(' ').split()) for cell in header_row.find_all(['th', 'td'])]
        release_header = next((header for header in RELEASE_COLUMN_HEADERS if header in spaced), None)
        if pack_header is None or release_header is None:
            continue

        pack_idx = headers.index(pack_header)
        release_idx = spaced.index(release_header)
        for row in table_body.find_all('tr', recursive=False)[1:]:
            cells = row.find_all('td', recursive=False)
            if len(cells) <= max(pack_idx, release_idx):
                continue

            sort_value = str(cells[release_idx].get('data-sort-value') or '')
            if not re.fullmatch(r'\d+', sort_value):
                continue

            pack_link = cells[pack_idx].find('a', href=True)
            pack = _cell_text(pack_link) if pack_link else _cell_text(cells[pack_idx])
            if not pack:
                continue
            released = datetime.fromtimestamp(int(sort_value), tz=timezone.utc).strftime('%Y-%m-%d')
            releases[_canonical_pack_name(pack, pack_name_map=pack_name_map)] = released

    return releases


def get_pack_info(pack_releases, expansion_releases):
    """{pack: {released, expansion}} for the pack filter, which lists
    expansions apart and both in release order. An expansion is also in the
    adventure pack table, dated when it reached the DDO Store; its own
    table's date, its launch, wins."""
    return {
        pack: {
            'released': expansion_releases.get(pack, pack_releases.get(pack)),
            'expansion': pack in expansion_releases,
        }
        for pack in sorted(set(pack_releases) | set(expansion_releases), key=_name_order)
    }


COUPON_CONTENT_HEADER = 'Content Granted'

# Adventure_Pack's footnotes: these arcs are sold only as part of the
# expansion, yet items cite them as sources and so they are packs of their own
# in the filter. A coupon for the expansion grants them too.
EXPANSION_PARTS = {
    'Shadowfell Conspiracy': ('Disciples of Shadow', 'Shadow Over Wheloon', 'The Secret of the Storm Horns'),
}


def _plain_text(text):
    # The wiki pads date ranges with zero-width joiners.
    return ' '.join(str(text).replace('\u200d', '').split())


def get_coupon_codes_from_page(soup):
    """The codes in the page's "So far available" list, in order. A coupon's
    alternative code is nested under it and isn't a coupon of its own."""
    content = soup.find(id='mw-content-text') or soup
    codes = []
    for mark in content.find_all('mark', id=True):
        item = mark.find_parent('li')
        if item is None or item.find_parent('li') is not None:
            continue
        codes.append(_plain_text(mark.get_text()))
    return codes


def get_coupons_from_page(soup, official_packs, pack_name_map=None):
    """Free_Questing_Coupon's comparison table: a column per coupon, a row
    per thing granted, ticked (sort key 1) where the coupon grants it. Rows
    that aren't packs - classes, races, character slots - are dropped.

    Returns [{label, available, code, packs}], in column order, oldest first.
    The table doesn't name the codes; they come from the list above it,
    which has one per column in the same order. If the two ever disagree in
    length the codes are left out rather than guessed."""
    coupons = []

    for table in soup.find_all('table', class_='wikitable'):
        table_body = table.find('tbody') or table
        rows = table_body.find_all('tr', recursive=False)
        if not rows:
            continue

        header_cells = rows[0].find_all(['th', 'td'], recursive=False)
        headers = [_plain_text(cell.get_text(' ')) for cell in header_cells]
        if COUPON_CONTENT_HEADER not in headers:
            continue

        content_idx = headers.index(COUPON_CONTENT_HEADER)
        columns = {}
        for idx, cell in enumerate(header_cells[:content_idx]):
            period = cell.find('abbr', title=True)
            if period is None:
                continue
            columns[idx] = {
                'label': headers[idx],
                'available': _plain_text(period['title']),
                'packs': set(),
            }

        for row in rows[1:]:
            cells = row.find_all(['td', 'th'], recursive=False)
            if len(cells) <= content_idx:
                continue

            link = cells[content_idx].find('a', href=True)
            names = [_cell_text(link), str(link.get('title') or '').strip()] if link else [_cell_text(cells[content_idx])]
            pack = next(
                (
                    canonical for canonical in (_canonical_pack_name(name, pack_name_map=pack_name_map) for name in names if name)
                    if canonical in official_packs
                ),
                None,
            )
            if pack is None:
                continue

            granted = [pack] + [part for part in EXPANSION_PARTS.get(pack, ()) if part in official_packs]
            for idx, column in columns.items():
                if str(cells[idx].get('data-sort-value') or '').strip() == '1':
                    column['packs'].update(granted)

        coupons = list(columns.values())
        break

    codes = get_coupon_codes_from_page(soup)
    if len(codes) != len(coupons):
        print(f'Free_Questing_Coupon lists {len(codes)} codes for {len(coupons)} coupons; leaving the codes out')
        codes = [''] * len(coupons)

    return [
        {
            'label': coupon['label'],
            'available': coupon['available'],
            'code': code,
            'packs': sorted(coupon['packs'], key=_name_order),
        }
        for coupon, code in zip(coupons, codes)
        if coupon['packs']
    ]


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
    # A free content series, not a store pack, that the level page lists in
    # its Adventure Pack column.
    'Illithid Invasion': FREE_TO_PLAY,
}


def _canonical_pack_name(pack, heading=None, pack_name_map=None):
    pack = _lookup_pack_name(PACK_NAME_OVERRIDES.get(pack, pack), heading, pack_name_map)
    return PACK_NAME_OVERRIDES.get(pack, pack)


def canonicalise_pack_layer(layer, pack_name_map):
    return {
        quest: pack if pack == FREE_TO_PLAY else _canonical_pack_name(pack, pack_name_map=pack_name_map)
        for quest, pack in layer.items()
    }


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
            if not pack:
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
            if not pack:
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


def _read_snapshot_page(path):
    if not os.path.exists(path):
        return None
    return BeautifulSoup(open(path, "r", encoding='utf-8').read(), 'html.parser')


def add_source_packs(quest_packs, official_packs):
    """source_packs.json's entries with a pack, as the last layer: items from
    a device, the store or an event look them up in the same map as quests.
    Newly listed crafting devices are scraped into the file first."""
    source_packs = load_source_packs()
    soup = _read_snapshot_page(get_snapshot_path('quests', 'Crafting_devices.html'))
    if soup is not None:
        added = resolve_missing_device_packs(
            get_crafting_devices_from_category(soup),
            source_packs,
            quest_packs,
            official_packs,
            lambda page: _read_snapshot_page(os.path.join(DEVICE_PAGES_DIR, f'{page}.html')),
        )
        if added:
            save_source_packs(source_packs)

    return merge_pack_layer(
        quest_packs,
        {source: pack for source, pack in source_packs.items() if pack},
        'source_packs.json',
    )


def parse_quests():
    out = {}
    out['packs'] = {}

    raids_path = get_snapshot_path('quests', 'Raids.html')
    if os.path.exists(raids_path):
        page = open(raids_path, "r", encoding='utf-8').read()

        soup = BeautifulSoup(page, 'html.parser')

        out['raids'] = get_raids_from_page(soup)
    else:
        out['raids'] = []
    add_crafting_raid_sources(out['raids'])

    pack_name_map = {}
    pack_releases = {}
    adventure_pack_path = get_snapshot_path('quests', 'Adventure_Pack.html')
    if os.path.exists(adventure_pack_path):
        page = open(adventure_pack_path, "r", encoding='utf-8').read()
        soup = BeautifulSoup(page, 'html.parser')
        pack_name_map = get_adventure_pack_name_map_from_page(soup)
        pack_releases = get_pack_releases_from_page(soup, pack_name_map)

    level_path = get_snapshot_path('quests', 'Quests_by_level_and_XP.html')
    if os.path.exists(level_path):
        page = open(level_path, "r", encoding='utf-8').read()
        soup = BeautifulSoup(page, 'html.parser')
        merge_pack_layer(out['packs'], canonicalise_pack_layer(get_quest_pack_map_from_level_page(soup), pack_name_map), 'Quests_by_level_and_XP')

    wilderness_path = get_snapshot_path('quests', 'Wilderness_adventure_area.html')
    if os.path.exists(wilderness_path):
        page = open(wilderness_path, "r", encoding='utf-8').read()
        soup = BeautifulSoup(page, 'html.parser')
        merge_pack_layer(out['packs'], canonicalise_pack_layer(get_area_pack_map_from_wilderness_page(soup), pack_name_map), 'Wilderness_adventure_area')

    expansion_pack_pages = {}
    expansion_releases = {}
    expansion_pack_category_path = get_snapshot_path('quests', 'Expansion_Packs.html')
    if os.path.exists(expansion_pack_category_path):
        page = open(expansion_pack_category_path, "r", encoding='utf-8').read()
        soup = BeautifulSoup(page, 'html.parser')
        expansion_pack_pages = get_expansion_pack_pages_from_category(soup)
        expansion_releases = get_pack_releases_from_page(soup, pack_name_map)

    for page_name, pack in expansion_pack_pages.items():
        pack_path = get_snapshot_path('quests', f'{page_name}.html')
        if os.path.exists(pack_path):
            page = open(pack_path, "r", encoding='utf-8').read()
            soup = BeautifulSoup(page, 'html.parser')
            merge_pack_layer(out['packs'], canonicalise_pack_layer(get_quest_pack_map_from_pack_page(soup, pack), pack_name_map), page_name)

    quests_path = get_snapshot_path('quests', 'Quests_by_Adventure_Pack.html')
    if os.path.exists(quests_path):
        page = open(quests_path, "r", encoding='utf-8').read()
        soup = BeautifulSoup(page, 'html.parser')
        merge_pack_layer(out['packs'], get_quest_pack_map_from_sectioned_page(soup, pack_name_map), 'Quests_by_Adventure_Pack')

    free_quests = drop_free_to_play(out['packs'])

    free_category_path = get_snapshot_path('quests', 'Free_to_Play_quests.html')
    if os.path.exists(free_category_path):
        page = open(free_category_path, "r", encoding='utf-8').read()
        soup = BeautifulSoup(page, 'html.parser')
        free_quests += get_free_quests_from_category_page(soup)

    out['officialPacks'] = get_official_packs(pack_name_map, expansion_pack_pages.values())
    out['packInfo'] = get_pack_info(pack_releases, expansion_releases)

    out['coupons'] = []
    coupon_path = get_snapshot_path('quests', 'Free_Questing_Coupon.html')
    if os.path.exists(coupon_path):
        page = open(coupon_path, "r", encoding='utf-8').read()
        soup = BeautifulSoup(page, 'html.parser')
        out['coupons'] = get_coupons_from_page(soup, set(out['officialPacks']), pack_name_map)

    add_source_packs(out['packs'], set(out['officialPacks']))

    out['freeSources'] = get_free_sources(free_quests, out['packs'])

    write_json(out, 'quests')


if __name__ == "__main__":
    parse_quests()
