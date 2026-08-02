import json
import os

from typedefs import AffixSynonyms
from write_json import write_json


SYNONYM_SOURCE_PATH = os.path.join(os.path.dirname(__file__), 'affix_synonyms.json')


def load_synonyms() -> list[AffixSynonyms]:
    with open(SYNONYM_SOURCE_PATH, 'r', encoding='utf8') as fh:
        return json.load(fh)


def save_synonyms(data: list[AffixSynonyms]) -> None:
    with open(SYNONYM_SOURCE_PATH, 'w', encoding='utf8') as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write('\n')


def build_synonyms() -> None:
    write_json(load_synonyms(), 'affix-synonyms')


if __name__ == "__main__":
    build_synonyms()
