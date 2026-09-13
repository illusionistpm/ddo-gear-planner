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
            'aliases': {
                'itemTypes': {'Old Type': 'Existing Type'},
                'packs': {'Old Pack': 'Existing Pack'},
                'craftingSystems': {'Old Crafting': 'Existing Crafting'}
            }
        },
        'item-types': {
            'New Type': {},
            'Existing Type': {}
        },
        'items': [
            {'name': 'Pack Item', 'pack': 'New Pack'},
            {'name': 'Free Item'}
        ],
        'quests': {
            'packs': {
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

    module.build_url_codec_dictionary()

    dictionary = written['url-codec-dictionary']
    assert dictionary['itemTypes'] == ['Existing Type', 'New Type']
    assert dictionary['packs'] == ['Existing Pack', 'New Pack', 'Quest Pack', '__NO_PACK__']
    assert dictionary['craftingSystems'] == [
        'Existing Crafting',
        'Essence Crafting: Ring - Prefix',
        'New Crafting'
    ]
    assert dictionary['aliases']['itemTypes']['Old Type'] == 'Existing Type'
    assert dictionary['aliases']['craftingSystems']['Old Crafting'] == 'Existing Crafting'


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
            {'name': 'Item A', 'pack': 'New Pack A'},
            {'name': 'Item B', 'pack': 'New Pack B'}
        ],
        'quests': {'packs': {}},
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
        'items': [{'name': 'Pack Item', 'pack': 'Masterminds of Sharn'}],
        'quests': {'packs': {}},
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

    module.build_url_codec_dictionary()

    dictionary = written['url-codec-dictionary']
    assert dictionary['version'] == 1
    assert dictionary['itemTypes'] == ['Bastard Swords']
    assert dictionary['packs'] == ['Masterminds of Sharn']
    assert dictionary['craftingSystems'] == ['Blue Augment Slot']
    assert dictionary['aliases'] == {'itemTypes': {}, 'packs': {}, 'craftingSystems': {}}
