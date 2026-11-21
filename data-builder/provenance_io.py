import copy
import os
from typing import Any

from get_output_path import get_output_path


PROVENANCE_KEYS = {'sourceText', 'sourceTooltip', 'parserSource'}


def include_affix_provenance() -> bool:
    return os.environ.get('DDO_AFFIX_PROVENANCE', '').lower() in ('1', 'true', 'yes')


# The affixes' wiki tooltips, as (name, type, value, tooltip), gathered from
# everything write_json writes while capture is on. build.py turns it on so
# affix_descriptions.py can build data/affix-descriptions.json from them; the
# parsers write each file and read the next one back stripped, so write_json
# is the one place every tooltip passes through. Off by default, so parser
# unit tests see affixes without provenance keys.
_tooltip_capture: set[tuple[str, str, str, str]] | None = None


def start_tooltip_capture() -> None:
    global _tooltip_capture
    _tooltip_capture = set()


def stop_tooltip_capture() -> None:
    global _tooltip_capture
    _tooltip_capture = None


def tooltip_capture_enabled() -> bool:
    return _tooltip_capture is not None


def attach_affix_provenance() -> bool:
    """Whether the parsers attach provenance keys to the affixes they build."""
    return include_affix_provenance() or tooltip_capture_enabled()


def record_affix_tooltips(value: Any) -> None:
    if _tooltip_capture is None:
        return
    if isinstance(value, dict):
        tooltip = value.get('sourceTooltip')
        if isinstance(tooltip, str) and tooltip and isinstance(value.get('name'), str):
            _tooltip_capture.add((value['name'], str(value.get('type') or ''), str(value.get('value') or ''), tooltip))
        for child in value.values():
            record_affix_tooltips(child)
    elif isinstance(value, list):
        for child in value:
            record_affix_tooltips(child)


def captured_affix_tooltips() -> set[tuple[str, str, str, str]]:
    return set(_tooltip_capture or ())


def get_asset_json_path(file_name: str) -> str:
    return os.path.normpath(os.path.join(get_output_path(), file_name + '.json'))


def get_provenance_output_path() -> str:
    return os.path.normpath(os.path.join(os.path.dirname(__file__), 'provenance'))


def get_provenance_json_path(file_name: str) -> str:
    return os.path.normpath(os.path.join(get_provenance_output_path(), file_name + '.json'))


def strip_provenance(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: strip_provenance(child)
            for key, child in value.items()
            if key not in PROVENANCE_KEYS
        }

    if isinstance(value, list):
        return [strip_provenance(child) for child in value]

    return copy.deepcopy(value)
