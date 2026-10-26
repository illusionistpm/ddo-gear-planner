"""Crafting devices (Category:Crafting_devices) are item sources, not quests, so
no quest list gives them a pack. Their packs are cached in
crafting_device_packs.json - checked in, hand-correctable - and only a device
missing from it has its page downloaded and scraped. A null entry means the
device has no pack, or that scraping couldn't tell; fix those by hand.
"""
import json
import os
import re

DEVICE_PACKS_PATH = os.path.join(os.path.dirname(__file__), 'crafting_device_packs.json')
DEVICE_PAGES_CACHE_DIR = 'cache/crafting_devices/'


def load_device_packs():
    with open(DEVICE_PACKS_PATH, 'r', encoding='utf-8') as file:
        return json.load(file)


def save_device_packs(device_packs):
    with open(DEVICE_PACKS_PATH, 'w', encoding='utf-8', newline='\n') as file:
        json.dump(dict(sorted(device_packs.items(), key=lambda entry: entry[0].casefold())), file, indent=2, ensure_ascii=False)
        file.write('\n')


def get_crafting_devices_from_category(soup):
    """{page name: device name}. Items cite the device by the category's name,
    which isn't always the title its page redirects to."""
    # parse_quests imports this module, so this import can't be at the top.
    from parse_quests import get_expansion_pack_pages_from_category

    return {
        page: name
        for page, name in get_expansion_pack_pages_from_category(soup).items()
        if not name.startswith('Item:')
    }


def get_missing_devices(devices, device_packs):
    return {page: name for page, name in devices.items() if name not in device_packs}


def _location_blocks(content):
    blocks = []
    for heading in content.find_all(['h2', 'h3', 'h4']):
        if 'location' in heading.get_text().casefold():
            for sibling in heading.find_next_siblings():
                if sibling.name in ['h2', 'h3', 'h4']:
                    break
                blocks.append(sibling)
    blocks += [paragraph for paragraph in content.find_all('p') if paragraph.get_text(strip=True)][:3]
    blocks += [
        element for element in content.find_all(['p', 'li', 'div', 'td'])
        if len(element.get_text()) < 600
        and re.search(r'\blocated\b|^\s*location\b', element.get_text(' ', strip=True), re.I)
    ]
    return blocks


def get_device_pack_from_page(soup, quest_packs, official_packs):
    """The first link near the page's location text that is a pack, or a
    quest/area with a known pack. None if there isn't one."""
    content = soup.find(id='mw-content-text') or soup
    for block in _location_blocks(content):
        for link in block.find_all('a', href=True):
            title = str(link.get('title') or '').replace('\xa0', ' ').strip()
            if title in official_packs:
                return title
            if title in quest_packs:
                return quest_packs[title]
    return None


def resolve_missing_device_packs(devices, device_packs, quest_packs, official_packs, read_page):
    """Scrape each device missing from device_packs. read_page(page) returns its
    soup, or None if it wasn't downloaded. Returns the device names added."""
    added = []
    for page, name in get_missing_devices(devices, device_packs).items():
        soup = read_page(page)
        if soup is None:
            print(f"Crafting device '{name}' has no pack entry and no downloaded page; add it to crafting_device_packs.json")
            continue

        pack = get_device_pack_from_page(soup, quest_packs, official_packs)
        device_packs[name] = pack
        added.append(name)
        if pack is None:
            print(f"Crafting device '{name}' added with no pack - couldn't tell from its page. Set it in crafting_device_packs.json if it has one.")
        else:
            print(f"Crafting device '{name}' added with pack '{pack}' from its page - check it in crafting_device_packs.json.")
    return added
