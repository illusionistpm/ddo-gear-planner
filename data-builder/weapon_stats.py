"""A weapon's damage dice and critical profile, from its item table row and its type.

The item tables' "Damage and Type" column reads like "5.80[1d8+2] + 15 Slash, Magic": the
weapon dice multiplier ([W]), the dice, then the enhancement bonus (already an affix). A
weapon whose critical profile differs from its type's says so in "Unusual Characteristics"
("Critical Profile: 17-20 / x2"); those are the items of Category:Weapons with non-standard
crit profiles. The type's own profile is on the Basic_*_weapons pages.
"""
import re
from typing import TypedDict

from bs4 import BeautifulSoup

from get_snapshot_path import get_snapshot_path


class WeaponDamage(TypedDict):
    # The [W] multiplier: 5.8 for "5.80[1d8+2]", 1 for a bare "[1d10]".
    w: float
    # The dice inside the brackets, with any bonus: "1d8+2".
    dice: str


DAMAGE_PATTERN = re.compile(r'^\s*(\d+(?:\.\d+)?)?\s*\[\s*(\d+)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?\s*\]')
# A row that drops the brackets: its "+ N" is the enhancement bonus, not the dice's.
UNBRACKETED_DAMAGE_PATTERN = re.compile(r'^\s*()(\d+)\s*d\s*(\d+)()()\b')
CRITICAL_PATTERN = re.compile(r'(\d+)\s*(?:-\s*(\d+))?\s*/\s*x\s*(\d+)')


def parse_damage(text: str) -> WeaponDamage | None:
    match = DAMAGE_PATTERN.match(text) or UNBRACKETED_DAMAGE_PATTERN.match(text)
    if match is None:
        return None
    w, count, sides, sign, bonus = match.groups()
    dice = f'{count}d{sides}' + (f'{sign}{bonus}' if bonus and int(bonus) else '')
    return {'w': float(w) if w else 1.0, 'dice': dice}


def normalize_critical(text: str) -> str | None:
    """'17-20 / x2' -> '17-20/x2', '20 / x3' -> '20/x3'."""
    match = CRITICAL_PATTERN.search(text)
    if match is None:
        return None
    low, high, multiplier = match.groups()
    return f'{low}-{high}/x{multiplier}' if high else f'{low}/x{multiplier}'


def parse_critical_profile(unusual: str) -> str | None:
    """The critical profile an "Unusual Characteristics" cell gives, if any."""
    match = re.search(r'Critical Profile:\s*([^A-Za-z]*x\s*\d+)', unusual)
    return normalize_critical(match.group(1)) if match else None


def item_type_name(weapon: str) -> str:
    """A Basic_*_weapons row's name as the item pages' category: 'Long Sword' -> 'Long Swords'."""
    if weapon == 'Unarmed':
        return 'Handwraps'
    if weapon.endswith(('s', 'x', 'z', 'ch', 'sh')):
        return f'{weapon}es'
    if re.search(r'[^aeiou]y$', weapon):
        return f'{weapon[:-1]}ies'
    return f'{weapon}s'


def get_type_critical_profiles_from_page(soup: BeautifulSoup) -> dict[str, str]:
    """Item type -> critical profile, from a Basic_*_weapons page's table."""
    profiles: dict[str, str] = {}
    table = soup.find('table', class_='wikitable')
    if table is None:
        return profiles
    rows = table.find_all('tr')
    headers = [cell.get_text(' ', strip=True) for cell in rows[0].find_all(['th', 'td'])]
    if 'Critical Profile' not in headers:
        return profiles
    column = headers.index('Critical Profile')
    for row in rows[1:]:
        cells = row.find_all('td', recursive=False)
        if len(cells) <= column:
            continue
        name = cells[0].get_text(' ', strip=True)
        critical = normalize_critical(cells[column].get_text(' ', strip=True))
        if name and critical and not name.startswith('Composite'):
            profiles[item_type_name(name)] = critical
    return profiles


def get_type_critical_profiles() -> dict[str, str]:
    from download_wiki_pages import get_item_type_urls
    profiles: dict[str, str] = {}
    for page in get_item_type_urls():
        with open(get_snapshot_path('item_types', f'{page}.html'), encoding='utf-8') as fh:
            profiles.update(get_type_critical_profiles_from_page(BeautifulSoup(fh.read(), 'html.parser')))
    return profiles
