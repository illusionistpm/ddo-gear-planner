from __future__ import annotations

import json
import os
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any

from build_synonyms import build_synonyms, load_synonyms, save_synonyms
from provenance_io import get_provenance_json_path
from read_json import read_json
from typedefs import AffixSynonyms


ASSET_NAMES = ['items', 'crafting', 'sets', 'affix-groups']
PARSER_BACKLOG_PATH = os.path.join(os.path.dirname(__file__), 'affix_parser_backlog.json')
REVIEW_STATE_PATH = os.path.join(os.path.dirname(__file__), 'affix_name_review_state.json')


def _read_asset(name: str) -> Any:
    provenance_path = get_provenance_json_path(name)
    if os.path.exists(provenance_path):
        with open(provenance_path, 'r', encoding='utf8') as fh:
            return json.load(fh)
    return read_json(name)


def _string(value: object) -> str:
    return str(value) if value is not None else ''


def _context_name(path: list[str], container: dict[str, Any]) -> str:
    name = container.get('name')
    if isinstance(name, str) and name.strip():
        return name.strip()
    return ' / '.join(path[-4:]) if path else '<root>'


def _append_affix_example(
    examples: list[dict[str, Any]],
    asset: str,
    path: list[str],
    container: dict[str, Any],
    affix: dict[str, Any],
    limit: int,
) -> None:
    if len(examples) >= limit:
        return
    examples.append(
        {
            'asset': asset,
            'parentName': _context_name(path, container),
            'path': ' / '.join(path),
            'url': container.get('url') if isinstance(container.get('url'), str) else '',
            'type': _string(affix.get('type')),
            'value': _string(affix.get('value')),
            'sourceText': _string(affix.get('sourceText')),
            'sourceTooltip': _string(affix.get('sourceTooltip')),
        }
    )


def _walk_affixes(value: Any, asset: str, path: list[str], callback) -> None:
    if isinstance(value, dict):
        affixes = value.get('affixes')
        if isinstance(affixes, list):
            for affix in affixes:
                if isinstance(affix, dict):
                    callback(value, affix, path + ['affixes'])
                elif isinstance(affix, str):
                    callback(value, {'name': affix, 'type': 'Bool', 'value': 1}, path + ['affixes'])
        components = value.get('components')
        if isinstance(components, list):
            for component in components:
                if isinstance(component, dict):
                    callback(value, component, path + ['components'])
        for key, child in value.items():
            if key in ('affixes', 'components'):
                continue
            _walk_affixes(child, asset, path + [str(key)], callback)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _walk_affixes(child, asset, path + [str(index)], callback)


def collect_affix_inventory(asset_names: list[str] | None = None, example_limit: int = 8) -> dict[str, dict[str, Any]]:
    inventory: dict[str, dict[str, Any]] = {}

    for asset in asset_names or ASSET_NAMES:
        try:
            data = _read_asset(asset)
        except FileNotFoundError:
            continue

        def collect(container: dict[str, Any], affix: dict[str, Any], path: list[str]) -> None:
            name = affix.get('name')
            if not isinstance(name, str) or not name.strip():
                return
            normalized_name = name.strip()
            entry = inventory.setdefault(
                normalized_name,
                {
                    'name': normalized_name,
                    'count': 0,
                    'assets': {},
                    'types': {},
                    'values': {},
                    'examples': [],
                },
            )
            entry['count'] += 1
            entry['assets'][asset] = entry['assets'].get(asset, 0) + 1
            bonus_type = _string(affix.get('type')) or '<missing>'
            entry['types'][bonus_type] = entry['types'].get(bonus_type, 0) + 1
            affix_value = _string(affix.get('value')) or '<missing>'
            entry['values'][affix_value] = entry['values'].get(affix_value, 0) + 1
            _append_affix_example(entry['examples'], asset, path, container, affix, example_limit)

        _walk_affixes(data, asset, [asset], collect)

    return inventory


def _token_key(name: str) -> str:
    words = re.findall(r'[a-z0-9]+', name.casefold())
    return ' '.join(sorted(words))


