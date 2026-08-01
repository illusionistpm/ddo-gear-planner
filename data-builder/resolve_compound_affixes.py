from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from typing import Any, Literal, TypedDict

from allowed_bonus_types import get_allowed_bonus_types
from build_compound_affix_candidates import get_candidate_exclusion_reason
from compound_affixes import load_compound_affixes, save_compound_affixes
from llm_io import read_llm_json, write_llm_json
from typedefs import CompoundAffixDefinition, CompoundAffixComponent, CompoundAffixValue, CompoundAffixMap


class CompoundAffixCandidate(TypedDict, total=False):
    affixName: str
    exampleItems: list[dict[str, str]]
    originalNames: list[str]
    sourceTooltips: list[str]
    knownBonusType: str
    typeIsParsed: bool
    valueIsParsed: bool


class LLMComponentValue(TypedDict):
    mode: Literal['same_as_affix_number', 'fixed', 'boolean_one']
    amount: int | None


class LLMComponent(TypedDict):
    name: str
    type: str
    value: LLMComponentValue


class LLMResult(TypedDict):
    isCompound: bool
    components: list[LLMComponent]
    notes: str | None
    errors: list[str]


@dataclass
class UsageTotals:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    requests: int = 0

    def record(self, usage_meta: dict[str, Any]) -> None:
        self.prompt_tokens += int(usage_meta.get('prompt_tokens', 0))
        self.completion_tokens += int(usage_meta.get('completion_tokens', 0))
        self.requests += 1

    def estimate_cost(self, prompt_cost_per_1m: float, completion_cost_per_1m: float) -> float:
        return (
            (self.prompt_tokens / 1_000_000) * prompt_cost_per_1m
            + (self.completion_tokens / 1_000_000) * completion_cost_per_1m
        )


class ProgressPrinter:
    def __init__(self, enabled: bool = True):
        self.enabled = enabled
        self.active = False
        self.last_width = 0

    def querying(self, affix_name: str) -> None:
        if not self.enabled:
            return
        message = f"Querying: {affix_name}"
        self._write_line(message)
        self.active = True

    def kept(self, affix_name: str) -> None:
        if not self.enabled:
            return
        self._write_line(f"[kept] {affix_name}")
        sys.stdout.write('\n')
        sys.stdout.flush()
        self.active = False
        self.last_width = 0

    def finish(self) -> None:
        if not self.enabled or not self.active:
            return
        sys.stdout.write('\r' + ' ' * self.last_width + '\r')
        sys.stdout.flush()
        self.active = False
        self.last_width = 0

    def _write_line(self, message: str) -> None:
        padding = max(0, self.last_width - len(message))
        sys.stdout.write('\r' + message + ' ' * padding)
        sys.stdout.flush()
        self.last_width = len(message)


