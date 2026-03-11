import collections
from typing import Any, TypedDict, NotRequired

type CatMap = collections.defaultdict[str, str]
type AugmentNameTransformMap = dict[str, str]
type CraftingSystems = dict[str, Any]
type Sets = dict[str, Any]

class Affix(TypedDict):
    name: str
    type: str
    value: Any

class AffixSynonyms(TypedDict):
    name: str
    synonyms: list[str]

class AffixGroup(TypedDict):
    name: str
    affixes: list[str]

class AffixesDict(TypedDict):
    affixes: list[Affix]

class SetDict(TypedDict):
    set: str
    name: NotRequired[str]

class Item(TypedDict):
    name: str
    affixes: list[Affix]
    ml: int
    slot: str
    type: str
    url: str
    quests: NotRequired[list[str]]
    set: NotRequired[str]
    sets: NotRequired[list]
    crafting: NotRequired[list]

class SetAugment(TypedDict):
    name: str
    set: NotRequired[str]
