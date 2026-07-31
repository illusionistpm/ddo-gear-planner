import json
import os
from typing import cast

from typedefs import Affix, CompoundAffixMap, CompoundAffixDefinition, CompoundAffixComponent


_COMPOUND_AFFIXES: CompoundAffixMap | None = None


def get_compound_affix_path() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), 'llm', 'compound_affixes.json'))


def load_compound_affixes() -> CompoundAffixMap:
    global _COMPOUND_AFFIXES

    if _COMPOUND_AFFIXES is not None:
        return _COMPOUND_AFFIXES

    path = get_compound_affix_path()
    if not os.path.exists(path):
        _COMPOUND_AFFIXES = {}
        return _COMPOUND_AFFIXES

    with open(path, 'r', encoding='utf8') as fh:
        _COMPOUND_AFFIXES = cast(CompoundAffixMap, json.load(fh))
    return _COMPOUND_AFFIXES


def save_compound_affixes(mapping: CompoundAffixMap) -> None:
    global _COMPOUND_AFFIXES

    path = get_compound_affix_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf8') as fh:
        json.dump(mapping, fh, indent=2, sort_keys=True, ensure_ascii=False)
    _COMPOUND_AFFIXES = mapping


def _materialize_component_affix(component: CompoundAffixComponent, base_value: object, base_type: object) -> Affix:
    value_spec = component['value']
    mode = value_spec['mode']

    if mode == 'same_as_affix_number':
        value = base_value
    elif mode == 'fixed':
        value = value_spec.get('amount', base_value)
    elif mode == 'boolean_one':
        value = 1
    else:
        value = base_value

    component_type = component['type']
    bonus_type = base_type if component_type == '<TypeAlreadyParsed>' and isinstance(base_type, str) else component_type

    return {
        'name': component['name'],
        'type': bonus_type,
        'value': value,
    }


def expand_single_affix(affix: Affix, compound_map: CompoundAffixMap | None = None) -> list[Affix]:
    mapping = compound_map if compound_map is not None else load_compound_affixes()
    name = affix.get('name')
    if not isinstance(name, str) or name not in mapping:
        return [affix]

    definition: CompoundAffixDefinition = mapping[name]
    components = [
        _materialize_component_affix(component, affix.get('value'), affix.get('type'))
        for component in definition.get('components', [])
    ]
    return components or [affix]


def expand_affix_list_with_compounds(affixes: list[Affix]) -> list[Affix]:
    mapping = load_compound_affixes()
    expanded: list[Affix] = []
    for affix in affixes:
        expanded.extend(expand_single_affix(affix, mapping))
    return expanded
