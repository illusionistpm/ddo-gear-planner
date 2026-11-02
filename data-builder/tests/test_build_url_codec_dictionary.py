import pytest

import build_url_codec_dictionary as module


def test_build_url_codec_dictionary_preserves_existing_indexes_and_appends_new(monkeypatch):
    assets = {
        'url-codec-dictionary': {
            'version': 1,
            'itemTypes': ['Existing Type'],
            # 'New Pack' and 'Quest Pack' are pre-seeded as already-known
            # here so this run only discovers one genuinely new pack
            # (__NO_PACK__) - see the dedicated too-many-new-packs test
            # below for the anomaly-detection behavior itself.
            'packs': ['Existing Pack', 'New Pack', 'Quest Pack'],
            'craftingSystems': ['Existing Crafting'],
        },
        'item-types': {
            'New Type': {},
            'Existing Type': {}
        },
        'items': [
            {'name': 'Pack Item', 'quests': ['Pack Quest']},
            {'name': 'Free Item'}
        ],
        'quests': {
            'packs': {
                'Pack Quest': 'New Pack',
                'Quest': 'Quest Pack'
            }
        },
        'crafting': {
            'Existing Crafting': {},
            'New Crafting': {}
        },
        'essence-crafting': {
            'itemTypes': {
                'Ring': {
                    'Prefix': []
                }
            }
        }
    }
    written = {}

    monkeypatch.setattr(module, 'read_json', lambda name: assets[name])
    monkeypatch.setattr(module, 'write_json', lambda data, name: written.setdefault(name, data))
    monkeypatch.setattr(module, 'load_aliases', lambda: {
        'itemTypes': {'Existing Type': 'New Type'},
        'packs': {},
        'craftingSystems': {'Existing Crafting': 'New Crafting'}
    })

    module.build_url_codec_dictionary()

    dictionary = written['url-codec-dictionary']
    assert dictionary['itemTypes'] == ['Existing Type', 'New Type']
    assert dictionary['packs'] == ['Existing Pack', 'New Pack', 'Quest Pack', '__NO_PACK__']
    assert dictionary['craftingSystems'] == [
        'Existing Crafting',
        'Essence Crafting: Ring - Prefix',
        'New Crafting'
    ]
    assert dictionary['aliases']['itemTypes'] == {'Existing Type': 'New Type'}
    assert dictionary['aliases']['craftingSystems'] == {'Existing Crafting': 'New Crafting'}


def test_build_url_codec_dictionary_rejects_too_many_new_packs(monkeypatch):
    # Packs release only a handful of times a year - discovering several
    # "new" ones in one run almost always means a wiki rename/formatting
    # change split an existing pack into near-duplicate entries (the real
    # incident this guards against: the wiki's pack-name reference table
    # silently reworded its header from "Name of the pack" to "Name of the
    # pass", which broke canonicalization wiki-wide and surfaced as 10
    # bogus "new" packs in one run - see parse_quests.py).
    assets = {
        'url-codec-dictionary': {'packs': ['Existing Pack']},
        'item-types': {},
        'items': [
            {'name': 'Item A', 'quests': ['Quest A']},
            {'name': 'Item B', 'quests': ['Quest B']}
        ],
        'quests': {'packs': {'Quest A': 'New Pack A', 'Quest B': 'New Pack B'}},
        'crafting': {},
        'essence-crafting': {}
    }

    monkeypatch.setattr(module, 'read_json', lambda name: assets[name])
    monkeypatch.setattr(module, 'write_json', lambda data, name: pytest.fail('should not write on violation'))

    with pytest.raises(module.TooManyNewPacksError, match='New Pack A.*New Pack B'):
        module.build_url_codec_dictionary()


