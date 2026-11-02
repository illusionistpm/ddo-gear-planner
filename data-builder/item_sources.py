"""Where an item or augment comes from: every source in its location cell, and
the pack each one belongs to.

A location cell lists one source per <li>, or several separated by ';'. The
first link in each entry is that entry's source; later links in it are usually
NPCs, chests, locations or prerequisites, so one counts only when "or"/"and"
introduces it and it's a source we know ("Vecna Unleashed, any chest or trade
with Steps Obliss").

quests.json's 'packs' is the one source -> pack map the site reads. Most of it
comes from the wiki's quest lists; the pairings found here through a fallback
(a normalised spelling, a pack named directly, a row hint) are merged into it
afterwards, keyed by the exact name the data emits.
"""
import collections
import re

from bs4 import NavigableString, Tag

from read_json import read_json
from source_packs import load_source_packs
from write_json import write_json

# Filter-only groups, not adventure packs. source_packs.json puts the DDO
# Store and limited-time events in them; the URL codec dictionary treats them
# as known packs.
STORE_PACK = 'DDO Store'
PSEUDO_PACKS = (STORE_PACK, 'Events')

# Rows with no linked source, where the row text still says where it's from.
# The hint becomes the item's source, named by the value.
ROW_SOURCE_HINTS = {
    'Lamordia:': 'Lamordia',
    'Viktranium Experiment': 'Viktranium Experiment',
}

# Fallback pairings no wiki list or source_packs.json entry gives. Anything
# named "Lamordia..." is The Chill of Ravenloft too (SourceResolver._lookup).
LAMORDIA_PACK = 'The Chill of Ravenloft'
SOURCE_PACK_HINTS = {
    'Viktranium Experiment': LAMORDIA_PACK,
    'Sharn quests': 'Masterminds of Sharn',
}

# The location column's header, by page. When a table has several, the last wins.
LOCATION_HEADERS = ('Location', 'Locations', 'Quest', 'Quests')

# Upgrades of an item from the entry's own source, so never a second source.
UPGRADE_SOURCES = ('Epic Crafting', 'Legendary Crafting')

_CONJUNCTION = re.compile(r'\b(or|and)\b', re.I)
_DIFFICULTY_PREFIX = re.compile(r'^(heroic|epic|legendary|wicked)\s+')
_DIFFICULTY_SUFFIX = re.compile(r'\s*\((heroic|epic|legendary)\)$')
_KIND_SUFFIX = re.compile(r'\s*\((quest|npc)\)$')
_CRAFTING_SUFFIX = re.compile(r'\s+crafting$')
_PARENTHESISED_SUFFIX = re.compile(r'\s*\([^()]*\)$')


def normalize_source_name(name):
    """A lookup key only - the data keeps the wiki's spelling."""
    key = name.replace('\xa0', ' ').replace('\u2019', "'").replace('\u2018', "'")
    key = key.replace('\u201c', '"').replace('\u201d', '"')
    key = re.sub(r'\s+', ' ', key).strip().casefold()
    key = _DIFFICULTY_PREFIX.sub('', key)
    key = _DIFFICULTY_SUFFIX.sub('', key)
    key = _KIND_SUFFIX.sub('', key)
    key = _CRAFTING_SUFFIX.sub('', key)
    return key


def canonicalize_quest_name(quest_name):
    if quest_name == 'Cannith Crafting Tutorial':
        return 'Essence Crafting Tutorial'
    return quest_name


def _vendor_key(name):
    # "Randall Lyric (Gravenhollow)": a vendor and where they stand.
    return _PARENTHESISED_SUFFIX.sub('', normalize_source_name(name))


def _link_title(link):
    return str(link.get('title') or link.get_text(' ', strip=True)).replace('\xa0', ' ').strip()


def _tokens(node, skip_lists=False):
    """The node's text and links in document order: ('text', str) or ('link', <a>)."""
    tokens = []
    for child in node.children:
        if isinstance(child, NavigableString):
            tokens.append(('text', str(child)))
        elif isinstance(child, Tag):
            if child.name == 'a' and child.get('href'):
                tokens.append(('link', child))
            elif not (skip_lists and child.name in ('ul', 'ol')):
                tokens.extend(_tokens(child))
    return tokens


