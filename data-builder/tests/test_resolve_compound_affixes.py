import json
import sys
import types

import resolve_compound_affixes as module


def test_prompt_treats_passive_spell_crit_damage_as_permanent(monkeypatch):
    captured = {}

    class FakeCompletions:
        def create(self, **kwargs):
            captured['messages'] = kwargs['messages']
            return types.SimpleNamespace(
                choices=[
                    types.SimpleNamespace(
                        message=types.SimpleNamespace(
                            content=json.dumps({'isCompound': False, 'components': [], 'notes': None, 'errors': []})
                        )
                    )
                ],
                usage=None,
            )

    class FakeOpenAI:
        def __init__(self):
            self.chat = types.SimpleNamespace(completions=FakeCompletions())

    monkeypatch.setitem(sys.modules, 'openai', types.SimpleNamespace(OpenAI=FakeOpenAI))

    module.call_llm_for_decomposition(
        {
            'affixName': "Winter's Impertenence",
            'sourceTooltips': [
                "Winter's Impertenence: The chill of Winter surrounds you. +20% Enhancement bonus "
                'to critical damage with force and negative spells.'
            ],
        },
        'test-model',
    )

    prompt_text = ' '.join(message['content'] for message in captured['messages'])
    assert 'spell critical damage' in prompt_text
    assert 'permanent bonuses even when they only matter during spell casts' in prompt_text
    assert 'Spell Crit Damage affixes' in prompt_text


def test_retry_affix_reprocesses_existing_attempt_and_clears_stale_failure(monkeypatch):
    mapping = {}
    writes = {}

    def read_llm_json(name):
        if name == 'compound_affix_candidates':
            return [
                {
                    'affixName': "Winter's Impertenence",
                    'sourceTooltips': [
                        "Winter's Impertenence: +20% Enhancement bonus to critical damage with force and negative spells."
                    ],
                    'typeIsParsed': True,
                    'valueIsParsed': True,
                },
            ]
        if name == 'compound_affix_attempts':
            return {
                "Winter's Impertenence": {
                    'status': 'not-compound',
                    'errors': ['old prompt treated this as temporary'],
                },
            }
        raise FileNotFoundError(name)

    monkeypatch.setattr(module, 'read_llm_json', read_llm_json)
    monkeypatch.setattr(module, 'write_llm_json', lambda data, name: writes.setdefault(name, data.copy()))
    monkeypatch.setattr(module, 'load_compound_affixes', lambda: mapping)
    monkeypatch.setattr(module, 'save_compound_affixes', lambda data: mapping.update(data))
    monkeypatch.setattr(module, 'get_allowed_bonus_types', lambda: {'Enhancement'})
    monkeypatch.setattr(module, 'get_candidate_exclusion_reason', lambda candidate: None)
    monkeypatch.setattr(
        module,
        'call_llm_for_decomposition',
        lambda candidate, model: (
            {
                'isCompound': True,
                'components': [
                    {
                        'name': 'Force Spell Crit Damage',
                        'type': '<TypeAlreadyParsed>',
                        'value': {'mode': 'same_as_affix_number', 'amount': None},
                    },
                    {
                        'name': 'Negative Spell Crit Damage',
                        'type': '<TypeAlreadyParsed>',
                        'value': {'mode': 'same_as_affix_number', 'amount': None},
                    },
                ],
                'notes': 'Passive critical damage bonus split by spell damage type.',
                'errors': [],
            },
            {},
        ),
    )

    module.resolve_compound_affixes('test-model', retry_affixes=["Winter's Impertenence"])

    assert mapping["Winter's Impertenence"] == {
        'components': [
            {
                'name': 'Force Spell Crit Damage',
                'type': '<TypeAlreadyParsed>',
                'value': {'mode': 'same_as_affix_number'},
            },
            {
                'name': 'Negative Spell Crit Damage',
                'type': '<TypeAlreadyParsed>',
                'value': {'mode': 'same_as_affix_number'},
            },
        ],
        'notes': 'Passive critical damage bonus split by spell damage type.',
    }
    assert "Winter's Impertenence" not in writes['compound_affix_attempts']
