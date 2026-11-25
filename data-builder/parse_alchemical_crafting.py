"""Alchemical Crafting: the tiers bound onto Alchemical and Legendary Alchemical prototypes.

Heroic prototypes (The Master Artificer, ML 12) take three tiers at the Cannith
Binding Station. Each binds an element (Air, Earth, Water, Fire) as Martial or
Mystical, and the cell for that choice lists everything it grants. Mystical
Tiers 1 and 2 also grant the spell power or spell lore of the material the item
was refined with, so each of those is one option per material.

Legendary prototypes (ML 29) take three tiers at the Cannith Reforging Station.
Each element lists alternatives, one per line, and each line is one option.
"""
import copy
import re
from typing import Any, TypedDict

from bs4 import BeautifulSoup, NavigableString, Tag

from get_most_common_bonus_type import get_most_common_bonus_type
from get_snapshot_path import get_snapshot_path
from parse_affixes_from_cell import get_item_property_map_from_tag
from roman_numerals import int_from_roman_numeral
from typedefs import AffixesDict, SetDict

SystemDict = TypedDict('SystemDict', {'*': list[AffixesDict | SetDict]})

ALCHEMICAL_CRAFTING_PATH = get_snapshot_path('crafting', 'Alchemical_Crafting.html')

HEROIC_PROTOTYPE = 'Alchemical (Prototype)'
LEGENDARY_PROTOTYPE = 'Legendary Alchemical Crafting (Prototype)'

# The page's "Weapon Minimum Level" for each heroic tier; legendary blanks are
# already at their minimum level.
HEROIC_TIER_ML = {1: 16, 2: 18, 3: 20}
LEGENDARY_ML = 29
HEROIC_DEVICE = 'Cannith Binding Station'
LEGENDARY_DEVICE = 'Cannith Reforging Station'

ELEMENTS = ['Air', 'Earth', 'Water', 'Fire']
METAL_EFFECT = '<Metal Type Effect>'


def heroic_system_name(tier: int) -> str:
    return f'Alchemical Tier {tier}'


def legendary_system_name(tier: int) -> str:
    return f'Legendary Alchemical Tier {tier}'


HEROIC_SYSTEMS = [heroic_system_name(tier) for tier in [1, 2, 3]]
LEGENDARY_SYSTEMS = [legendary_system_name(tier) for tier in [1, 2, 3]]


def get_alchemical_crafting_systems(affix_name: str) -> list[str] | None:
    """The systems that replace a prototype's flag affix, or None if it isn't one."""
    if affix_name == HEROIC_PROTOTYPE:
        return HEROIC_SYSTEMS
    if affix_name == LEGENDARY_PROTOTYPE:
        return LEGENDARY_SYSTEMS
    return None


def _parse_effects(effects: list[Tag | str]) -> list[dict[str, Any]]:
    """Parse each effect (a tooltip span, or plain text) the way item pages are."""
    soup = BeautifulSoup('<ul></ul>', 'html.parser')
    ul = soup.ul
    assert ul is not None
    for effect in effects:
        li = soup.new_tag('li')
        li.append(copy.copy(effect) if isinstance(effect, Tag) else NavigableString(effect))
        ul.append(li)
    return get_item_property_map_from_tag(ul, {}, {}).get('affixes', [])


def _has_class(tag: Tag, name: str) -> bool:
    return name in (tag.get('class') or [])


def _heroic_effects(cell: Tag) -> list[Tag | str]:
    """A heroic cell's effects: its tooltip spans, then its comma-separated plain text.

    Every effect with a tooltip icon is taken on its own, without the ones
    nested in it, wherever it sits: the wiki's markup nests some effects inside
    others (Icy Burst's unclosed dice spans swallow Freezing Ice).
    """
    cell = copy.copy(cell)
    spans = [span for span in cell.find_all('span', class_='has_tooltip') if _has_class(span, 'with-icon')]

    effects: list[Tag | str] = []
    for span in spans:
        # A heroic Tier 3 Martial binding adds a Red augment slot. A crafting
        # option can't add a slot, so it is left out.
        if _has_class(span, 'augment'):
            continue
        effect = copy.copy(span)
        for nested in effect.find_all('span', class_='with-icon'):
            nested.decompose()
        # A list in the tooltip (Freezing Ice's "On items:" / "On weapons:")
        # would read as a crafting system's choices.
        for tooltip_list in effect.find_all('ul'):
            tooltip_list.replace_with(tooltip_list.get_text(' '))
        effects.append(effect)

    for span in spans:
        if span.parent is not None:
            span.extract()
    for style in cell.find_all('style'):
        style.decompose()
    effects.extend(text.strip() for text in cell.get_text().split(',') if text.strip())
    return effects


