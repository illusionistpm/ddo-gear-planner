"""Enchantments of the Vaults of the Artificers upgradeable items.

The item list tables give most of their upgrade tiers only as "VotAU". The
category page lists every one with its full enchantments, so parse_items
takes those rows' enchantments from here.
"""
from pathlib import Path

from bs4 import BeautifulSoup, Tag

from get_snapshot_path import get_snapshot_path

VOTA_PLACEHOLDER = 'VotAU'


def get_vota_enchantment_cells_from_page(soup: BeautifulSoup) -> dict[str, Tag]:
    cells: dict[str, Tag] = {}
    content = soup.find(id='mw-content-text') or soup

    for table in content.find_all('table'):
        rows = table.find_all('tr')
        if not rows:
            continue
        headers = [cell.get_text(' ', strip=True) for cell in rows[0].find_all(['th', 'td'])]
        if 'Item' not in headers or 'Enhancements' not in headers:
            continue
        item_idx, enchantments_idx = headers.index('Item'), headers.index('Enhancements')

        for row in rows[1:]:
            fields = row.find_all('td', recursive=False)
            if len(fields) <= max(item_idx, enchantments_idx):
                continue
            link = fields[item_idx].find('a')
            if link is None:
                continue
            cells[link.get_text().strip()] = fields[enchantments_idx]

    return cells


def get_vota_enchantment_cells(snapshot_path: Path = Path(get_snapshot_path('vota_items'))) -> dict[str, Tag]:
    """{item name: its enchantments <td>}, empty when the snapshot has no such page."""
    cells: dict[str, Tag] = {}

    if snapshot_path.exists():
        for page_path in sorted(snapshot_path.glob('*.html')):
            soup = BeautifulSoup(page_path.read_text(encoding='utf-8'), 'html.parser')
            cells.update(get_vota_enchantment_cells_from_page(soup))

    return cells


def is_vota_placeholder(cell: Tag) -> bool:
    return cell.get_text(' ', strip=True) == VOTA_PLACEHOLDER
