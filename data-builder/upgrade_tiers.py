"""Items that upgrade in place through fixed tiers (Vaults of the Artificers,
Treasure of Crystal Cove).

The wiki lists them as one enchantments list with "Upgradeable - Tier N"
markers. Everything up to the second marker is the item as it drops. Each
later marker's entries are what that upgrade changes:

- "A → B" (or "A becomes B"): B replaces A, which the tier's option names in
  `replaces` so the planner stops counting A
- "Adds X": X is new, often an augment slot, which the tier's option names in
  `addsCrafting` (the item lists the slot too, closed until a tier opens it)
- anything else: added as it is

VotA nests each tier's entries under its marker. Crystal Cove lists Tier 1
flat and nests the later markers inside its last entry. A trinket with one
marker ("Upgradeable - Tier 2") is just labelled, with nothing to upgrade.
"""
import copy
import re
from dataclasses import dataclass, field

from bs4 import BeautifulSoup, NavigableString, Tag

UPGRADE_TIER_SYSTEM = 'Upgrade Tier'


@dataclass
class UpgradeTier:
    """What one upgrade changes on the item before it."""
    tier: int
    # The effects it gains.
    gained: list[dict] = field(default_factory=list)
    # The effects it takes away ("A" of "A -> B"), each with the gained effect that
    # takes its place ("B"), if there's one.
    replaced: list[tuple[dict, dict | None]] = field(default_factory=list)
    # The crafting systems ("Adds Green Augment Slot") it adds.
    slots: list[str] = field(default_factory=list)

TIER_MARKER_PATTERN = re.compile(r'^Upgradeable - Tier (\d+)$')
ARROW = '→'
# Some upgrades are written out: "Potency +36 becomes Potency +44".
BECOMES = ' becomes '
ADDS = 'Adds'


def own_text(li: Tag) -> str:
    """The entry's text without its nested lists or tooltips."""
    own = copy.copy(li)
    for nested in own.find_all('ul'):
        nested.decompose()
    for tooltip in own.select('span.tooltip'):
        tooltip.decompose()
    return ' '.join(own.get_text(' ', strip=True).split())


def get_tier_marker(li: Tag) -> int|None:
    search = TIER_MARKER_PATTERN.match(own_text(li))
    return int(search.group(1)) if search else None


def has_tier_markers(cell: Tag) -> bool:
    return any(get_tier_marker(li) is not None for li in cell.find_all('li'))


def split_upgrade_tiers(cell: Tag) -> tuple[list[Tag], list[tuple[int, list[Tag]]]]:
    """(the dropped item's entries, [(tier, that upgrade's entries)]), markers left out."""
    base: list[Tag] = []
    upgrades: list[tuple[int, list[Tag]]] = []
    seen_marker = False

    def current() -> list[Tag]:
        return upgrades[-1][1] if upgrades else base

    def visit_entries(tag: Tag) -> None:
        for ul in tag.find_all('ul', recursive=False):
            for li in ul.find_all('li', recursive=False):
                visit(li)

    def visit(li: Tag) -> None:
        nonlocal seen_marker
        tier = get_tier_marker(li)

        if tier is not None:
            if seen_marker:
                upgrades.append((tier, []))
            seen_marker = True
            visit_entries(li)
        elif has_tier_markers(li):
            # Crystal Cove: the later tiers hang off the last Tier 1 entry.
            own = copy.copy(li)
            for ul in own.find_all('ul', recursive=False):
                ul.decompose()
            current().append(own)
            visit_entries(li)
        else:
            # Any other nested list is a choice ("One of", augment colours):
            # the entry is parsed whole, as it is elsewhere.
            current().append(li)

    visit_entries(cell)

    return base, upgrades


def _entry_after(marker_string: NavigableString, marker: str) -> Tag:
    """A new <li> holding what follows `marker` in `marker_string` and its later siblings."""
    entry = BeautifulSoup('<li></li>', 'html.parser').li
    assert entry is not None
    rest = marker_string.split(marker, 1)[1].strip()
    if rest:
        entry.append(rest)
    for sibling in marker_string.next_siblings:
        entry.append(copy.copy(sibling))
    return entry


def _entry_before(marker_string: NavigableString, marker: str) -> Tag:
    """A new <li> holding what precedes `marker` in `marker_string`, and its earlier siblings."""
    entry = BeautifulSoup('<li></li>', 'html.parser').li
    assert entry is not None
    for sibling in reversed(list(marker_string.previous_siblings)):
        entry.append(copy.copy(sibling))
    before = marker_string.split(marker, 1)[0].strip()
    if before:
        entry.append(before)
    return entry


def _find_marker(li: Tag) -> tuple[NavigableString, str] | None:
    for marker in (ARROW, BECOMES):
        # Only the entry's own text: a tooltip can say "becomes" in passing.
        found = li.find(string=lambda text: marker in text and not text.find_parent('span', class_='tooltip'))
        if found is not None:
            return found, marker
    return None


def get_replaced_entry(li: Tag) -> Tag | None:
    """The effect an "A -> B" upgrade entry takes away (A), or None for any other entry."""
    found = _find_marker(li)
    return _entry_before(*found) if found is not None else None


def get_upgrade_entry(li: Tag) -> Tag:
    """The part of an upgrade entry that is the effect the item gains."""
    found = _find_marker(li)
    if found is not None:
        return _entry_after(*found)

    first = next((child for child in li.children if not isinstance(child, NavigableString) or child.strip()), None)
    if isinstance(first, NavigableString) and first.strip().split(' ', 1)[0] == ADDS:
        return _entry_after(first, ADDS)

    return li


def as_cell(entries: list[Tag]) -> Tag:
    """A <td><ul> of these entries, for parse_affixes_from_cell."""
    cell = BeautifulSoup('<td><ul></ul></td>', 'html.parser').td
    assert cell is not None and cell.ul is not None
    for entry in entries:
        cell.ul.append(copy.copy(entry))
    return cell