def test_build_url_codec_dictionary_creates_empty_alias_maps(monkeypatch):
    assets = {
        'item-types': {'Bastard Swords': {}},
        'items': [{'name': 'Pack Item', 'quests': ['Sharn Quest']}],
        'quests': {'packs': {'Sharn Quest': 'Masterminds of Sharn'}},
        'crafting': {'Blue Augment Slot': {}},
        'essence-crafting': {'itemTypes': {}}
    }
    written = {}

    def fake_read_json(name):
        if name == 'url-codec-dictionary':
            raise FileNotFoundError(name)
        return assets[name]

    monkeypatch.setattr(module, 'read_json', fake_read_json)
    monkeypatch.setattr(module, 'write_json', lambda data, name: written.setdefault(name, data))
    monkeypatch.setattr(module, 'load_aliases', lambda: {'itemTypes': {}, 'packs': {}, 'craftingSystems': {}})

    module.build_url_codec_dictionary()

    dictionary = written['url-codec-dictionary']
    assert dictionary['version'] == 1
    assert dictionary['itemTypes'] == ['Bastard Swords']
    assert dictionary['packs'] == ['Masterminds of Sharn']
    assert dictionary['craftingSystems'] == ['Blue Augment Slot']
    assert dictionary['aliases'] == {'itemTypes': {}, 'packs': {}, 'craftingSystems': {}}


def alias_assets(existing_aliases=None):
    return {
        'url-codec-dictionary': {
            'itemTypes': [],
            'packs': ['Old Pack', 'New Pack'],
            'craftingSystems': [],
            'aliases': existing_aliases or {'itemTypes': {}, 'packs': {}, 'craftingSystems': {}}
        },
        'item-types': {},
        'items': [{'name': 'Pack Item', 'quests': ['Pack Quest']}],
        'quests': {'packs': {'Pack Quest': 'New Pack'}},
        'crafting': {},
        'essence-crafting': {}
    }


def test_build_url_codec_dictionary_takes_aliases_from_the_source_file(monkeypatch):
    # The data/ copy is build output: an alias edited only there is replaced,
    # and one removed from the source file is dropped.
    assets = alias_assets({'itemTypes': {}, 'packs': {'Stale': 'New Pack'}, 'craftingSystems': {}})
    written = {}

    monkeypatch.setattr(module, 'read_json', lambda name: assets[name])
    monkeypatch.setattr(module, 'write_json', lambda data, name: written.setdefault(name, data))
    monkeypatch.setattr(module, 'load_aliases', lambda: {
        'itemTypes': {}, 'packs': {'Old Pack': 'New Pack'}, 'craftingSystems': {}
    })

    module.build_url_codec_dictionary()

    assert written['url-codec-dictionary']['aliases']['packs'] == {'Old Pack': 'New Pack'}


@pytest.mark.parametrize('packs_alias, message', [
    ({'Typo Pack': 'New Pack'}, "'Typo Pack' is not in the dictionary"),
    ({'Old Pack': 'Typo Pack'}, "points at 'Typo Pack'"),
])
def test_build_url_codec_dictionary_rejects_aliases_that_would_not_resolve(monkeypatch, packs_alias, message):
    assets = alias_assets()

    monkeypatch.setattr(module, 'read_json', lambda name: assets[name])
    monkeypatch.setattr(module, 'write_json', lambda data, name: pytest.fail('should not write on violation'))
    monkeypatch.setattr(module, 'load_aliases', lambda: {
        'itemTypes': {}, 'packs': packs_alias, 'craftingSystems': {}
    })

    with pytest.raises(module.InvalidAliasError, match=message):
        module.build_url_codec_dictionary()


def test_load_aliases_reads_every_dictionary_key_from_the_checked_in_file():
    aliases = module.load_aliases()

    assert set(aliases) == set(module.DICTIONARY_KEYS)
    for mapping in aliases.values():
        assert all(isinstance(old, str) and isinstance(new, str) for old, new in mapping.items())


def new_pack_assets(item_packs, official_packs=None):
    return {
        'url-codec-dictionary': {'packs': ['The Vault of Night']},
        'item-types': {},
        'items': [{'name': f'Item {pack}', 'quests': [f'Quest {pack}']} for pack in item_packs],
        'quests': {'packs': {f'Quest {pack}': pack for pack in item_packs}, 'officialPacks': official_packs or []},
        'crafting': {},
        'essence-crafting': {}
    }


