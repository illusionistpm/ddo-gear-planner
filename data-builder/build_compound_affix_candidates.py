from collections import defaultdict
import json
import os
import re
from typing import Any

from compound_affixes import load_compound_affixes
from llm_io import write_llm_json
from provenance_io import get_provenance_json_path
from read_json import read_json
from typedefs import Affix, Item


def _candidate_text(candidate: dict[str, Any]) -> str:
    parts = [str(candidate.get('affixName', ''))]
    parts.extend(str(value) for value in candidate.get('originalNames', []))
    parts.extend(str(value) for value in candidate.get('sourceTooltips', []))
    return ' '.join(parts).lower()


def _extract_source_affix_label(affix: Affix) -> str | None:
    for key in ('sourceTooltip', 'sourceText'):
        source = affix.get(key)
        if not isinstance(source, str):
            continue

        match = re.search(r'^\s*(.*?)\s+\+?-?\d+%?(?::|[A-Z]|$)', source)
        if match:
            label = match.group(1).strip()
            if label and not label.startswith(('+', '-')):
                return label

    return None


def _should_repair_candidate_name(parsed_name: str, source_label: str) -> bool:
    if parsed_name == source_label or len(parsed_name) >= len(source_label):
        return False
    if parsed_name[:1].islower() and source_label[:1].isupper():
        return True

    parsed_words = parsed_name.casefold().split()
    source_words = source_label.casefold().split()
    return bool(parsed_words and source_words and parsed_words[-1] == source_words[-1] and len(parsed_words) < len(source_words))


def get_candidate_affix_name(affix: Affix) -> str | None:
    name = affix.get('name')
    if not isinstance(name, str) or not name:
        return None

    source_label = _extract_source_affix_label(affix)
    if source_label and _should_repair_candidate_name(name, source_label):
        return source_label

    return name


def read_items_for_candidates() -> list[Item]:
    provenance_path = get_provenance_json_path('items')
    if os.path.exists(provenance_path):
        with open(provenance_path, 'r', encoding='utf8') as fh:
            return json.load(fh)
    return read_json('items')


def get_candidate_exclusion_reason(candidate: dict[str, Any]) -> str | None:
    name = str(candidate.get('affixName', '')).strip()
    lower_name = name.lower()
    text = _candidate_text(candidate)

    if not candidate.get('sourceTooltips'):
        return 'missing-tooltip'
    if re.fullmatch(r'[+-]?\d+', name):
        return 'numeric-only-name'
    if lower_name in ('none', 'missing parts'):
        return 'placeholder'
    if ' clicky' in lower_name or 'charges:' in text:
        return 'clicky'
    if lower_name.startswith(('feat:', 'spell:')):
        return 'granted-feat-or-spell'
    if lower_name.startswith('hidden effect:'):
        return 'hidden-effect-label'
    if lower_name.startswith('special: casts'):
        return 'spell-clicky'
    if lower_name.startswith('see the item description') or lower_name.startswith('see:'):
        return 'documentation-pointer'
    if 'upgrade' in lower_name:
        return 'upgrade-marker'
    if any(marker in lower_name for marker in ('required class', 'class required', 'required trait', 'minimum level')):
        return 'requirement-metadata'
    if any(marker in text for marker in (
        'lasts for ',
        'linger for ',
        'lingers for ',
        'will be released',
        'if you block or unequip',
        'when you strike the killing blow',
        'killing a monster will',
        'per stack',
        'stack up to',
        'stacks up to',
    )):
        return 'temporary-or-stacking-effect'

    return None


def _looks_like_multi_target_tooltip(text: str) -> bool:
    multi_target_patterns = [
        r'\b[a-z ]+,\s+[a-z ]+,\s+(?:and\s+)?[a-z ]+',
        r'\b[a-z ]+\s+and\s+[a-z ]+\s+(?:spell|spells|skills?|absorption|resistance|lore|power|damage)',
        r'\b(?:both|all|each)\b',
        r'\bin addition\b',
        r'\byou receive a \+\d+ .* and\b',
    ]
    return any(re.search(pattern, text) for pattern in multi_target_patterns)


