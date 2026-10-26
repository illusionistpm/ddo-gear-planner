import json
import os
import re

from read_json import read_json
from write_json import write_json

NO_PACK_FILTER = '__NO_PACK__'

# The dictionary's value lists are build state: each build appends to the
# copy in data/, and their order is what existing links decode against.
# Aliases are hand-maintained, so they live here and replace whatever the
# data/ copy holds on every build.
ALIASES_SOURCE_PATH = os.path.join(os.path.dirname(__file__), 'url_codec_aliases.json')
DICTIONARY_KEYS = ('itemTypes', 'packs', 'craftingSystems')

# Adventure packs release only a handful of times a year, so more than this
# many new pack names that aren't on the wiki's own pack list, in a single
# build, almost always means a reformat produced bogus names. Names that are
# on that list (quests.json's 'officialPacks') don't count, so a backfill of
# real packs can land at once. If this fires for real packs, check why they
# aren't on the official list; if it fires because of a rename, add an alias
# in url_codec_aliases.json instead.
MAX_NEW_PACKS_PER_BUILD = 1


class TooManyNewPacksError(Exception):
    pass


class NearDuplicatePackError(Exception):
    pass


class InvalidAliasError(Exception):
    pass


def load_aliases():
    with open(ALIASES_SOURCE_PATH, 'r', encoding='utf-8') as file:
        aliases = json.load(file)
    return {key: dict(aliases.get(key) or {}) for key in DICTIONARY_KEYS}


def _check_aliases(dictionary):
    # Decoding only aliases values that are in the dictionary, and an alias
    # pointing at a name nothing uses would quietly empty an old link's filter.
    problems = []
    for key in DICTIONARY_KEYS:
        known = set(dictionary[key])
        for old_value, new_value in dictionary['aliases'][key].items():
            if old_value not in known:
                problems.append(f"{key}: '{old_value}' is not in the dictionary")
            if new_value not in known:
                problems.append(f"{key}: '{old_value}' points at '{new_value}', which is not in the dictionary")
    if problems:
        raise InvalidAliasError(
            'url_codec_aliases.json has aliases that would not resolve:\n - ' + '\n - '.join(problems)
        )


def _read_json_or_empty(asset_name):
    try:
        return read_json(asset_name)
    except FileNotFoundError:
        return {}


def _append_new_values(existing_values, discovered_values):
    values = list(existing_values or [])
    seen = set(values)

    for value in sorted(discovered_values, key=lambda entry: entry.casefold()):
        if value not in seen:
            values.append(value)
            seen.add(value)

    return values


def _discover_item_types():
    item_types = _read_json_or_empty('item-types')
    return set(item_types.keys())


def _discover_packs():
    packs = set()
    saw_item_without_pack = False

    for item in _read_json_or_empty('items') or []:
        pack = item.get('pack')
        if pack:
            packs.add(pack)
        else:
            saw_item_without_pack = True

    for pack in (_read_json_or_empty('quests').get('packs') or {}).values():
        if pack:
            packs.add(pack)

    if saw_item_without_pack:
        packs.add(NO_PACK_FILTER)

    return packs


def _discover_crafting_systems():
    systems = set(_read_json_or_empty('crafting').keys())
    essence_crafting = _read_json_or_empty('essence-crafting')

    for item_type, slots in (essence_crafting.get('itemTypes') or {}).items():
        for slot in slots.keys():
            systems.add(f'Essence Crafting: {item_type} - {slot}')

    return systems


def _pack_name_key(pack):
    # "The Vault of Night", "Vault of Night" and "vault of night" are one pack.
    key = pack.casefold()
    if key.startswith('the '):
        key = key[4:]
    return re.sub(r'[^0-9a-z]', '', key)


def _check_new_packs(existing_packs, discovered_packs, official_packs, aliases):
    existing_set = set(existing_packs)
    new_packs = sorted(
        (pack for pack in discovered_packs if pack not in existing_set),
        key=lambda entry: entry.casefold()
    )

    # A near-duplicate is never a new pack: it splits an existing one across
    # two filter entries. An alias pointing at it declares the rename.
    alias_targets = set(aliases.get('packs', {}).values())
    existing_keys = {_pack_name_key(pack): pack for pack in existing_packs}
    near_duplicates = [
        f"'{pack}' (existing: '{existing_keys[_pack_name_key(pack)]}')"
        for pack in new_packs
        if _pack_name_key(pack) in existing_keys and pack not in alias_targets
    ]
    if near_duplicates:
        raise NearDuplicatePackError(
            f"New pack name(s) that only differ from an existing pack in case, a leading 'The' or "
            f"punctuation: {', '.join(near_duplicates)}. Canonicalise the name in parse_quests.py so "
            "items keep the existing name, or - if the wiki really renamed the pack - add the old "
            "name to 'packs' in data-builder/url_codec_aliases.json so old saved/shared builds "
            "resolve to the new one."
        )

    official_set = set(official_packs)
    unofficial = [pack for pack in new_packs if pack not in official_set and pack != NO_PACK_FILTER]
    if len(unofficial) > MAX_NEW_PACKS_PER_BUILD:
        raise TooManyNewPacksError(
            f"{len(unofficial)} new adventure pack name(s) that aren't on the wiki's pack list "
            f"discovered in one build, more than the expected max of {MAX_NEW_PACKS_PER_BUILD}: "
            f"{', '.join(unofficial)}. This usually means a wiki reformat produced bogus pack names "
            "(e.g. section headings) - check where these came from before proceeding. If one is a "
            "rename, add it to 'packs' in data-builder/url_codec_aliases.json instead so old "
            "saved/shared builds still resolve to the same pack."
        )


def build_url_codec_dictionary():
    existing_dictionary = _read_json_or_empty('url-codec-dictionary')
    existing_packs = existing_dictionary.get('packs', [])
    discovered_packs = _discover_packs()
    aliases = load_aliases()

    _check_new_packs(
        existing_packs,
        discovered_packs,
        _read_json_or_empty('quests').get('officialPacks') or [],
        aliases,
    )

    dictionary = {
        'version': 1,
        'itemTypes': _append_new_values(
            existing_dictionary.get('itemTypes', []),
            _discover_item_types()
        ),
        'packs': _append_new_values(
            existing_packs,
            discovered_packs
        ),
        'craftingSystems': _append_new_values(
            existing_dictionary.get('craftingSystems', []),
            _discover_crafting_systems()
        ),
        'aliases': aliases
    }

    _check_aliases(dictionary)

    write_json(dictionary, 'url-codec-dictionary')


if __name__ == '__main__':
    build_url_codec_dictionary()
