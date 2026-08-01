import admin_api


def test_save_review_decision_writes_accepted_definition(monkeypatch):
    saved = {}
    review_state = {}

    monkeypatch.setattr(admin_api, 'load_compound_affixes', lambda: {})
    monkeypatch.setattr(admin_api, 'save_compound_affixes', lambda data: saved.update(data))
    monkeypatch.setattr(admin_api, '_load_review_state', lambda: review_state)
    monkeypatch.setattr(admin_api, '_save_review_state', lambda data: review_state.update(data))
    monkeypatch.setattr(admin_api, 'get_allowed_bonus_types', lambda: {'Enhancement'})

    result = admin_api.save_review_decision(
        'Useful Compound',
        {
            'status': 'accepted',
            'notes': 'Looks right.',
            'definition': {
                'components': [
                    {
                        'name': 'Useful Bonus',
                        'type': 'Enhancement',
                        'value': {'mode': 'fixed', 'amount': '3'},
                    },
                ],
            },
        },
    )

    assert result['status'] == 'accepted'
    assert saved['Useful Compound'] == {
        'components': [
            {
                'name': 'Useful Bonus',
                'type': 'Enhancement',
                'value': {'mode': 'fixed', 'amount': 3},
            }
        ]
    }
    assert review_state['Useful Compound']['status'] == 'accepted'
    assert review_state['Useful Compound']['notes'] == 'Looks right.'


def test_save_review_decision_removes_rejected_from_curated(monkeypatch):
    saved = {}
    review_state = {}

    monkeypatch.setattr(admin_api, 'load_compound_affixes', lambda: {'Bad Compound': {'components': []}})
    monkeypatch.setattr(admin_api, 'save_compound_affixes', lambda data: saved.update({'data': data}))
    monkeypatch.setattr(admin_api, '_load_review_state', lambda: review_state)
    monkeypatch.setattr(admin_api, '_save_review_state', lambda data: review_state.update(data))

    admin_api.save_review_decision('Bad Compound', {'status': 'rejected', 'notes': 'Conditional.'})

    assert 'Bad Compound' not in saved['data']
    assert review_state['Bad Compound']['status'] == 'rejected'


def test_build_review_payload_includes_impact_examples(monkeypatch):
    suggestion = {
        'components': [
            {'name': 'Search', 'type': '<TypeAlreadyParsed>', 'value': {'mode': 'same_as_affix_number'}},
            {'name': 'Spot', 'type': '<TypeAlreadyParsed>', 'value': {'mode': 'same_as_affix_number'}},
        ]
    }

    def load_llm(file_name, default):
        if file_name == 'compound_affix_suggestions':
            return {'Dual Skills': suggestion}
        if file_name == 'compound_affix_candidates':
            return [{'affixName': 'Dual Skills', 'exampleItems': [], 'sourceTooltips': []}]
        return default

    monkeypatch.setattr(admin_api, '_load_llm_json', load_llm)
    monkeypatch.setattr(admin_api, 'load_compound_affixes', lambda: {})
    monkeypatch.setattr(admin_api, '_load_review_state', lambda: {})
    monkeypatch.setattr(admin_api, '_load_items_with_provenance', lambda: [
        {
            'name': 'Goggles of Looking',
            'url': '/page/Item:Goggles_of_Looking',
            'affixes': [{'name': 'Dual Skills', 'type': 'Insight', 'value': 7}],
        }
    ])
    monkeypatch.setattr(admin_api, 'get_allowed_bonus_types', lambda: {'Insight'})
    monkeypatch.setattr(admin_api, 'get_llm_path', lambda file_name: file_name)

    payload = admin_api.build_review_payload()

    entry = payload['entries'][0]
    assert entry['name'] == 'Dual Skills'
    assert entry['status'] == 'unreviewed'
    assert entry['impact'][0]['after'] == [
        {'name': 'Search', 'type': 'Insight', 'value': 7, 'sourceText': None, 'sourceTooltip': None, 'parserSource': None},
        {'name': 'Spot', 'type': 'Insight', 'value': 7, 'sourceText': None, 'sourceTooltip': None, 'parserSource': None},
    ]


