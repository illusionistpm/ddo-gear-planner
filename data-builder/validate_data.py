import csv
import json
import os
from collections import defaultdict
from typing import Any, Optional

from allowed_bonus_types import get_allowed_bonus_types
from provenance_io import get_asset_json_path, get_provenance_json_path, include_affix_provenance

REPORT_OUTPUT_PATH = os.path.join(os.path.dirname(__file__), 'reports')
EXPECTATIONS_PATH = os.path.join(os.path.dirname(__file__), 'affix_expectations.json')
CSV_FIELDS = ['category', 'severity', 'item', 'url', 'affix', 'type', 'value', 'issue', 'sourceText', 'sourceTooltip']


def _load_json(name: str) -> Any | None:
    provenance_path = get_provenance_json_path(name)
    path = provenance_path if include_affix_provenance() and os.path.exists(provenance_path) else get_asset_json_path(name)
    if not os.path.exists(path):
        return None
    with open(path, 'r', encoding='utf8') as fh:
        return json.load(fh)


def load_expectations(path: str = EXPECTATIONS_PATH) -> list[dict[str, Any]]:
    if not os.path.exists(path):
        return []
    with open(path, 'r', encoding='utf8') as fh:
        return json.load(fh)


def _safe_int(value: object) -> Optional[int]:
    try:
        return int(str(value))
    except Exception:
        return None


def _issue(category: str, severity: str, item: dict[str, Any], affix: dict[str, Any], issue: str) -> dict[str, str]:
    return {
        'category': category,
        'severity': severity,
        'item': str(item.get('name', '<unknown>')),
        'url': str(item.get('url', '')),
        'affix': str(affix.get('name', '<unknown>')),
        'type': str(affix.get('type', '')),
        'value': str(affix.get('value', '')),
        'issue': issue,
        'sourceText': str(affix.get('sourceText', '')),
        'sourceTooltip': str(affix.get('sourceTooltip', '')),
    }


def _matches_expectation(affix: dict[str, Any], expectation: dict[str, Any]) -> bool:
    source_text = expectation.get('sourceText')
    source_tooltip = expectation.get('sourceTooltip')
    item_name = expectation.get('itemName')

    if item_name and expectation.get('_itemName') != item_name:
        return False
    if source_text and affix.get('sourceText') != source_text:
        return False
    if source_tooltip and affix.get('sourceTooltip') != source_tooltip:
        return False
    return bool(source_text or source_tooltip or item_name)


def _expectation_issue(item: dict[str, Any], affix: dict[str, Any], expectation: dict[str, Any]) -> dict[str, str] | None:
    expected = expectation['expected']
    mismatches = []
    for key in ('name', 'type', 'value'):
        if str(affix.get(key)) != str(expected.get(key)):
            mismatches.append(f"{key} parsed as '{affix.get(key)}' expected '{expected.get(key)}'")

    if not mismatches:
        return None

    out = _issue(
        'expectation-regression',
        'error',
        item,
        affix,
        f"{expectation.get('id', '<unnamed>')}: " + '; '.join(mismatches),
    )
    return out