def run_with(monkeypatch, assets, pack_aliases=None):
    written = {}
    monkeypatch.setattr(module, 'read_json', lambda name: assets[name])
    monkeypatch.setattr(module, 'write_json', lambda data, name: written.setdefault(name, data))
    monkeypatch.setattr(module, 'load_aliases', lambda: {
        'itemTypes': {}, 'packs': pack_aliases or {}, 'craftingSystems': {}
    })
    module.build_url_codec_dictionary()
    return written['url-codec-dictionary']


def test_build_url_codec_dictionary_accepts_many_new_packs_on_the_wiki_pack_list(monkeypatch):
    # A backfill of real packs (e.g. after switching to a more complete
    # quest source) arrives all at once and is fine.
    new = ['Grip of the Hidden Hand', 'Keep on the Borderlands', 'The Soul Splitter']
    dictionary = run_with(monkeypatch, new_pack_assets(new, official_packs=new))

    assert dictionary['packs'] == ['The Vault of Night', *new]


def test_build_url_codec_dictionary_still_rejects_many_unofficial_new_packs(monkeypatch):
    assets = new_pack_assets(['Bogus A', 'Bogus B', 'Real Pack'], official_packs=['Real Pack'])

    with pytest.raises(module.TooManyNewPacksError, match='Bogus A.*Bogus B'):
        run_with(monkeypatch, assets)


@pytest.mark.parametrize('variant', ['Vault of Night', 'the vault of night', 'The Vault-of-Night'])
def test_build_url_codec_dictionary_rejects_near_duplicate_pack_even_when_official(monkeypatch, variant):
    # The guard's original case: the wiki dropping a leading "The" would
    # otherwise split one pack into two filter entries.
    assets = new_pack_assets([variant], official_packs=[variant])

    with pytest.raises(module.NearDuplicatePackError, match="existing: 'The Vault of Night'"):
        run_with(monkeypatch, assets)


def test_build_url_codec_dictionary_allows_near_duplicate_declared_by_an_alias(monkeypatch):
    assets = new_pack_assets(['Vault of Night'], official_packs=['Vault of Night'])

    dictionary = run_with(monkeypatch, assets, pack_aliases={'The Vault of Night': 'Vault of Night'})

    assert dictionary['packs'] == ['The Vault of Night', 'Vault of Night']


def test_build_url_codec_dictionary_treats_the_filter_only_groups_as_known(monkeypatch):
    # "DDO Store" and "Events" aren't adventure packs, so they're on no wiki
    # pack list; arriving together they must not trip the new-pack guard.
    dictionary = run_with(monkeypatch, new_pack_assets(['DDO Store', 'Events']))

    assert dictionary['packs'] == ['The Vault of Night', 'DDO Store', 'Events']


def test_build_url_codec_dictionary_reads_packs_from_the_source_map_not_items(monkeypatch):
    # An item's second source's pack is a filter entry too.
    assets = new_pack_assets([], official_packs=['Pack A', 'Pack B'])
    assets['items'] = [{'name': 'Two Packs', 'quests': ['Quest A', 'Quest B']}]
    assets['quests']['packs'] = {'Quest A': 'Pack A', 'Quest B': 'Pack B'}

    assert run_with(monkeypatch, assets)['packs'] == ['The Vault of Night', 'Pack A', 'Pack B']


def test_build_url_codec_dictionary_adds_the_free_entry_for_an_unmapped_source(monkeypatch):
    assets = new_pack_assets([], official_packs=['Pack A'])
    assets['items'] = [{'name': 'Mixed', 'quests': ['Quest A', 'Free Quest']}]
    assets['quests']['packs'] = {'Quest A': 'Pack A'}

    assert run_with(monkeypatch, assets)['packs'] == ['The Vault of Night', '__NO_PACK__', 'Pack A']