def _entries(cell):
    items = cell.find_all('li')
    if items:
        # Text outside the list is an entry of its own ("Festivult, ...
        # <ul><li>Purchased from Otis</li>..."). A nested list belongs to
        # its outer entry.
        return [_tokens(cell, skip_lists=True)] + [_tokens(item) for item in items if item.find_parent('li') is None]

    entries = [[]]
    for kind, value in _tokens(cell):
        if kind == 'text' and ';' in value:
            parts = value.split(';')
            entries[-1].append(('text', parts[0]))
            for part in parts[1:]:
                entries.append([('text', part)])
        else:
            entries[-1].append((kind, value))
    return entries


def _entry_sources(entry, knows):
    """The entry's first link, then any later one that is introduced by "or"
    or "and", isn't in parentheses and is a source we know. A link after a
    bare comma is where the previous one is ("Davyd Turner, The
    Marketplace")."""
    sources = []
    depth = 0
    separator = ''
    for kind, value in entry:
        if kind == 'text':
            depth = max(0, depth + value.count('(') - value.count(')'))
            separator += value
            continue
        title = _link_title(value)
        if title.startswith('Item:'):
            separator += title
            continue
        if title and title not in sources:
            if not sources:
                sources.append(title)
            elif (
                depth == 0
                and _CONJUNCTION.search(separator)
                and title not in UPGRADE_SOURCES
                and knows(title)
            ):
                sources.append(title)
        separator = ''
    return sources


def extract_sources(cell, row_text, knows, multi_link_entries=None):
    """Every source in a location cell, in wiki order, deduplicated. An Item:
    link is a currency or ingredient, never a source.
    knows(name) says whether a name is a source we can resolve. Entries that
    gained more than one source are appended to multi_link_entries, if given,
    for review."""
    sources = []
    for entry in _entries(cell):
        found = _entry_sources(entry, knows)
        if len(found) > 1 and multi_link_entries is not None:
            multi_link_entries.append(found)
        sources.extend(found)

    if not sources:
        for hint, source in ROW_SOURCE_HINTS.items():
            if hint in row_text:
                sources.append(source)
                break

    deduped = []
    for source in (canonicalize_quest_name(source) for source in sources):
        if source not in deduped:
            deduped.append(source)
    return deduped