def _table_after(anchor: Tag | None, what: str) -> Tag:
    if anchor is None:
        raise ValueError(f'Alchemical Crafting: no "{what}" heading')
    table = anchor.find_next('table', class_='wikitable')
    if table is None:
        raise ValueError(f'Alchemical Crafting: no table after "{what}"')
    return table


def _table_after_heading(soup: BeautifulSoup, heading_text: str) -> Tag:
    headline = soup.find(
        lambda tag: tag.name == 'span' and _has_class(tag, 'mw-headline')
        and tag.get_text(' ', strip=True).startswith(heading_text)
    )
    return _table_after(headline, heading_text)


def _rows(table: Tag) -> list[list[Tag]]:
    return [row.find_all(['td', 'th'], recursive=False) for row in table.find_all('tr')]


def _header(table: Tag) -> list[str]:
    return [cell.get_text(' ', strip=True) for cell in _rows(table)[0]]


def _element_rows(table: Tag) -> list[tuple[str, list[Tag]]]:
    rows = [
        (cells[0].get_text(' ', strip=True), cells[1:])
        for cells in _rows(table)
        if cells and cells[0].get_text(' ', strip=True) in ELEMENTS
    ]
    if [element for element, _ in rows] != ELEMENTS:
        raise ValueError(f'Alchemical Crafting: expected a row per element, found {[e for e, _ in rows]}')
    return rows


def _get_materials(soup: BeautifulSoup) -> list[tuple[list[str], dict[int, Tag]]]:
    """Materials grouped by the Mystical effects they add: [(names, {tier: cell})]."""
    table = _table_after_heading(soup, 'Refinement')
    if _header(table) != ['Material type', 'Refinement effect', 'Tier 1 Mystical effect', 'Tier 2 Mystical effect']:
        raise ValueError(f'Alchemical Crafting: unexpected material table header {_header(table)}')

    groups: dict[tuple[str, str], tuple[list[str], dict[int, Tag]]] = {}
    for cells in _rows(table)[1:]:
        if len(cells) != 4:
            continue
        key = (cells[2].get_text(' ', strip=True), cells[3].get_text(' ', strip=True))
        groups.setdefault(key, ([], {1: cells[2], 2: cells[3]}))[0].append(cells[0].get_text(' ', strip=True))
    return list(groups.values())


def _option(name: str, affixes: list[dict[str, Any]], ml: int, device: str) -> AffixesDict:
    if not affixes:
        raise ValueError(f'Alchemical Crafting: "{name}" has no effects')
    for affix in affixes:
        # Heroic Tier 3 Martial's "+6 Enhancement Bonus": its tooltip says "to
        # attack and damage rolls". The systems are shared by every prototype,
        # shields included, so it can't follow the item as parse_items does.
        if affix['name'] == 'Enhancement Bonus':
            affix['name'] = 'Enhancement Bonus (Weapon)'
    return {'name': name, 'affixes': affixes, 'ml': ml, 'quests': [device]}  # type: ignore[typeddict-item]


def get_heroic_systems(soup: BeautifulSoup) -> dict[str, SystemDict]:
    materials = _get_materials(soup)
    systems: dict[str, SystemDict] = {}
    for tier in [1, 2, 3]:
        table = _table_after_heading(soup, f'Tier {tier} Elemental Binding')
        if _header(table) != ['', 'Martial effects', 'Mystical effects']:
            raise ValueError(f'Alchemical Crafting: unexpected Tier {tier} header {_header(table)}')
        ml = HEROIC_TIER_ML[tier]

        options: list[AffixesDict | SetDict] = []
        for element, (martial, mystical) in _element_rows(table):
            options.append(_option(f'{element} (Martial)', _parse_effects(_heroic_effects(martial)), ml, HEROIC_DEVICE))

            effects = _heroic_effects(mystical)
            own = [effect for effect in effects if not (isinstance(effect, str) and METAL_EFFECT in effect)]
            if len(own) == len(effects):
                options.append(_option(f'{element} (Mystical)', _parse_effects(own), ml, HEROIC_DEVICE))
                continue
            for names, material_cells in materials:
                options.append(_option(
                    f'{element} (Mystical, {" or ".join(names)})',
                    _parse_effects(own + _heroic_effects(material_cells[tier])),
                    ml,
                    HEROIC_DEVICE,
                ))
        systems[heroic_system_name(tier)] = {'*': options}
    return systems