def test_build_review_payload_includes_known_affix_names(monkeypatch):
    monkeypatch.setattr(admin_api, '_load_llm_json', lambda file_name, default: {})
    monkeypatch.setattr(admin_api, 'load_compound_affixes', lambda: {
        'Curated Group': {
            'components': [
                {'name': 'Curated Component', 'type': 'Enhancement', 'value': {'mode': 'same_as_affix_number'}},
            ],
        },
    })
    monkeypatch.setattr(admin_api, '_load_review_state', lambda: {})
    monkeypatch.setattr(admin_api, '_load_items_with_provenance', lambda: [
        {'affixes': [{'name': 'Parsed Item Affix'}]},
    ])
    monkeypatch.setattr(admin_api, '_load_asset_json', lambda file_name, default: [
        {
            'name': 'Existing Group',
            'affixes': ['Grouped Affix'],
            'components': [{'name': 'Fixed Component'}],
        },
    ] if file_name == 'affix-groups' else default)
    monkeypatch.setattr(admin_api, 'get_allowed_bonus_types', lambda: {'Enhancement'})
    monkeypatch.setattr(admin_api, 'get_llm_path', lambda file_name: file_name)

    assert admin_api.build_review_payload()['knownAffixNames'] == [
        'Curated Component',
        'Existing Group',
        'Fixed Component',
        'Grouped Affix',
        'Parsed Item Affix',
    ]


def test_build_review_payload_flags_stale_entry_with_canonical_name(monkeypatch):
    def load_llm(file_name, default):
        if file_name == 'compound_affix_suggestions':
            return {
                'Alluring Skills Bonus': {'components': [{'name': 'Bluff', 'type': '<TypeAlreadyParsed>', 'value': {'mode': 'same_as_affix_number'}}]},
                'Exceptional Alluring Skills Bonus': {'components': [{'name': 'Bluff', 'type': 'Exceptional', 'value': {'mode': 'same_as_affix_number'}}]},
            }
        return default

    monkeypatch.setattr(admin_api, '_load_llm_json', load_llm)
    monkeypatch.setattr(admin_api, 'load_compound_affixes', lambda: {})
    monkeypatch.setattr(admin_api, '_load_review_state', lambda: {})
    monkeypatch.setattr(admin_api, '_load_items_with_provenance', lambda: [
        {
            'name': 'Social Item',
            'affixes': [
                {'name': 'Alluring Skills Bonus', 'type': 'Exceptional', 'value': 8},
            ],
        },
    ])
    monkeypatch.setattr(admin_api, '_load_asset_json', lambda file_name, default: default)
    monkeypatch.setattr(admin_api, 'get_allowed_bonus_types', lambda: {'Exceptional'})
    monkeypatch.setattr(admin_api, 'get_llm_path', lambda file_name: file_name)

    entries = {entry['name']: entry for entry in admin_api.build_review_payload()['entries']}

    assert entries['Alluring Skills Bonus']['nameMatchesCurrentAffix'] is True
    assert entries['Alluring Skills Bonus']['staleReason'] is None
    assert entries['Exceptional Alluring Skills Bonus']['nameMatchesCurrentAffix'] is False
    assert entries['Exceptional Alluring Skills Bonus']['suggestedCanonicalName'] == 'Alluring Skills Bonus'
    assert entries['Exceptional Alluring Skills Bonus']['staleReason'] == 'canonical-name-exists'


def test_quarantine_stale_suggestion_moves_definition_to_llm_results(monkeypatch):
    suggestions = {
        'Alluring Skills Bonus': {'components': [{'name': 'Bluff', 'type': '<TypeAlreadyParsed>', 'value': {'mode': 'same_as_affix_number'}}]},
        'Exceptional Alluring Skills Bonus': {'components': [{'name': 'Bluff', 'type': 'Exceptional', 'value': {'mode': 'same_as_affix_number'}}]},
    }
    llm_results = {}
    writes = {}

    def load_llm(file_name, default):
        if file_name == 'compound_affix_suggestions':
            return suggestions
        if file_name == 'compound_affix_llm_results':
            return llm_results
        return default

    def write_llm(data, file_name):
        writes[file_name] = data

    monkeypatch.setattr(admin_api, '_load_llm_json', load_llm)
    monkeypatch.setattr(admin_api, 'write_llm_json', write_llm)
    monkeypatch.setattr(admin_api, '_load_items_with_provenance', lambda: [
        {'affixes': [{'name': 'Alluring Skills Bonus', 'type': 'Exceptional', 'value': 8}]},
    ])

    result = admin_api.quarantine_stale_suggestion('Exceptional Alluring Skills Bonus')

    assert result == {
        'name': 'Exceptional Alluring Skills Bonus',
        'status': 'quarantined',
        'staleReason': 'canonical-name-exists',
        'suggestedCanonicalName': 'Alluring Skills Bonus',
    }
    assert 'Exceptional Alluring Skills Bonus' not in writes['compound_affix_suggestions']
    assert writes['compound_affix_llm_results']['Exceptional Alluring Skills Bonus']['status'] == 'stale-suggestion'


