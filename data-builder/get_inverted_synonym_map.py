from read_json import read_json

from typedefs import AffixSynonyms

def get_inverted_synonym_map() -> dict[str, str]:
    synData: list[AffixSynonyms] = read_json('affix-synonyms')

    out: dict[str, str] = {}
    for syn in synData:
        for name in syn['synonyms']:
            out[name] = syn['name']
    
    return out
