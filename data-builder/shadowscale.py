"""Shadowscale Armor upgrades (Magma Forge).

The item tables flag a Shadowscale armor that can still be upgraded as "Flawed
Shadowscale Armor". The Thunder-Forged page's Shadowscale Armor table lists the
upgrades: each one's effects, the armor types it can be applied to, and what
every upgrade adds (a Green Augment Slot).
"""
import copy
import os
import re
from dataclasses import dataclass
from functools import cache
from typing import Callable

from bs4 import BeautifulSoup, Tag

from get_snapshot_path import get_snapshot_path
from typedefs import Affix, CraftingSystems, Item, SetAugment

# The flag the item tables give a Shadowscale armor that can still be upgraded.
SHADOWSCALE_SYSTEM = 'Flawed Shadowscale Armor'
# The crafting system that replaces it.
SHADOWSCALE_UPGRADE_SYSTEM = 'Shadowscale Upgrade'
THUNDER_FORGED_PATH = get_snapshot_path('crafting', 'Thunder-Forged.html')
# An effect that only applies under a condition ("DR 60/Epic while below 75% health").
CONDITIONAL_EFFECT = re.compile(r'\bwhile\b', re.IGNORECASE)

# The table's compatibility columns, by the item type the item tables give.
ARMOR_TYPE_COLUMNS = {
    'Cloth armor': 'Cloth',
    'Light armor': 'Light',
    'Medium armor': 'Medium',
    'Heavy armor': 'Heavy',
    'Docents': 'Docent',
}


@dataclass
class ShadowscaleUpgrades:
    # (option name, its effects as a cell the item parser reads, the armor columns it fits)
    options: list[tuple[str, Tag, set[str]]]
    # What every upgrade adds, as a cell the item parser reads.
    shared: Tag


def _as_cell(entries: list[Tag]) -> Tag:
    cell = BeautifulSoup('<td><ul></ul></td>', 'html.parser').td
    for li in entries:
        cell.ul.append(copy.copy(li))
    return cell


def _own_text(li: Tag) -> str:
    """The entry's text without its tooltip or nested entries."""
    own = copy.copy(li)
    for nested in own.select('span.tooltip, ul'):
        nested.decompose()
    return own.get_text(' ', strip=True)


def _find_upgrade_table(soup: BeautifulSoup) -> Tag:
    anchor = soup.find(id='Shadowscale_Armor')
    heading = anchor.find_parent('h2') if anchor is not None else None
    if heading is None:
        raise ValueError("Thunder-Forged has no 'Shadowscale Armor' section")
    for element in heading.find_all_next(['h2', 'table']):
        if element.name == 'h2':
            break
        if 'Compatibility' in element.find('tr').get_text():
            return element
    raise ValueError("Thunder-Forged's Shadowscale Armor section has no upgrade table")


def get_shadowscale_upgrades_from_wiki(soup: BeautifulSoup) -> ShadowscaleUpgrades:
    """The upgrades in the Thunder-Forged page's Shadowscale Armor table.

    Its rows: a header, the compatibility columns' names, then one row per upgrade.
    The first upgrade's row also holds the cost and the shared properties, spanning
    every row. An effect that only applies under a condition is left out: the
    planner would count it all the time.
    """
    rows = _find_upgrade_table(soup).find_all('tr')
    columns = [cell.get_text(strip=True) for cell in rows[1].find_all(['th', 'td'], recursive=False)]

    options = []
    shared = None
    for index, row in enumerate(rows[2:]):
        cells = row.find_all('td', recursive=False)
        if index == 0:
            # cost, upgrade, shared properties, then the compatibility marks
            shared = _as_cell(cells[2].select('ul > li'))
            cells = [cells[1]] + cells[3:]
        if len(cells) != len(columns) + 1:
            raise ValueError(f"Thunder-Forged's Shadowscale upgrade row has {len(cells)} cells, expected {len(columns) + 1}")

        upgrade = cells[0].find('li')
        name = upgrade.find('b').get_text(strip=True)
        effects = [li for li in upgrade.find('ul').find_all('li', recursive=False)
                   if not CONDITIONAL_EFFECT.search(_own_text(li))]
        fits = {column for column, mark in zip(columns, cells[1:]) if '✓' in mark.get_text()}
        options.append((name, _as_cell(effects), fits))

    assert shared is not None
    return ShadowscaleUpgrades(options, shared)


@cache
def load_shadowscale_upgrades(path: str = THUNDER_FORGED_PATH) -> ShadowscaleUpgrades | None:
    """None when the page isn't in the snapshot."""
    if not os.path.exists(path):
        return None
    with open(path, 'r', encoding='utf-8') as fh:
        return get_shadowscale_upgrades_from_wiki(BeautifulSoup(fh.read(), 'html.parser'))


def add_shadowscale_upgrade_options(
    craftingSystems: CraftingSystems,
    item: Item|SetAugment,
    parse_cell: Callable[[Tag], list[Affix]],
    upgrades: ShadowscaleUpgrades | None = None,
) -> list[str] | None:
    """Offer the item the upgrades its armor type takes, as a crafting system.

    Returns the crafting systems every upgrade adds (the Green Augment Slot), which
    belong to the item itself: a crafting option can't add one. Anything else every
    upgrade adds goes on each option. None, leaving the item flagged, when the table
    isn't in the snapshot or offers its armor type nothing.
    """
    upgrades = upgrades or load_shadowscale_upgrades()
    column = ARMOR_TYPE_COLUMNS.get(item['type'])
    if upgrades is None or column is None:
        return None

    shared = parse_cell(copy.copy(upgrades.shared))
    added_systems = [affix['name'] for affix in shared if affix['name'] in craftingSystems]
    shared_effects = [affix for affix in shared if affix['name'] not in craftingSystems]

    options = [{'name': name, 'affixes': parse_cell(copy.copy(effects)) + copy.deepcopy(shared_effects)}
               for name, effects, fits in upgrades.options if column in fits]
    if not options:
        return None
    craftingSystems.setdefault(SHADOWSCALE_UPGRADE_SYSTEM, {})[item['name']] = options
    return added_systems
