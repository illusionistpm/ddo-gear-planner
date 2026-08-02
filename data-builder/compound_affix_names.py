import re

from allowed_bonus_types import get_parser_bonus_type_regex, normalize_bonus_type


def strip_leading_parser_bonus_type(name: str) -> str:
    match = re.match(r'^' + get_parser_bonus_type_regex() + r'\s+(.+)$', name)
    if not match:
        return name
    return match.group(2).strip()


def get_value_suffixed_canonical_name(name: str) -> str:
    match = re.match(r'^(.+?)\s+[+-]?\d+%?\s+\1$', name)
    return match.group(1) if match else name


def get_likely_canonical_affix_name(name: str, current_affix_names: set[str]) -> str | None:
    canonical = get_value_suffixed_canonical_name(name)
    if canonical != name and canonical in current_affix_names:
        return canonical

    stripped = strip_leading_parser_bonus_type(name)
    if stripped != name and stripped in current_affix_names:
        return stripped

    return None


def is_source_label_only_type_prefixed(parsed_name: str, source_label: str, parsed_type: object = None) -> bool:
    stripped_label = strip_leading_parser_bonus_type(source_label)
    if stripped_label.casefold() != parsed_name.casefold():
        return False

    if not isinstance(parsed_type, str) or not parsed_type:
        return True

    match = re.match(r'^' + get_parser_bonus_type_regex() + r'\s+', source_label)
    if not match:
        return False
    return normalize_bonus_type(match.group(1)) == normalize_bonus_type(parsed_type)