def _spell_power_key(name: str) -> str | None:
    lower = name.casefold()
    element_aliases = {
        'glaciation': 'cold',
        'combustion': 'fire',
        'corrosion': 'acid',
        'magnetism': 'electric',
        'impulse': 'force',
        'radiance': 'light',
        'reconstruction': 'repair',
        'resonance': 'sonic',
        'nullification': 'negative',
        'devotion': 'positive',
    }
    for alias, element in element_aliases.items():
        if lower == alias:
            return f'{element} spell power'
    match = re.search(r'(acid|cold|electric|fire|force|light|negative|poison|positive|repair|sonic|rust)\s+(?:spell\s*)?power', lower)
    if match:
        return f'{match.group(1)} spell power'
    match = re.search(r'(?:spell\s*)?power\s+(?:for|of)\s+(?:your\s+)?(acid|cold|electric|fire|force|light|negative|poison|positive|repair|sonic|rust)\s+spells?', lower)
    if match:
        return f'{match.group(1)} spell power'
    return None


def _quality_signals(name: str, count: int) -> list[str]:
    signals = []
    if count == 1:
        signals.append('one-off')
    if len(name) > 80:
        signals.append('long-name')
    if re.fullmatch(r'[+-]?\d+(?:\s+.*)?', name):
        signals.append('value-like-name')
    if re.search(r'[.:;]', name) or re.search(r'\b(grants|deals|chance|nearby|possibly|inflicting|lasting)\b', name, re.IGNORECASE):
        signals.append('sentence-like-name')
    return signals


def _load_synonym_maps() -> tuple[list[AffixSynonyms], dict[str, str], set[str]]:
    synonyms = load_synonyms()
    synonym_to_canonical = {}
    canonical_names = set()
    for entry in synonyms:
        canonical = entry['name']
        canonical_names.add(canonical)
        for synonym in entry.get('synonyms', []):
            synonym_to_canonical[synonym] = canonical
    return synonyms, synonym_to_canonical, canonical_names


def build_affix_name_review_payload() -> dict[str, Any]:
    inventory = collect_affix_inventory()
    synonyms, synonym_to_canonical, canonical_names = _load_synonym_maps()
    review_state = load_affix_name_review_state()
    cluster_groups: defaultdict[str, list[str]] = defaultdict(list)

    for name in inventory:
        cluster_groups[_spell_power_key(name) or _token_key(name)].append(name)

    clusters = []
    cluster_ids_by_name: defaultdict[str, list[str]] = defaultdict(list)
    for index, names in enumerate(sorted((sorted(names, key=str.casefold) for names in cluster_groups.values() if len(names) > 1), key=lambda values: values[0].casefold())):
        cluster_id = f'cluster-{index + 1}'
        total_count = sum(inventory[name]['count'] for name in names)
        clusters.append({'id': cluster_id, 'names': names, 'totalCount': total_count})
        for name in names:
            cluster_ids_by_name[name].append(cluster_id)

    entries = []
    for name, entry in inventory.items():
        signals = _quality_signals(name, entry['count'])
        if cluster_ids_by_name[name]:
            signals.append('likely-duplicate')
        synonym_canonical = synonym_to_canonical.get(name)
        state = review_state.get(name, {})
        entries.append(
            {
                **entry,
                'reviewStatus': state.get('status', 'unreviewed'),
                'reviewNotes': state.get('notes', ''),
                'reviewedAt': state.get('reviewedAt'),
                'signals': signals,
                'clusterIds': cluster_ids_by_name[name],
                'synonymCanonicalName': synonym_canonical,
                'isCanonicalSynonymName': name in canonical_names,
                'hasSynonymCoverage': bool(synonym_canonical or name in canonical_names),
            }
        )

    return {
        'entries': sorted(entries, key=lambda value: (len(value['signals']) == 0, value['count'], value['name'].casefold())),
        'clusters': clusters,
        'synonyms': synonyms,
        'backlog': load_parser_backlog(),
        'summary': {
            'totalNames': len(entries),
            'oneOffNames': sum(1 for entry in entries if 'one-off' in entry['signals']),
            'suspiciousNames': sum(1 for entry in entries if entry['signals']),
            'reviewedNames': sum(1 for entry in entries if entry['reviewStatus'] == 'ok'),
            'clusters': len(clusters),
        },
    }