def audit_items(items: list[dict[str, Any]], expectations: list[dict[str, Any]] | None = None) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []
    allowed_types = get_allowed_bonus_types()
    expectations = expectations if expectations is not None else load_expectations()
    type_counts_by_affix: defaultdict[str, defaultdict[str, int]] = defaultdict(lambda: defaultdict(int))

    for item in items:
        affixes = item.get('affixes', []) or []
        seen_names: defaultdict[str, int] = defaultdict(int)

        for affix in affixes:
            if not isinstance(affix, dict):
                issues.append(_issue('malformed-affix', 'error', item, {}, 'affix entry is not an object'))
                continue

            name = affix.get('name')
            if not name:
                issues.append(_issue('missing-name', 'error', item, affix, "affix missing 'name'"))
                continue
            seen_names[str(name)] += 1

            bonus_type = affix.get('type')
            if bonus_type is None:
                issues.append(_issue('missing-type', 'warning', item, affix, "affix missing 'type'"))
            elif bonus_type not in allowed_types:
                issues.append(_issue('unknown-type', 'warning', item, affix, f"unknown bonus type '{bonus_type}'"))
            else:
                type_counts_by_affix[str(name)][str(bonus_type)] += 1

            value = affix.get('value')
            numeric_value = _safe_int(value)
            if bonus_type not in (None, 'Bool', 'Untyped') and numeric_value is None:
                issues.append(_issue('missing-numeric-value', 'warning', item, affix, f"no numeric value for type '{bonus_type}'"))
            if numeric_value is not None:
                if numeric_value < 0 and bonus_type != 'Penalty':
                    issues.append(_issue('negative-value', 'warning', item, affix, f"negative value {numeric_value} with non-penalty type"))
                if abs(numeric_value) > 1000:
                    issues.append(_issue('large-value', 'warning', item, affix, f"suspiciously large value {numeric_value}"))

            if str(name) == 'Wizardry' and bonus_type in (None, 'Bool', 'Untyped'):
                issues.append(_issue('suspicious-pairing', 'warning', item, affix, "Wizardry should have a concrete bonus type"))

            for expectation in expectations:
                expectation['_itemName'] = item.get('name')
                if _matches_expectation(affix, expectation):
                    expectation_issue = _expectation_issue(item, affix, expectation)
                    if expectation_issue:
                        issues.append(expectation_issue)

        for name, count in seen_names.items():
            if count > 1:
                issues.append(_issue('duplicate-affix', 'warning', item, {'name': name}, f"duplicate affix present {count} times"))

    for affix_name, type_counts in type_counts_by_affix.items():
        total = sum(type_counts.values())
        if len(type_counts) < 3 or total < 5:
            continue
        sorted_counts = sorted(type_counts.items(), key=lambda entry: entry[1], reverse=True)
        dominant_type, dominant_count = sorted_counts[0]
        for bonus_type, count in sorted_counts[1:]:
            if count == 1 and dominant_count >= 4:
                issues.append({
                    'category': 'unusual-type-distribution',
                    'severity': 'info',
                    'item': '<corpus>',
                    'url': '',
                    'affix': affix_name,
                    'type': bonus_type,
                    'value': '',
                    'issue': f"seen once with '{bonus_type}' but {dominant_count} times with '{dominant_type}'",
                    'sourceText': '',
                    'sourceTooltip': '',
                })

    return issues


def write_report(issues: list[dict[str, str]], report_basename: str | None = None) -> None:
    os.makedirs(REPORT_OUTPUT_PATH, exist_ok=True)
    base = report_basename or 'validation_report'

    with open(f"{REPORT_OUTPUT_PATH}/{base}.json", 'w', encoding='utf8') as fh:
        json.dump({'issues': issues}, fh, indent=2, ensure_ascii=False)

    with open(f"{REPORT_OUTPUT_PATH}/{base}.csv", 'w', encoding='utf8', newline='') as fh:
        writer = csv.DictWriter(fh, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for issue in issues:
            writer.writerow({field: issue.get(field, '') for field in CSV_FIELDS})


def audit_generated_assets(report_basename: str | None = None) -> list[str]:
    items = _load_json('items')
    if items is None:
        issues = [{
            'category': 'missing-data',
            'severity': 'error',
            'item': '<none>',
            'url': '',
            'affix': '<none>',
            'type': '',
            'value': '',
            'issue': 'items.json not found',
            'sourceText': '',
            'sourceTooltip': '',
        }]
    else:
        issues = audit_items(items)

    write_report(issues, report_basename)
    return [f"{issue['severity'].upper()} {issue['category']}: Item '{issue['item']}' affix '{issue['affix']}': {issue['issue']}" for issue in issues]


if __name__ == '__main__':
    messages = audit_generated_assets()
    if messages:
        for message in messages:
            print(message)
    else:
        print('No issues detected')
