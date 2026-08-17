from pathlib import Path
from urllib.parse import unquote

from bs4 import BeautifulSoup


def normalize_item_name(name: str) -> str:
    return unquote(name).replace('_', ' ').replace('\xa0', ' ').strip()


def get_rare_loot_from_page(soup: BeautifulSoup) -> set[str]:
    rare_items = set()
    content = soup.find(id='mw-pages') or soup

    for link in content.find_all('a', href=True):
        href = str(link['href'])
        title = str(link.get('title') or '')
        if title.startswith('Item:'):
            rare_items.add(normalize_item_name(title.split(':', 1)[1]))
        elif '/page/Item:' in href:
            rare_items.add(normalize_item_name(href.split('/page/Item:', 1)[1].split('#', 1)[0]))

    return rare_items


def get_rare_loot_from_cache(cache_path: Path = Path('./cache/rare_loot')) -> set[str]:
    rare_items = set()

    if cache_path.exists():
        for page_path in sorted(cache_path.glob('*.html')):
            page = page_path.read_text(encoding='utf-8')
            soup = BeautifulSoup(page, 'html.parser')
            rare_items.update(get_rare_loot_from_page(soup))

    return rare_items


if __name__ == "__main__":
    for item_name in sorted(get_rare_loot_from_cache()):
        print(item_name)