def save_synonym_mapping(canonical_name: str, synonym_names: list[str]) -> dict[str, Any]:
    canonical = canonical_name.strip()
    synonyms_to_add = []
    for synonym in synonym_names:
        clean = synonym.strip()
        if clean and clean != canonical and clean not in synonyms_to_add:
            synonyms_to_add.append(clean)
    if not canonical:
        raise ValueError('canonicalName is required')
    if not synonyms_to_add:
        raise ValueError('at least one synonym is required')

    data = load_synonyms()
    target = None
    for entry in data:
        entry['synonyms'] = [synonym for synonym in entry.get('synonyms', []) if synonym not in synonyms_to_add]
        if entry['name'] == canonical:
            target = entry
    if target is None:
        target = {'name': canonical, 'synonyms': []}
        data.append(target)
    for synonym in synonyms_to_add:
        if synonym not in target['synonyms']:
            target['synonyms'].append(synonym)
    data = sorted(
        [entry for entry in data if entry.get('name') and (entry.get('synonyms') or entry['name'] == canonical)],
        key=lambda entry: entry['name'].casefold(),
    )
    save_synonyms(data)
    build_synonyms()
    return {'canonicalName': canonical, 'synonyms': synonyms_to_add}


def load_parser_backlog() -> list[dict[str, Any]]:
    if not os.path.exists(PARSER_BACKLOG_PATH):
        return []
    with open(PARSER_BACKLOG_PATH, 'r', encoding='utf8') as fh:
        return json.load(fh)


def load_affix_name_review_state() -> dict[str, dict[str, Any]]:
    if not os.path.exists(REVIEW_STATE_PATH):
        return {}
    with open(REVIEW_STATE_PATH, 'r', encoding='utf8') as fh:
        return json.load(fh)


def save_affix_name_review_state(state: dict[str, dict[str, Any]]) -> None:
    with open(REVIEW_STATE_PATH, 'w', encoding='utf8') as fh:
        json.dump(dict(sorted(state.items(), key=lambda item: item[0].casefold())), fh, indent=2, ensure_ascii=False)
        fh.write('\n')


def save_affix_name_review(name: str, payload: dict[str, Any]) -> dict[str, Any]:
    clean_name = name.strip()
    status = str(payload.get('status', '')).strip()
    notes = str(payload.get('notes', '')).strip()
    if not clean_name:
        raise ValueError('name is required')
    if status not in ('ok', 'unreviewed'):
        raise ValueError('status must be ok or unreviewed')

    state = load_affix_name_review_state()
    if status == 'unreviewed':
        state.pop(clean_name, None)
        save_affix_name_review_state(state)
        return {'name': clean_name, 'status': status, 'reviewedAt': None}

    reviewed_at = datetime.now(timezone.utc).isoformat()
    state[clean_name] = {
        'status': status,
        'notes': notes,
        'reviewedAt': reviewed_at,
    }
    save_affix_name_review_state(state)
    return {'name': clean_name, 'status': status, 'reviewedAt': reviewed_at}


def add_parser_backlog_item(payload: dict[str, Any]) -> dict[str, Any]:
    name = str(payload.get('name', '')).strip()
    note = str(payload.get('note', '')).strip()
    if not name:
        raise ValueError('name is required')
    if not note:
        raise ValueError('note is required')

    backlog = load_parser_backlog()
    item = {
        'id': f'affix-parser-{len(backlog) + 1}',
        'name': name,
        'note': note,
        'examples': payload.get('examples', []),
        'createdAt': datetime.now(timezone.utc).isoformat(),
    }
    backlog.append(item)
    with open(PARSER_BACKLOG_PATH, 'w', encoding='utf8') as fh:
        json.dump(backlog, fh, indent=2, ensure_ascii=False)
        fh.write('\n')
    return item
