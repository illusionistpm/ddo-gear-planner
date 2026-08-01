import copy
import os
from typing import Any

from get_output_path import get_output_path


PROVENANCE_KEYS = {'sourceText', 'sourceTooltip', 'parserSource'}


def include_affix_provenance() -> bool:
    return os.environ.get('DDO_AFFIX_PROVENANCE', '').lower() in ('1', 'true', 'yes')


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