def test_save_affix_name_synonym_endpoint_delegates_to_quality_module(monkeypatch):
    called = {}
    monkeypatch.setattr(admin_api, 'save_synonym_mapping', lambda canonical, synonyms: called.update({'canonical': canonical, 'synonyms': synonyms}) or {'ok': True})

    assert admin_api.save_synonym_mapping('Glaciation', ['Cold Spell Power']) == {'ok': True}
    assert called == {'canonical': 'Glaciation', 'synonyms': ['Cold Spell Power']}


def test_add_parser_backlog_endpoint_delegates_to_quality_module(monkeypatch):
    monkeypatch.setattr(admin_api, 'add_parser_backlog_item', lambda payload: {'name': payload['name'], 'note': payload['note']})

    assert admin_api.add_parser_backlog_item({'name': 'Bad Affix', 'note': 'Needs parser cleanup'}) == {
        'name': 'Bad Affix',
        'note': 'Needs parser cleanup',
    }


def test_build_review_payload_hides_value_suffixed_duplicate_when_canonical_exists(monkeypatch):
    def load_llm(file_name, default):
        if file_name == 'compound_affix_suggestions':
            return {
                'Combat Mastery': {'components': [{'name': 'Stunning', 'type': '<TypeAlreadyParsed>', 'value': {'mode': 'same_as_affix_number'}}]},
                'Combat Mastery +12 Combat Mastery': {'components': [{'name': 'Stunning', 'type': 'Enhancement', 'value': {'mode': 'same_as_affix_number'}}]},
                'Resistance': {'components': [{'name': 'Fortitude Save', 'type': '<TypeAlreadyParsed>', 'value': {'mode': 'same_as_affix_number'}}]},
                'Resistance +1 Resistance': {'components': [{'name': 'Fortitude Save', 'type': 'Resistance', 'value': {'mode': 'same_as_affix_number'}}]},
            }
        return default

    monkeypatch.setattr(admin_api, '_load_llm_json', load_llm)
    monkeypatch.setattr(admin_api, 'load_compound_affixes', lambda: {})
    monkeypatch.setattr(admin_api, '_load_review_state', lambda: {})
    monkeypatch.setattr(admin_api, '_load_items_with_provenance', lambda: [])
    monkeypatch.setattr(admin_api, 'get_allowed_bonus_types', lambda: {'Enhancement', 'Resistance'})
    monkeypatch.setattr(admin_api, 'get_llm_path', lambda file_name: file_name)

    names = [entry['name'] for entry in admin_api.build_review_payload()['entries']]

    assert names == ['Combat Mastery', 'Resistance']


def test_build_review_payload_hides_value_suffixed_duplicate_when_canonical_candidate_exists(monkeypatch):
    def load_llm(file_name, default):
        if file_name == 'compound_affix_suggestions':
            return {
                'Combat Mastery +12 Combat Mastery': {'components': [{'name': 'Stunning', 'type': 'Enhancement', 'value': {'mode': 'same_as_affix_number'}}]},
            }
        if file_name == 'compound_affix_candidates':
            return [{'affixName': 'Combat Mastery'}]
        return default

    monkeypatch.setattr(admin_api, '_load_llm_json', load_llm)
    monkeypatch.setattr(admin_api, 'load_compound_affixes', lambda: {})
    monkeypatch.setattr(admin_api, '_load_review_state', lambda: {})
    monkeypatch.setattr(admin_api, '_load_items_with_provenance', lambda: [])
    monkeypatch.setattr(admin_api, 'get_allowed_bonus_types', lambda: {'Enhancement'})
    monkeypatch.setattr(admin_api, 'get_llm_path', lambda file_name: file_name)

    assert admin_api.build_review_payload()['entries'] == []