def call_llm_for_decomposition(candidate: CompoundAffixCandidate, model: str) -> tuple[LLMResult, dict[str, Any]]:
    from openai import OpenAI

    client = OpenAI()
    allowed_types = sorted(get_allowed_bonus_types() - {'Bool', 'Untyped'})
    allowed_types.append('<TypeAlreadyParsed>')

    payload = {
        'candidate': candidate,
        'allowedBonusTypes': allowed_types,
        'schema': {
            'isCompound': 'boolean',
            'components': [
                {
                    'name': 'string',
                    'type': 'one allowed bonus type',
                    'value': {'mode': 'same_as_affix_number | fixed | boolean_one', 'amount': 'number | null'},
                }
            ],
            'notes': 'string | null',
            'errors': ['string'],
        },
    }

    completion = client.chat.completions.create(
        model=model,
        response_format={'type': 'json_object'},
        messages=[
            {
                'role': 'system',
                'content': (
                    'Normalize Dungeons & Dragons Online item affixes. Decide whether an affix is compound, '
                    'meaning it should stay visible as its named in-game affix but expose multiple permanent '
                    'underlying stat bonuses as an affix-group hover breakdown for a gear planner. '
                    'Passive always-on bonuses to spell critical chance, spell critical damage, spell power, '
                    'absorption, resistance, skills, DCs, or other character stats are permanent bonuses even '
                    'when they only matter during spell casts, attacks, saves, or critical hits. '
                    'Do not decompose temporary combat-state effects, stacking effects, clickies, procs, or '
                    'short-duration bonuses. Return only JSON matching the schema.'
                ),
            },
            {
                'role': 'user',
                'content': (
                    'Use <TypeAlreadyParsed> when typeIsParsed is true. Use same_as_affix_number when '
                    'valueIsParsed is true and the component scales with the parsed value. If uncertain, '
                    'return isCompound=false with errors explaining why. If a passive tooltip grants critical '
                    'chance with multiple spell damage types, decompose it into the matching Lore affixes. If '
                    'a passive tooltip grants critical damage with multiple spell damage types, decompose it '
                    'into the matching Spell Crit Damage affixes. If the affix only grants bonuses '
                    'after kills, on hit, on vorpal, while stacks are active, until stacks expire, or until '
                    'the item is unequipped/blocked, return isCompound=false; those effects should remain '
                    'as their named affix instead of being broken into permanent stat bonuses.'
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


def _validate_value(value: LLMComponentValue) -> CompoundAffixValue:
    mode = value['mode']
    if mode not in ('same_as_affix_number', 'fixed', 'boolean_one'):
        raise ValueError(f"Unsupported value mode '{mode}'")
    out: CompoundAffixValue = {'mode': mode}
    if mode == 'fixed':
        if value.get('amount') is None:
            raise ValueError("fixed value mode requires amount")
        out['amount'] = int(value['amount'])
    return out


def _validate_component(component: LLMComponent, allowed_types: set[str]) -> CompoundAffixComponent:
    name = component['name'].strip()
    bonus_type = component['type'].strip()
    if not name:
        raise ValueError('component name cannot be empty')
    if bonus_type not in allowed_types and bonus_type != '<TypeAlreadyParsed>':
        raise ValueError(f"Unsupported bonus type '{bonus_type}' for component '{name}'")
    return {'name': name, 'type': bonus_type, 'value': _validate_value(component['value'])}


def _to_definition(result: LLMResult, allowed_types: set[str]) -> CompoundAffixDefinition:
    definition: CompoundAffixDefinition = {
        'components': [_validate_component(component, allowed_types) for component in result['components']]
    }
    if result.get('notes'):
        definition['notes'] = result['notes'] or ''
    return definition


def resolve_compound_affixes(
    model: str,
    prompt_cost_per_1m: float = 0.0,
    completion_cost_per_1m: float = 0.0,
    retry_affixes: list[str] | None = None,
    show_progress: bool = True,
) -> None:
    candidates: list[CompoundAffixCandidate] = read_llm_json('compound_affix_candidates')
    mapping: CompoundAffixMap = load_compound_affixes()
    allowed_types = get_allowed_bonus_types()
    usage = UsageTotals()
    retry_names = set(retry_affixes or [])
    progress = ProgressPrinter(show_progress)

    try:
        attempts: dict[str, Any] = read_llm_json('compound_affix_attempts')
    except FileNotFoundError:
        attempts = {}

    for candidate in candidates:
        affix_name = candidate['affixName']
        if affix_name in mapping or (affix_name in attempts and affix_name not in retry_names):
            continue

        exclusion_reason = get_candidate_exclusion_reason(candidate)
        if exclusion_reason:
            attempts[affix_name] = {
                'status': 'filtered',
                'errors': [exclusion_reason],
                'notes': 'Skipped by deterministic candidate filter before LLM resolution.',
            }
            write_llm_json(attempts, 'compound_affix_attempts')
            continue

        progress.querying(affix_name)
        result, usage_meta = call_llm_for_decomposition(candidate, model)
        usage.record(usage_meta)

        if result.get('errors') or not result.get('isCompound'):
            attempts[affix_name] = {
                'status': 'not-compound' if not result.get('isCompound') else 'error',
                'errors': result.get('errors', []),
                'notes': result.get('notes'),
            }
            write_llm_json(attempts, 'compound_affix_attempts')
            continue

        try:
            mapping[affix_name] = _to_definition(result, allowed_types)
        except ValueError as exc:
            attempts[affix_name] = {'status': 'validation-failed', 'errors': [str(exc)]}
            write_llm_json(attempts, 'compound_affix_attempts')
            continue

        attempts.pop(affix_name, None)
        save_compound_affixes(mapping)
        progress.kept(affix_name)

    progress.finish()
    save_compound_affixes(mapping)
    write_llm_json(attempts, 'compound_affix_attempts')

    if usage.requests:
        print(f"Requests: {usage.requests}")
        print(f"Prompt tokens: {usage.prompt_tokens}")
        print(f"Completion tokens: {usage.completion_tokens}")
        if prompt_cost_per_1m or completion_cost_per_1m:
            print(f"Estimated cost: ${usage.estimate_cost(prompt_cost_per_1m, completion_cost_per_1m):.4f}")


def main() -> None:
    parser = argparse.ArgumentParser(description='Resolve candidate compound affixes via an offline LLM run')
    parser.add_argument('--model', default='gpt-4.1-mini')
    parser.add_argument('--prompt-cost-per-1m', type=float, default=0.0)
    parser.add_argument('--completion-cost-per-1m', type=float, default=0.0)
    parser.add_argument('--retry-affix', action='append', default=[], help='Retry a named affix even if it already has an attempt record')
    parser.add_argument('--no-progress', action='store_true', help='Disable per-affix progress output')
    args = parser.parse_args()
    resolve_compound_affixes(
        args.model,
        args.prompt_cost_per_1m,
        args.completion_cost_per_1m,
        args.retry_affix,
        not args.no_progress,
    )


if __name__ == '__main__':
    main()
