import affix_name_quality as module


def test_collect_affix_inventory_walks_all_affix_arrays(monkeypatch):
    assets = {
        'items': [{'name': 'Item One', 'url': '/page/Item_One', 'affixes': [{'name': 'Search', 'type': 'Insight', 'value': 3}]}],
        'crafting': {'System': {'Choice': [{'affixes': [{'name': 'Search', 'type': 'Enhancement', 'value': 5}]}]}},
        'sets': {'Set One': [{'affixes': [{'name': 'Cold Spell Power', 'type': 'Artifact', 'value': 10}]}]},
        'affix-groups': [{'name': 'Group One', 'affixes': ['Search'], 'components': [{'name': 'Spot', 'type': 'Insight', 'value': 3}]}],
    }
    monkeypatch.setattr(module, '_read_asset', lambda name: assets[name])

    inventory = module.collect_affix_inventory(['items', 'crafting', 'sets', 'affix-groups'])

    assert inventory['Search']['count'] == 3
    assert inventory['Search']['assets'] == {'items': 1, 'crafting': 1, 'affix-groups': 1}
    assert inventory['Cold Spell Power']['assets'] == {'sets': 1}
    assert inventory['Spot']['assets'] == {'affix-groups': 1}


def test_build_affix_name_review_payload_flags_quality_signals(monkeypatch):
    monkeypatch.setattr(module, 'collect_affix_inventory', lambda: {
        'Glaciation': {'name': 'Glaciation', 'count': 10, 'assets': {'items': 10}, 'types': {}, 'values': {}, 'examples': []},
        'Cold Spell Power': {'name': 'Cold Spell Power', 'count': 1, 'assets': {'items': 1}, 'types': {}, 'values': {}, 'examples': []},
        'Spell Power for Cold Spells': {'name': 'Spell Power for Cold Spells', 'count': 2, 'assets': {'crafting': 2}, 'types': {}, 'values': {}, 'examples': []},
        'Bloodrage Defense': {'name': 'Bloodrage Defense', 'count': 3, 'assets': {'items': 3}, 'types': {}, 'values': {}, 'examples': []},
        'Known Compound': {'name': 'Known Compound', 'count': 2, 'assets': {'items': 2}, 'types': {}, 'values': {}, 'examples': []},
        '+12': {'name': '+12', 'count': 1, 'assets': {'items': 1}, 'types': {}, 'values': {}, 'examples': []},
        'Special: Deals 10 to 60 Negative Energy Damage to nearby enemies.': {
            'name': 'Special: Deals 10 to 60 Negative Energy Damage to nearby enemies.',
            'count': 1,
            'assets': {'items': 1},
            'types': {},
            'values': {},
            'examples': [],
        },
        'Weapon Focus: Falchion': {'name': 'Weapon Focus: Falchion', 'count': 6, 'assets': {'items': 6}, 'types': {}, 'values': {}, 'examples': []},
        'Rune Arm Imbue: Acid': {'name': 'Rune Arm Imbue: Acid', 'count': 25, 'assets': {'items': 25}, 'types': {}, 'values': {}, 'examples': []},
    })
    monkeypatch.setattr(module, 'load_synonyms', lambda: [{'name': 'Glaciation', 'synonyms': []}])
    monkeypatch.setattr(module, 'load_compound_affixes', lambda: {'Known Compound': {'components': []}})
    monkeypatch.setattr(module, 'load_parser_backlog', lambda: [])
    monkeypatch.setattr(module, 'load_affix_name_review_state', lambda: {'Glaciation': {'status': 'ok', 'notes': 'Looks right.', 'reviewedAt': 'today'}})

    payload = module.build_affix_name_review_payload()
    entries = {entry['name']: entry for entry in payload['entries']}

    assert entries['Glaciation']['reviewStatus'] == 'ok'
    assert entries['Glaciation']['reviewNotes'] == 'Looks right.'
    assert 'likely-duplicate' in entries['Cold Spell Power']['signals']
    assert 'one-off' in entries['Cold Spell Power']['signals']
    assert 'two-off' in entries['Spell Power for Cold Spells']['signals']
    assert 'low-count-no-compound' in entries['Spell Power for Cold Spells']['signals']
    assert 'three-off' in entries['Bloodrage Defense']['signals']
    assert 'low-count-no-compound' in entries['Bloodrage Defense']['signals']
    assert entries['Known Compound']['hasCompoundAffixDefinition'] is True
    assert 'two-off' in entries['Known Compound']['signals']
    assert 'low-count-no-compound' not in entries['Known Compound']['signals']
    assert 'value-like-name' in entries['+12']['signals']
    assert 'sentence-like-name' in entries['Special: Deals 10 to 60 Negative Energy Damage to nearby enemies.']['signals']
    assert 'sentence-like-name' not in entries['Weapon Focus: Falchion']['signals']
    assert 'sentence-like-name' not in entries['Rune Arm Imbue: Acid']['signals']
    assert payload['summary']['reviewedNames'] == 1
    assert payload['summary']['clusters'] == 1
    assert payload['summary']['twoOffNames'] == 2
    assert payload['summary']['threeOffNames'] == 1
    assert payload['summary']['lowCountNoCompoundNames'] == 5


