from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import unquote, urlparse

from allowed_bonus_types import get_allowed_bonus_types
from compound_affix_names import get_likely_canonical_affix_name, get_value_suffixed_canonical_name
from compound_affixes import expand_single_affix, load_compound_affixes, save_compound_affixes
from llm_io import (
    COMPOUND_AFFIX_CANDIDATES_FILE,
    COMPOUND_AFFIX_LLM_RESULTS_FILE,
    COMPOUND_AFFIX_REVIEW_STATE_FILE,
    COMPOUND_AFFIX_SUGGESTIONS_FILE,
    get_llm_path,
    read_llm_json,
    write_llm_json,
)
from provenance_io import get_provenance_json_path
from read_json import read_json
from typedefs import Affix, CompoundAffixDefinition, CompoundAffixMap


ReviewState = dict[str, dict[str, Any]]


def _read_json_file(path: str, default: Any) -> Any:
    if not os.path.exists(path):
        return default
    with open(path, 'r', encoding='utf8') as fh:
        return json.load(fh)


def _load_llm_json(file_name: str, default: Any) -> Any:
    try:
        return read_llm_json(file_name)
    except FileNotFoundError:
        return default


def _load_review_state() -> ReviewState:
    return _load_llm_json(COMPOUND_AFFIX_REVIEW_STATE_FILE, {})


def _save_review_state(state: ReviewState) -> None:
    write_llm_json(state, COMPOUND_AFFIX_REVIEW_STATE_FILE)


def _load_items_with_provenance() -> list[dict[str, Any]]:
    provenance_path = get_provenance_json_path('items')
    if os.path.exists(provenance_path):
        return _read_json_file(provenance_path, [])
    try:
        return read_json('items')
    except FileNotFoundError:
        return []


def _load_asset_json(file_name: str, default: Any) -> Any:
    try:
        return read_json(file_name)
    except FileNotFoundError:
        return default


def _format_affix(affix: Affix) -> dict[str, Any]:
    return {
        'name': affix.get('name'),
        'type': affix.get('type'),
        'value': affix.get('value'),
        'sourceText': affix.get('sourceText'),
        'sourceTooltip': affix.get('sourceTooltip'),
        'parserSource': affix.get('parserSource'),
    }


def _build_impact_examples(
    affix_name: str,
    definition: CompoundAffixDefinition | None,
    items: list[dict[str, Any]],
    limit: int = 25,
) -> list[dict[str, Any]]:
    if not definition:
        return []

    examples: list[dict[str, Any]] = []
    mapping = {affix_name: definition}
    for item in items:
        for affix in item.get('affixes', []):
            if affix.get('name') != affix_name:
                continue
            examples.append(
                {
                    'itemName': item.get('name'),
                    'itemUrl': item.get('url'),
                    'before': [_format_affix(affix)],
                    'after': [_format_affix(expanded) for expanded in expand_single_affix(affix, mapping)],
                }
            )
            break
        if len(examples) >= limit:
            break
    return examples


def _find_example_tooltip(affix_name: str, items: list[dict[str, Any]]) -> str:
    for item in items:
        for affix in item.get('affixes', []):
            if affix.get('name') != affix_name:
                continue
            tooltip = affix.get('sourceTooltip') or affix.get('sourceText')
            if isinstance(tooltip, str) and tooltip.strip():
                return tooltip.strip()
    return ''


def get_canonical_review_name(affix_name: str) -> str:
    return get_value_suffixed_canonical_name(affix_name)


def build_current_affix_name_set(items: list[dict[str, Any]]) -> set[str]:
    names: set[str] = set()
    for item in items:
        for affix in item.get('affixes', []):
            name = affix.get('name')
            if isinstance(name, str) and name.strip():
                names.add(name.strip())
    return names


def build_known_affix_names(items: list[dict[str, Any]]) -> list[str]:
    names = build_current_affix_name_set(items)

    for group in _load_asset_json('affix-groups', []):
        if not isinstance(group, dict):
            continue
        group_name = group.get('name')
        if isinstance(group_name, str) and group_name.strip():
            names.add(group_name.strip())
        for affix_name in group.get('affixes', []):
            if isinstance(affix_name, str) and affix_name.strip():
                names.add(affix_name.strip())
        for component in group.get('components', []):
            if isinstance(component, dict):
                component_name = component.get('name')
                if isinstance(component_name, str) and component_name.strip():
                    names.add(component_name.strip())

    for definition in load_compound_affixes().values():
        for component in definition.get('components', []):
            name = component.get('name')
            if isinstance(name, str) and name.strip():
                names.add(name.strip())

    return sorted(names, key=lambda value: value.casefold())


def get_stale_reason(name: str, name_matches_current_affix: bool, suggested_canonical_name: str | None) -> str | None:
    if name_matches_current_affix:
        return None
    if suggested_canonical_name:
        return 'canonical-name-exists'
    return 'no-current-parsed-affix'


