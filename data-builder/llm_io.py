import json
import os
from typing import Any


LLM_DIR = os.path.join(os.path.dirname(__file__), 'llm')


def get_llm_path(file_name: str) -> str:
    return os.path.join(LLM_DIR, file_name + '.json')


def read_llm_json(file_name: str) -> Any:
    with open(get_llm_path(file_name), 'r', encoding='utf8') as fh:
        return json.load(fh)


def write_llm_json(data: Any, file_name: str) -> None:
    os.makedirs(LLM_DIR, exist_ok=True)
    with open(get_llm_path(file_name), 'w', encoding='utf8') as fh:
        json.dump(data, fh, indent=2, sort_keys=True, ensure_ascii=False)


def read_cache_json(file_name: str) -> Any:
    path = os.path.join(os.path.dirname(__file__), 'cache', file_name + '.json')
    with open(path, 'r', encoding='utf8') as fh:
        return json.load(fh)