def test_save_synonym_mapping_updates_json_source(monkeypatch):
    data = [
        {'name': 'Glaciation', 'synonyms': []},
        {'name': 'Universal Spell Power', 'synonyms': ['Cold Spell Power']},
    ]
    saved = {}
    monkeypatch.setattr(module, 'load_synonyms', lambda: data)
    monkeypatch.setattr(module, 'save_synonyms', lambda next_data: saved.update({'data': next_data}))
    monkeypatch.setattr(module, 'build_synonyms', lambda: saved.update({'built': True}))

    result = module.save_synonym_mapping('Glaciation', ['Cold Spell Power', 'Spell Power for Cold Spells'])

    assert result == {'canonicalName': 'Glaciation', 'synonyms': ['Cold Spell Power', 'Spell Power for Cold Spells']}
    assert saved['built'] is True
    by_name = {entry['name']: entry for entry in saved['data']}
    assert by_name['Glaciation']['synonyms'] == ['Cold Spell Power', 'Spell Power for Cold Spells']
    assert 'Universal Spell Power' not in by_name


def test_add_parser_backlog_item_writes_review_record(monkeypatch):
    saved = {}

    class FakeFile:
        def __enter__(self):
            return self
        def __exit__(self, *args):
            return False
        def write(self, content):
            saved['content'] = saved.get('content', '') + content

    monkeypatch.setattr(module, 'load_parser_backlog', lambda: [])
    monkeypatch.setattr(module, 'open', lambda *args, **kwargs: FakeFile(), raising=False)

    item = module.add_parser_backlog_item({'name': 'Special: Bad', 'note': 'Parser kept the whole sentence.', 'examples': [{'asset': 'items'}]})

    assert item['id'] == 'affix-parser-1'
    assert item['name'] == 'Special: Bad'
    assert 'Parser kept the whole sentence.' in saved['content']


def test_save_affix_name_review_marks_name_ok(monkeypatch):
    saved = {}
    monkeypatch.setattr(module, 'load_affix_name_review_state', lambda: {})
    monkeypatch.setattr(module, 'save_affix_name_review_state', lambda state: saved.update({'state': state}))

    result = module.save_affix_name_review('Glaciation', {'status': 'ok', 'notes': 'Canonical.'})

    assert result['name'] == 'Glaciation'
    assert result['status'] == 'ok'
    assert saved['state']['Glaciation']['status'] == 'ok'
    assert saved['state']['Glaciation']['notes'] == 'Canonical.'


def test_save_affix_name_review_can_clear_review(monkeypatch):
    saved = {}
    monkeypatch.setattr(module, 'load_affix_name_review_state', lambda: {
        'Glaciation': {'status': 'ok', 'notes': 'Canonical.', 'reviewedAt': 'today'},
    })
    monkeypatch.setattr(module, 'save_affix_name_review_state', lambda state: saved.update({'state': state}))

    result = module.save_affix_name_review('Glaciation', {'status': 'unreviewed'})

    assert result == {'name': 'Glaciation', 'status': 'unreviewed', 'reviewedAt': None}
    assert saved['state'] == {}
