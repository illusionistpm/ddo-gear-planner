from collections import defaultdict
from typing import Any

from compound_affixes import load_compound_affixes
from llm_io import write_llm_json
from read_json import read_json
from typedefs import Affix, Item


def build_compound_affix_candidates(items: list[Item] | None = None) -> list[dict[str, Any]]:
    items = items if items is not None else read_json('items')
    known_compound_names = set(load_compound_affixes().keys())
    candidates: dict[str, dict[str, Any]] = {}
    observed_bonus_types: defaultdict[str, set[str]] = defaultdict(set)

    for item in items:
        for aff in item.get('affixes', []):
            name = aff.get('name')
            if not isinstance(name, str) or not name or name in known_compound_names:
                continue

            record = candidates.setdefault(
                name,
                {
                    'affixName': name,
                    'exampleItems': [],
                    'originalNames': [],
                    'sourceTooltips': [],
                },
            )

            if len(record['exampleItems']) < 3:
                example = {
                    'itemName': item.get('name'),
                    'itemUrl': item.get('url'),
                }
                if example not in record['exampleItems']:
                    record['exampleItems'].append(example)

            source_text = aff.get('sourceText')
            if isinstance(source_text, str) and source_text and source_text not in record['originalNames'] and len(record['originalNames']) < 3:
                record['originalNames'].append(source_text)

            source_tooltip = aff.get('sourceTooltip')
            if isinstance(source_tooltip, str) and source_tooltip and source_tooltip not in record['sourceTooltips'] and len(record['sourceTooltips']) < 3:
                record['sourceTooltips'].append(source_tooltip)

            aff_type = aff.get('type')
            if isinstance(aff_type, str) and aff_type not in ('Bool', 'Untyped'):
                observed_bonus_types[name].add(aff_type)

    for name, record in candidates.items():
        types = observed_bonus_types.get(name)
        if types:
            record['typeIsParsed'] = True
            record['valueIsParsed'] = True
        if types and len(types) == 1:
            record['knownBonusType'] = next(iter(types))

    return sorted(candidates.values(), key=lambda c: str(c['affixName']).casefold())


def main() -> None:
    write_llm_json(build_compound_affix_candidates(), 'compound_affix_candidates')


if __name__ == '__main__':
    main()