def _validate_definition(definition: Any) -> CompoundAffixDefinition:
    if not isinstance(definition, dict):
        raise ValueError('definition must be an object')
    components = definition.get('components')
    if not isinstance(components, list) or not components:
        raise ValueError('definition.components must be a non-empty array')

    allowed_types = get_allowed_bonus_types()
    normalized_components = []
    for index, component in enumerate(components):
        if not isinstance(component, dict):
            raise ValueError(f'component {index + 1} must be an object')

        name = str(component.get('name', '')).strip()
        bonus_type = str(component.get('type', '')).strip()
        value = component.get('value')
        if not name:
            raise ValueError(f'component {index + 1} name is required')
        if bonus_type not in allowed_types and bonus_type not in ('<TypeAlreadyParsed>', '__inherit_type__'):
            raise ValueError(f"component {index + 1} has unsupported bonus type '{bonus_type}'")
        if not isinstance(value, dict):
            raise ValueError(f'component {index + 1} value must be an object')

        mode = value.get('mode')
        if mode not in ('same_as_affix_number', 'fixed', 'boolean_one'):
            raise ValueError(f'component {index + 1} has unsupported value mode')
        normalized_value: dict[str, Any] = {'mode': mode}
        if mode == 'fixed':
            if value.get('amount') in (None, ''):
                raise ValueError(f'component {index + 1} fixed value requires amount')
            normalized_value['amount'] = int(value['amount'])

        normalized_components.append({'name': name, 'type': bonus_type, 'value': normalized_value})

    normalized: CompoundAffixDefinition = {'components': normalized_components}
    notes = definition.get('notes')
    if isinstance(notes, str) and notes.strip():
        normalized['notes'] = notes.strip()
    return normalized


def build_review_payload() -> dict[str, Any]:
    suggestions: CompoundAffixMap = _load_llm_json(COMPOUND_AFFIX_SUGGESTIONS_FILE, {})
    llm_results: dict[str, Any] = _load_llm_json(COMPOUND_AFFIX_LLM_RESULTS_FILE, {})
    candidates: list[dict[str, Any]] = _load_llm_json(COMPOUND_AFFIX_CANDIDATES_FILE, [])
    candidate_by_name = {candidate.get('affixName'): candidate for candidate in candidates}
    curated = load_compound_affixes()
    review_state = _load_review_state()
    items = _load_items_with_provenance()
    current_affix_names = build_current_affix_name_set(items)
    known_affix_names = build_known_affix_names(items)

    all_names = set(suggestions.keys()) | set(curated.keys()) | set(review_state.keys())
    known_canonical_names = all_names | set(candidate_by_name.keys())
    names = []
    for name in all_names:
        canonical_name = get_canonical_review_name(name)
        if canonical_name != name and canonical_name in known_canonical_names:
            continue
        names.append(name)
    names = sorted(names, key=lambda value: value.casefold())
    entries = []
    for name in names:
        name_matches_current_affix = name in current_affix_names
        suggested_canonical_name = get_likely_canonical_affix_name(name, current_affix_names)
        candidate_present = name in candidate_by_name
        state = review_state.get(name, {})
        status = state.get('status')
        if not status:
            status = 'accepted' if name in curated else 'unreviewed'
        reviewed_definition = curated.get(name) or suggestions.get(name)
        entries.append(
            {
                'name': name,
                'status': status,
                'reviewNotes': state.get('notes', ''),
                'reviewedAt': state.get('reviewedAt'),
                'exampleTooltip': _find_example_tooltip(name, items),
                'suggestion': suggestions.get(name),
                'reviewedDefinition': reviewed_definition,
                'candidate': candidate_by_name.get(name),
                'candidatePresent': candidate_present,
                'nameMatchesCurrentAffix': name_matches_current_affix,
                'suggestedCanonicalName': suggested_canonical_name,
                'staleReason': get_stale_reason(name, name_matches_current_affix, suggested_canonical_name),
                'llmResult': llm_results.get(name),
                'impact': _build_impact_examples(name, reviewed_definition, items),
            }
        )

    return {
        'allowedBonusTypes': sorted(get_allowed_bonus_types()) + ['<TypeAlreadyParsed>'],
        'knownAffixNames': known_affix_names,
        'entries': entries,
        'files': {
            'suggestions': get_llm_path(COMPOUND_AFFIX_SUGGESTIONS_FILE),
            'llmResults': get_llm_path(COMPOUND_AFFIX_LLM_RESULTS_FILE),
            'reviewState': get_llm_path(COMPOUND_AFFIX_REVIEW_STATE_FILE),
        },
    }


