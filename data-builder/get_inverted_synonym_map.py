from build_synonyms import load_synonyms
from read_json import read_json

from typedefs import AffixSynonyms


class CaseInsensitiveSynonymMap(dict[str, str]):
    @staticmethod
    def _key(key):
        if isinstance(key, str):
            return key.strip().casefold()
        return key

    def __setitem__(self, key, value):
        super().__setitem__(self._key(key), value)

    def __getitem__(self, key):
        return super().__getitem__(self._key(key))

    def __contains__(self, key):
        return super().__contains__(self._key(key))

    def get(self, key, default=None):
        return super().get(self._key(key), default)


def get_inverted_synonym_map() -> dict[str, str]:
    try:
        synData: list[AffixSynonyms] = load_synonyms()
    except FileNotFoundError:
        synData = read_json('affix-synonyms')

    out: dict[str, str] = CaseInsensitiveSynonymMap()
    for syn in synData:
        for name in syn['synonyms']:
            out[name] = syn['name']
    
    return out
