from read_json import read_json
from write_json import write_json

NO_PACK_FILTER = '__NO_PACK__'

# Adventure packs release only a handful of times a year, so more than this
# many "new" pack names discovered in a single build almost always means the
# wiki renamed or reformatted an existing pack (e.g. dropping a leading
# "The", or a saga getting split into per-chapter pages) rather than genuine
# new content - which would otherwise silently split one real pack across
# two dictionary entries. If this legitimately fires for real new packs,
# bump the threshold for that run; if it fires because of a rename, add an
# alias in the checked-in url-codec-dictionary.json instead.
MAX_NEW_PACKS_PER_BUILD = 1


class TooManyNewPacksError(Exception):
    pass


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


def _check_new_pack_count(existing_packs, discovered_packs):
    existing_set = set(existing_packs)
    new_packs = sorted(
        (pack for pack in discovered_packs if pack not in existing_set),
        key=lambda entry: entry.casefold()
    )
    if len(new_packs) > MAX_NEW_PACKS_PER_BUILD:
        raise TooManyNewPacksError(
            f"{len(new_packs)} new adventure pack name(s) discovered in one build, more than the "
            f"expected max of {MAX_NEW_PACKS_PER_BUILD}: {', '.join(new_packs)}. Packs release rarely, "
            "so this usually means a wiki rename or formatting change split an existing pack into a "
            "near-duplicate dictionary entry rather than genuine new content - check these against the "
            "existing 'packs' list in url-codec-dictionary.json before proceeding. If they're genuinely "
            "new packs, raise MAX_NEW_PACKS_PER_BUILD for this run; if one is a rename, add it to that "
            "file's 'aliases.packs' instead so old saved/shared builds still resolve to the same pack."
        )


def build_url_codec_dictionary():
    existing_dictionary = _read_json_or_empty('url-codec-dictionary')
    existing_packs = existing_dictionary.get('packs', [])
    discovered_packs = _discover_packs()

    _check_new_pack_count(existing_packs, discovered_packs)

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
        'aliases': existing_dictionary.get('aliases', {
            'itemTypes': {},
            'packs': {},
            'craftingSystems': {}
        })
    }
    dictionary['aliases'].setdefault('itemTypes', {})
    dictionary['aliases'].setdefault('packs', {})
    dictionary['aliases'].setdefault('craftingSystems', {})

    write_json(dictionary, 'url-codec-dictionary')


if __name__ == '__main__':
    build_url_codec_dictionary()
