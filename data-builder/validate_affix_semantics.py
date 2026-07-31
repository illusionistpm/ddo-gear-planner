from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, TypedDict

from typedefs import Affix


class SemanticValidationResult(TypedDict):
    equivalent: bool
    severity: str
    reason: str


@dataclass
class SemanticUsageTotals:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    requests: int = 0

    def record(self, usage_meta: dict[str, Any]) -> None:
        self.prompt_tokens += int(usage_meta.get('prompt_tokens', 0))
        self.completion_tokens += int(usage_meta.get('completion_tokens', 0))
        self.requests += 1


def build_parsed_summary(affixes: list[Affix]) -> str:
    parts: list[str] = []
    for affix in affixes:
        name = str(affix.get('name'))
        value = affix.get('value')
        bonus_type = str(affix.get('type', ''))
        if bonus_type and bonus_type not in ('Bool', 'Untyped'):
            parts.append(f"+{value} {bonus_type} bonus to {name}")
        elif value == 1:
            parts.append(name)
        else:
            parts.append(f"{name} {value}")
    return '; '.join(parts)


def call_llm_for_semantic_validation(original_text: str, parsed_summary: str, model: str = 'gpt-4.1-mini') -> tuple[SemanticValidationResult, dict[str, Any]]:
    from openai import OpenAI

    client = OpenAI()
    payload = {'originalText': original_text, 'parsedSummary': parsed_summary}
    completion = client.chat.completions.create(
        model=model,
        response_format={'type': 'json_object'},
        messages=[
            {
                'role': 'system',
                'content': (
                    'Validate structured parses of Dungeons & Dragons Online item affixes. '
                    'Focus on stats affected, bonus types, numeric values, missing effects, and extra effects.'
                ),
            },
            {
                'role': 'user',
                'content': (
                    'Return JSON: {"equivalent": boolean, "severity": "none | minor_text_difference | '
                    'value_mismatch | bonus_type_mismatch | missing_effect | extra_effect | other", "reason": string}.'
                ),
            },
            {'role': 'user', 'content': json.dumps(payload, sort_keys=True)},
        ],
    )
    result = json.loads(completion.choices[0].message.content or '{}')
    usage_meta: dict[str, Any] = {}
    if completion.usage is not None:
        usage_meta = {
            'prompt_tokens': completion.usage.prompt_tokens,
            'completion_tokens': completion.usage.completion_tokens,
        }
    return result, usage_meta
