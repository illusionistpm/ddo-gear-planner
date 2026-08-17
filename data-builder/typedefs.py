import collections
from typing import Any, Literal, TypedDict, NotRequired

type CatMap = collections.defaultdict[str, str]
type AugmentNameTransformMap = dict[str, str]
type CraftingSystems = dict[str, Any]
type Sets = dict[str, Any]

class Affix(TypedDict):
    name: str
    type: str
    value: Any
    sourceText: NotRequired[str]
    sourceTooltip: NotRequired[str]
    parserSource: NotRequired[str]

class CompoundAffixValue(TypedDict, total=False):
    mode: Literal["same_as_affix_number", "fixed", "boolean_one"]
    amount: int

class CompoundAffixComponent(TypedDict):
    name: str
    type: str
    value: CompoundAffixValue

class CompoundAffixDefinition(TypedDict, total=False):
    components: list[CompoundAffixComponent]
    notes: str

type CompoundAffixMap = dict[str, CompoundAffixDefinition]

class AffixSynonyms(TypedDict):
    name: str
    synonyms: list[str]

class AffixGroup(TypedDict):
    name: str
    affixes: list[str]
    components: NotRequired[list[Affix]]

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
    pack: NotRequired[str]
    rare: NotRequired[bool]
    quests: NotRequired[list[str]]
    set: NotRequired[str]
    sets: NotRequired[list]
    crafting: NotRequired[list]

class SetAugment(TypedDict):
    name: str
    set: NotRequired[str]