class SourceResolver:
    """Resolves a source name to its pack.

    resolve(name) returns (known, pack). known is False when nothing names the
    source; pack is None for a known source with no pack (free). Layers, best
    first: the wiki's quest -> pack map, a pack named directly, the row hints,
    source_packs.json, and the free-to-play list. A pairing found any way but
    an exact hit in the wiki map is recorded in resolved_source_packs, so it
    can be merged into quests.json.
    """

    @classmethod
    def from_quests(cls, quests, source_packs=None):
        """Over a quests.json dict and source_packs.json (read from disk unless given)."""
        return cls(
            quests.get('packs', {}),
            quests.get('officialPacks', []),
            load_source_packs() if source_packs is None else source_packs,
            quests.get('freeSources', []),
        )

    def __init__(self, quest_packs, official_packs=(), source_packs=None, free_sources=()):
        self.quest_packs = dict(quest_packs)
        self.source_packs = dict(source_packs or {})
        self.free_sources = set(free_sources)
        self.known_packs = set(official_packs) | {pack for pack in self.quest_packs.values() if pack} | set(PSEUDO_PACKS)

        self._quest_packs_by_key = {}
        for name, pack in self.quest_packs.items():
            self._quest_packs_by_key.setdefault(normalize_source_name(name), pack)
        self._packs_by_key = {normalize_source_name(pack): pack for pack in self.known_packs}
        self._source_packs_by_key = {}
        for name, pack in self.source_packs.items():
            self._source_packs_by_key.setdefault(normalize_source_name(name), pack)
        self._free_keys = {normalize_source_name(name) for name in self.free_sources}

        self._hints_by_key = {normalize_source_name(name): pack for name, pack in SOURCE_PACK_HINTS.items()}

        self.resolved_source_packs = {}
        self.unresolved = {}

    def _lookup(self, name):
        """(known, pack, through a fallback). Every layer is tried by exact
        name before any by normalised name, so a spelling the wiki lists
        itself ("Legendary Hound of Xoriat" as free) isn't overridden by a
        near one ("Hound of Xoriat")."""
        if name in self.quest_packs:
            return True, self.quest_packs[name], False
        if name in self.known_packs:
            return True, name, True
        if name in SOURCE_PACK_HINTS:
            return True, SOURCE_PACK_HINTS[name], True
        if name in self.source_packs:
            return True, self.source_packs[name], True
        if name in self.free_sources:
            return True, None, False

        key = normalize_source_name(name)
        if key in self._quest_packs_by_key:
            return True, self._quest_packs_by_key[key], True
        if key in self._packs_by_key:
            return True, self._packs_by_key[key], True
        if key in self._hints_by_key:
            return True, self._hints_by_key[key], True
        if key.startswith('lamordia'):
            return True, LAMORDIA_PACK, True
        for source_key in (key, _vendor_key(name)):
            if source_key in self._source_packs_by_key:
                return True, self._source_packs_by_key[source_key], True
        if key in self._free_keys:
            return True, None, False
        return False, None, False

    def knows(self, name):
        return self._lookup(name)[0]

    def resolve(self, name):
        known, pack, fallback = self._lookup(name)
        if fallback and pack:
            self.resolved_source_packs[name] = pack
        return known, pack

    def store_last(self, sources):
        """The sources in wiki order, except that any from the DDO Store go last:
        the first is the one an item card shows, and buying is the source of
        last resort."""
        in_store = [source for source in sources if self._lookup(source)[1] == STORE_PACK]
        return [source for source in sources if source not in in_store] + in_store

    def resolve_item(self, sources):
        """The pack of each source, recording any the resolver doesn't know."""
        packs = []
        for source in sources:
            known, pack = self.resolve(source)
            if not known:
                self.unresolved[source] = self.unresolved.get(source, 0) + 1
            packs.append(pack)
        return packs

    def report_unresolved(self):
        for source, count in sorted(self.unresolved.items(), key=lambda entry: (-entry[1], entry[0])):
            print(f'UNRESOLVED SOURCE: {source} ({count} items)')


def load_source_resolver():
    """A resolver over quests.json and source_packs.json, as the build left them."""
    try:
        quests = read_json('quests')
    except FileNotFoundError:
        quests = {}
    return SourceResolver.from_quests(quests)


def find_location_column(columns):
    """The index of a table's location column, given {header: index}, or None."""
    index = None
    for header in LOCATION_HEADERS:
        if header in columns:
            index = columns[header]
    return index


def merge_resolved_source_packs(resolved_source_packs):
    """Adds the pairings found through a fallback to quests.json's pack map,
    so the site resolves every source the data emits by its exact name. A
    pairing the map already has differently keeps the map's - the wiki wins."""
    if not resolved_source_packs:
        return
    quests = read_json('quests')
    packs = quests.setdefault('packs', {})
    for source, pack in sorted(resolved_source_packs.items()):
        existing = packs.setdefault(source, pack)
        if existing != pack:
            print(f"Source pack conflict for '{source}': keeping '{existing}' from the wiki, the fallback said '{pack}'")
    write_json(quests, 'quests')


def report_multi_source_entries(multi_source_entries):
    """One entry that gained several sources is either an item with several
    drops or a prerequisite written without parentheses; listed for review."""
    counts = collections.Counter(tuple(found) for found in multi_source_entries)
    if counts:
        print('Location entries with more than one source (check none is a prerequisite):')
    for found, count in counts.most_common():
        print(f'  {count:5}  {" | ".join(found)}')