def test_queue_affix_name_for_compound_review_creates_candidate_and_review_state(monkeypatch):
    writes = {}
    review_state = {}

    monkeypatch.setattr(admin_api, 'build_affix_name_review_payload', lambda: {
        'entries': [
            {
                'name': 'Bloodrage Defense',
                'examples': [
                    {
                        'parentName': 'Bloodrage Chrism',
                        'url': '/page/Item:Bloodrage_Chrism',
                        'type': 'Bool',
                        'sourceText': 'Bloodrage DefenseBloodrage Defense: You gain bonuses.',
                        'sourceTooltip': 'Bloodrage Defense: You gain bonuses.',
                    }
                ],
            }
        ],
    })
    monkeypatch.setattr(admin_api, '_load_llm_json', lambda file_name, default: [])
    monkeypatch.setattr(admin_api, 'write_llm_json', lambda data, file_name: writes.update({file_name: data}))
    monkeypatch.setattr(admin_api, '_load_review_state', lambda: review_state)
    monkeypatch.setattr(admin_api, '_save_review_state', lambda data: review_state.update(data))
    monkeypatch.setattr(admin_api, '_load_asset_json', lambda file_name, default: default)

    result = admin_api.queue_affix_name_for_compound_review('Bloodrage Defense')

    candidate = writes['compound_affix_candidates'][0]
    assert result['candidatePresent'] is True
    assert result['status'] == 'needs-tweak'
    assert result['candidatePriority'] == 'normal'
    assert candidate['affixName'] == 'Bloodrage Defense'
    assert candidate['exampleItems'] == [{'itemName': 'Bloodrage Chrism', 'itemUrl': '/page/Item:Bloodrage_Chrism'}]
    assert candidate['sourceTooltips'] == ['Bloodrage Defense: You gain bonuses.']
    assert review_state['Bloodrage Defense']['status'] == 'needs-tweak'
    assert review_state['Bloodrage Defense']['queuedFromAffixNames'] is True


def test_queue_affix_name_for_compound_review_merges_existing_candidate(monkeypatch):
    writes = {}
    review_state = {}

    monkeypatch.setattr(admin_api, 'build_affix_name_review_payload', lambda: {
        'entries': [
            {
                'name': 'Paired Defenses',
                'examples': [
                    {
                        'parentName': 'New Item',
                        'url': '/page/Item:New_Item',
                        'type': 'Insight',
                        'sourceText': 'Paired Defenses +5',
                        'sourceTooltip': 'Paired Defenses: You gain bonuses to both defenses.',
                    }
                ],
            }
        ],
    })

    def load_llm(file_name, default):
        if file_name == 'compound_affix_candidates':
            return [
                {
                    'affixName': 'Paired Defenses',
                    'exampleItems': [{'itemName': 'Old Item', 'itemUrl': '/page/Item:Old_Item'}],
                    'originalNames': ['Old Paired Defenses +4'],
                    'sourceTooltips': ['Paired Defenses: Old tooltip.'],
                    'candidatePriority': 'normal',
                }
            ]
        return default

    monkeypatch.setattr(admin_api, '_load_llm_json', load_llm)
    monkeypatch.setattr(admin_api, 'write_llm_json', lambda data, file_name: writes.update({file_name: data}))
    monkeypatch.setattr(admin_api, '_load_review_state', lambda: review_state)
    monkeypatch.setattr(admin_api, '_save_review_state', lambda data: review_state.update(data))
    monkeypatch.setattr(admin_api, '_load_asset_json', lambda file_name, default: default)

    result = admin_api.queue_affix_name_for_compound_review('Paired Defenses')

    candidate = writes['compound_affix_candidates'][0]
    assert result['candidatePriority'] == 'high'
    assert candidate['exampleItems'] == [
        {'itemName': 'Old Item', 'itemUrl': '/page/Item:Old_Item'},
        {'itemName': 'New Item', 'itemUrl': '/page/Item:New_Item'},
    ]
    assert candidate['sourceTooltips'] == [
        'Paired Defenses: Old tooltip.',
        'Paired Defenses: You gain bonuses to both defenses.',
    ]
    assert candidate['knownBonusType'] == 'Insight'