def quarantine_stale_suggestion(name: str) -> dict[str, Any]:
    suggestions: CompoundAffixMap = _load_llm_json(COMPOUND_AFFIX_SUGGESTIONS_FILE, {})
    if name not in suggestions:
        raise ValueError('suggestion does not exist')

    items = _load_items_with_provenance()
    current_affix_names = build_current_affix_name_set(items)
    suggested_canonical_name = get_likely_canonical_affix_name(name, current_affix_names)
    stale_reason = get_stale_reason(name, name in current_affix_names, suggested_canonical_name)
    if not stale_reason:
        raise ValueError('suggestion is not stale')

    llm_results: dict[str, Any] = _load_llm_json(COMPOUND_AFFIX_LLM_RESULTS_FILE, {})
    definition = suggestions.pop(name)
    llm_results[name] = {
        'status': 'stale-suggestion',
        'errors': [stale_reason],
        'notes': 'Removed from compound affix suggestions by admin stale-suggestion cleanup.',
        'suggestedCanonicalName': suggested_canonical_name,
        'definition': definition,
        'quarantinedAt': datetime.now(timezone.utc).isoformat(),
    }
    write_llm_json(suggestions, COMPOUND_AFFIX_SUGGESTIONS_FILE)
    write_llm_json(llm_results, COMPOUND_AFFIX_LLM_RESULTS_FILE)
    return {
        'name': name,
        'status': 'quarantined',
        'staleReason': stale_reason,
        'suggestedCanonicalName': suggested_canonical_name,
    }


def save_review_decision(name: str, payload: dict[str, Any]) -> dict[str, Any]:
    status = payload.get('status')
    if status not in ('accepted', 'tweaked', 'needs-tweak', 'rejected'):
        raise ValueError('status must be accepted, tweaked, needs-tweak, or rejected')

    curated = dict(load_compound_affixes())
    review_state = _load_review_state()
    notes = str(payload.get('notes', '')).strip()
    reviewed_at = datetime.now(timezone.utc).isoformat()

    if status in ('accepted', 'tweaked'):
        curated[name] = _validate_definition(payload.get('definition'))
    else:
        curated.pop(name, None)

    review_state[name] = {
        'status': status,
        'notes': notes,
        'reviewedAt': reviewed_at,
    }
    save_compound_affixes(curated)
    _save_review_state(review_state)
    return {'name': name, 'status': status, 'reviewedAt': reviewed_at}


class AdminApiHandler(BaseHTTPRequestHandler):
    server_version = 'DDOAdminApi/1.0'

    def do_OPTIONS(self) -> None:
        self._send_empty(204)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == '/api/compound-affixes/review':
            self._send_json(build_review_payload())
            return
        self._send_json({'error': 'not found'}, 404)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        prefix = '/api/compound-affixes/review/'
        if parsed.path.startswith(prefix):
            affix_name = unquote(parsed.path[len(prefix):])
            try:
                payload = self._read_body()
                self._send_json(save_review_decision(affix_name, payload))
            except ValueError as exc:
                self._send_json({'error': str(exc)}, 400)
            return
        cleanup_prefix = '/api/compound-affixes/stale-suggestions/'
        cleanup_suffix = '/quarantine'
        if parsed.path.startswith(cleanup_prefix) and parsed.path.endswith(cleanup_suffix):
            affix_name = unquote(parsed.path[len(cleanup_prefix):-len(cleanup_suffix)])
            try:
                self._send_json(quarantine_stale_suggestion(affix_name))
            except ValueError as exc:
                self._send_json({'error': str(exc)}, 400)
            return
        self._send_json({'error': 'not found'}, 404)

    def log_message(self, format: str, *args: Any) -> None:
        sys.stderr.write('%s - %s\n' % (self.log_date_time_string(), format % args))

    def _read_body(self) -> dict[str, Any]:
        length = int(self.headers.get('Content-Length', '0'))
        raw_body = self.rfile.read(length).decode('utf8') if length else '{}'
        payload = json.loads(raw_body or '{}')
        if not isinstance(payload, dict):
            raise ValueError('request body must be a JSON object')
        return payload

    def _send_empty(self, status: int) -> None:
        self.send_response(status)
        self._send_common_headers()
        self.end_headers()

    def _send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        body = json.dumps(payload, sort_keys=True).encode('utf8')
        self.send_response(status)
        self._send_common_headers()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_common_headers(self) -> None:
        origin = self.headers.get('Origin', '')
        allowed_origins = {
            'http://localhost:4200',
            'http://127.0.0.1:4200',
            'http://localhost:4201',
            'http://127.0.0.1:4201',
        }
        self.send_header('Access-Control-Allow-Origin', origin if origin in allowed_origins else 'http://localhost:4201')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')


def main() -> None:
    parser = argparse.ArgumentParser(description='Run the local-only DDO data admin API')
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), AdminApiHandler)
    print(f'Admin API listening at http://{args.host}:{args.port}')
    server.serve_forever()


if __name__ == '__main__':
    main()
