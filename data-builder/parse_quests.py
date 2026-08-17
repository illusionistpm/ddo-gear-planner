from bs4 import BeautifulSoup
import os
from write_json import write_json

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


def get_adventure_pack_name_map_from_page(soup):
    pack_names = {}

    for table in soup.find_all('table', class_='wikitable'):
        table_body = table.find('tbody') or table
        header_row = table_body.find('tr')
        if header_row is None:
            continue

        headers = [_cell_text(cell) for cell in header_row.find_all(['th', 'td'])]
        if 'Name of the pack' not in headers:
            continue

        pack_idx = headers.index('Name of the pack')
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


def _canonical_pack_name(pack, heading=None, pack_name_map=None):
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

    location_section_names = {
        'Public zone',
        'Public zones',
        'Public area',
        'Public areas',
        'Wilderness adventure area',
        'Wilderness adventure areas',
    }
    content = soup.find(id='mw-content-text') or soup
    for heading in content.find_all(['h2', 'h3', 'h4']):
        section_name = _clean_section_heading(heading)
        if section_name not in location_section_names:
            continue

        for sibling in heading.find_next_siblings():
            if sibling.name in ['h2', 'h3', 'h4'] and sibling.name <= heading.name:
                break
            for link in sibling.find_all('a', href=True):
                title = str(link.get('title') or link.get_text(' ', strip=True)).strip()
                if _is_real_quest_name(title):
                    quest_packs[title] = pack

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

    quests_path = './cache/quests/Quests_by_Adventure_Pack.html'
    if os.path.exists(quests_path):
        page = open(quests_path, "r", encoding='utf-8').read()
        soup = BeautifulSoup(page, 'html.parser')
        out['packs'].update(get_quest_pack_map_from_sectioned_page(soup, pack_name_map))

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
            out['packs'].update(get_quest_pack_map_from_pack_page(soup, pack))

    write_json(out, 'quests')


if __name__ == "__main__":
    parse_quests()