# A legendary line's commentary: "(+6 Insightful AC, does not include saves)",
# "(Warning: Does not function on melee weapons.)", "(constantly on)".
LEGENDARY_COMMENTARY = re.compile(r'\s*\((?:[^()]*\b(?:does not|Does not|Warning|constantly)\b[^()]*)\)')
AUGMENT_SLOT = re.compile(r'^[A-Za-z]+ slot$')
EFFICIENT_METAMAGIC_TIER = re.compile(r'^Efficient Metamagic - .* ([IVX]+)$')


def _legendary_effects(line: str) -> list[str]:
    effects = [effect.strip() for effect in LEGENDARY_COMMENTARY.sub('', line).split(',')]
    # Tier 3 lines add an augment slot. A crafting option can't add a slot, so
    # it is left out.
    return [effect for effect in effects if effect and not AUGMENT_SLOT.match(effect)]


# Types the page states in a line's commentary, which _legendary_effects drops:
# "Heightened Awareness +6 (+6 Insightful AC, does not include saves)".
LEGENDARY_STATED_TYPES = {'Heightened Awareness': 'Insight'}
IMPROVED_AUGMENTATION = re.compile(r'^Improved [A-Za-z]+ Augmentation$')


def _type_legendary_affixes(effects: list[str], affixes: list[dict[str, Any]], bonus_types: dict[str, str]) -> None:
    """Give tooltip-less legendary effects the bonus type and value they have elsewhere."""
    for affix in affixes:
        if affix['name'] in LEGENDARY_STATED_TYPES:
            affix['type'] = LEGENDARY_STATED_TYPES[affix['name']]
        elif IMPROVED_AUGMENTATION.match(affix['name']):
            # "Improved Cold Augmentation IX" raises caster level "by three", as
            # Legendary The Cold of Night's tooltip for the same effect says.
            affix['type'] = 'Untyped'
            affix['value'] = '3'
        elif affix.get('type') == 'Untyped' and bonus_types.get(affix['name'], 'Untyped') not in ('Untyped', 'Bool'):
            affix['type'] = bonus_types[affix['name']]
    for effect in effects:
        # Efficient Metamagic II reduces the cost by 2, as the heroic tier's tooltip says.
        match = EFFICIENT_METAMAGIC_TIER.match(effect)
        if match:
            for affix in affixes:
                if effect.startswith(affix['name']):
                    affix['value'] = int_from_roman_numeral(match.group(1))


def get_legendary_systems(soup: BeautifulSoup) -> dict[str, SystemDict]:
    legendary = soup.find(id='Legendary')
    if legendary is None:
        raise ValueError('Alchemical Crafting: no Legendary section')
    bonus_types = get_most_common_bonus_type()

    systems: dict[str, SystemDict] = {}
    for tier in [1, 2, 3]:
        # The legendary tiers are headed "Tier 1"...; the heroic ones before them
        # are "Tier 1 Elemental Binding - ...", with a different id.
        table = _table_after(legendary.find_next('span', class_='mw-headline', id=f'Tier_{tier}'), f'Legendary Tier {tier}')

        options: list[AffixesDict | SetDict] = []
        for element, cells in _element_rows(table):
            ul = cells[0].find('ul')
            if ul is None:
                raise ValueError(f'Alchemical Crafting: legendary Tier {tier} {element} has no list')
            for li in ul.find_all('li', recursive=False):
                effects = _legendary_effects(li.get_text())
                affixes = _parse_effects(list(effects))
                _type_legendary_affixes(effects, affixes, bonus_types)
                options.append(_option(f'{element}: {", ".join(effects)}', affixes, LEGENDARY_ML, LEGENDARY_DEVICE))
        systems[legendary_system_name(tier)] = {'*': options}
    return systems


def get_alchemical_crafting_from_page(soup: BeautifulSoup) -> dict[str, SystemDict]:
    return {**get_heroic_systems(soup), **get_legendary_systems(soup)}


def parse_alchemical_crafting() -> dict[str, SystemDict]:
    with open(ALCHEMICAL_CRAFTING_PATH, 'r', encoding='utf-8') as fh:
        soup = BeautifulSoup(fh.read(), 'html.parser')
    return get_alchemical_crafting_from_page(soup)