def get_candidate_priority(candidate: dict[str, Any], existing_affix_groups: set[str] | None = None) -> str:
    name = str(candidate.get('affixName', ''))
    text = _candidate_text(candidate)
    existing_affix_groups = existing_affix_groups or set()

    if name in existing_affix_groups:
        return 'manual-affix-group'
    if any(marker in text for marker in (' d6 ', ' d8 ', ' d10 ', ' d12 ', ' on hit:', 'on vorpal:', 'guard:', 'bane damage')):
        return 'low-damage-proc'
    if any(marker in name.lower() for marker in (' guard', 'bane', ' blast', ' burst')):
        return 'low-damage-proc'
    if _looks_like_multi_target_tooltip(text):
        return 'high'
    return 'normal'


def _load_existing_affix_groups() -> set[str]:
    try:
        groups = read_json('affix-groups')
    except FileNotFoundError:
        return set()
    return {
        group['name']
        for group in groups
        if isinstance(group, dict) and isinstance(group.get('name'), str)
    }


def build_compound_affix_candidates(items: list[Item] | None = None) -> list[dict[str, Any]]:
    items = items if items is not None else read_items_for_candidates()
    known_compound_names = set(load_compound_affixes().keys())
    existing_affix_groups = _load_existing_affix_groups()
    candidates: dict[str, dict[str, Any]] = {}
    observed_bonus_types: defaultdict[str, set[str]] = defaultdict(set)

    for item in items:
        for aff in item.get('affixes', []):
            name = get_candidate_affix_name(aff)
            if name is None or name in known_compound_names:
                continue

            record = candidates.setdefault(
                name,
                {
                    'affixName': name,
                    'exampleItems': [],
                    'originalNames': [],
                    'sourceTooltips': [],
                },
            )

            if len(record['exampleItems']) < 3:
                example = {
                    'itemName': item.get('name'),
                    'itemUrl': item.get('url'),
                }
                if example not in record['exampleItems']:
                    record['exampleItems'].append(example)

            source_text = aff.get('sourceText')
            if isinstance(source_text, str) and source_text and source_text not in record['originalNames'] and len(record['originalNames']) < 3:
                record['originalNames'].append(source_text)

            source_tooltip = aff.get('sourceTooltip')
            if isinstance(source_tooltip, str) and source_tooltip and source_tooltip not in record['sourceTooltips'] and len(record['sourceTooltips']) < 3:
                record['sourceTooltips'].append(source_tooltip)

            aff_type = aff.get('type')
            if isinstance(aff_type, str) and aff_type not in ('Bool', 'Untyped'):
                observed_bonus_types[name].add(aff_type)

    for name, record in candidates.items():
        types = observed_bonus_types.get(name)
        if types:
            record['typeIsParsed'] = True
            record['valueIsParsed'] = True
        if types and len(types) == 1:
            record['knownBonusType'] = next(iter(types))

    filtered_candidates: list[dict[str, Any]] = []
    priority_order = {
        'high': 0,
        'manual-affix-group': 1,
        'normal': 2,
        'low-damage-proc': 3,
    }
    for record in candidates.values():
        exclusion_reason = get_candidate_exclusion_reason(record)
        if exclusion_reason:
            continue
        record['candidatePriority'] = get_candidate_priority(record, existing_affix_groups)
        filtered_candidates.append(record)

    return sorted(
        filtered_candidates,
        key=lambda c: (
            priority_order.get(str(c.get('candidatePriority')), 99),
            str(c['affixName']).casefold(),
        ),
    )


def main() -> None:
    write_llm_json(build_compound_affix_candidates(), 'compound_affix_candidates')


if __name__ == '__main__':
    main()
