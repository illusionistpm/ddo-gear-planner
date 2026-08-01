from build_synonyms import load_synonyms
from read_json import read_json

from typedefs import AffixSynonyms

def get_inverted_synonym_map() -> dict[str, str]:
    try:
        synData: list[AffixSynonyms] = load_synonyms()
    except FileNotFoundError:
        synData = read_json('affix-synonyms')

    out: dict[str, str] = {}
    for syn in synData:
        for name in syn['synonyms']:
            out[name] = syn['name']
    
    return out
