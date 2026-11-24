"""data/affix-descriptions.json: what each affix does, in the wiki's words.

Every enchantment on a wiki item page carries a hover tooltip, written for that
item: "Strength +3: This item gives the wearer the power of Ogre Strength,
granting a +3 Enhancement bonus to Strength." The planner wants one text per
affix that fits any item, so this turns the parsers' captured tooltips (see
provenance_io.record_affix_tooltips) into templates:

- the enchantment's own name before the first colon goes ("Strength +3: ");
- a number equal to the affix's value becomes {v}, and the affix's bonus type
  before the word "bonus" becomes {type}, for the site to fill in from the row
  showing it (or drop, where it has none);
- any other number stays when every tooltip of that template agrees on it, and
  becomes a numbered slot - {0}, {1} - when they differ ("healing you for
  +{0}d{1} hit points").

"texts" maps an affix name to {"*": text}, plus an entry per type whose own
most common text differs from "*" (a Shield bonus to Armor Class isn't a
Deflection one; DR's type is its bypass). An empty string means "nothing worth
showing".

"numbers" fills the slots, for the text under the same name and key: by the
affix's value ("4": "6" - Deception +4 adds +6 damage), or, where the value
alone doesn't decide them, by value and the item's ML ("1@20"). Slots neither
decides stay unfilled, and the site shows X: the affix picker has no item to
take numbers from, and some procs' dice differ between items of one level.

Text that only restates what the planner's row already says is dropped: one
sentence granting a bonus to the affix itself ("+{v} {type} bonus to Universal
Spell Power"), or, for a compound affix, any one-sentence bonus, since the
site lists a compound's parts under its description anyway.
"""
import collections
import re
from typing import Any

from provenance_io import captured_affix_tooltips, stop_tooltip_capture
from read_json import read_json
from write_json import write_json

# (name, type, value, tooltip), and the item's ML where the affix is on one.
Tooltip = tuple[str, ...]
MIN_TYPE_SUPPORT = 2

# What follows a colon at the start of a tooltip when the colon is the effect's,
# not the end of the enchantment's name ("Passive: +2 Insight bonus ...").
_EFFECT_LABEL = re.compile(r'^(passive|on [a-z -]+|when\b|while\b|note|in addition)', re.IGNORECASE)
_NAME_CONNECTORS = {'of', 'the', 'and', 'to', 'a', 'an', 'in', 'on', 'vs', 'de'}
_NUMBER = re.compile(r'\d+(?:\.\d+)?')
_NOISE_WORDS = {'a', 'an', 'the', 'your', 'you', 'to', 'of', 'and', 'all', 'checks', 'check', 'rolls', 'roll', 'skill', 'skills'}


def strip_enchantment_name(tooltip: str, affix_name: str) -> str:
    """The tooltip without its leading "Enchantment Name +N: ", if it has one."""
    # Names like "Weapon Focus: Falchion" have colons of their own to step over.
    skip = affix_name.count(':') if tooltip.lower().startswith(affix_name.split(':')[0].lower()) else 0
    start = 0
    for _ in range(skip + 1):
        index = tooltip.find(': ', start)
        if index < 0:
            return tooltip
        start = index + 2
    head = tooltip[:start - 2]
    if len(head) > 60 or '.' in head or _EFFECT_LABEL.match(head) or head[:1] in '+-0123456789' or not _is_title(head):
        return tooltip
    return tooltip[start:]


def _is_title(head: str) -> bool:
    """An enchantment's name is title-cased; "This grants you the Proficiency" is a sentence."""
    return all(word[:1].isupper() or not word[:1].isalpha() or word in _NAME_CONNECTORS for word in head.split())


def _tidy(text: str) -> str:
    # The wiki runs a tooltip's notes onto the sentence before: "each hit.Note: ...".
    text = re.sub(r'\.(?=[A-Z])', '. ', text)
    # getText() runs a tooltip's cells together: "Flame StrikeCaster level: 9Charges: 5".
    text = re.sub(r'(?<=[a-z0-9)])(?=[A-Z][a-z])', ' ', text)
    text = _DICE_WITH_RANGE.sub(_split_dice_range, text)
    return re.sub(r'\s+', ' ', text).strip()


# The wiki writes dice as "1d6" with a hover span "1 to 6", which getText()
# runs on: "1d61 to 6". The range starts at the number of dice, which says
# where the sides end.
_REFERS_BACK = re.compile(r'(It|This|That|These|They|Those)\b')
_DICE_WITH_RANGE = re.compile(r'\b(\d+)d(\d+) to (\d+)\b')


def _split_dice_range(match: re.Match) -> str:
    count, digits, high = match.group(1), match.group(2), match.group(3)
    for split in range(1, len(digits)):
        sides, low = digits[:split], digits[split:]
        if low == count and int(high) >= int(count) * int(sides):
            return f'{count}d{sides} ({low} to {high})'
    return match.group(0)


def trim_restatements(text: str, affix_name: str, is_compound: bool) -> str:
    """The text without the sentences that only restate the row, when others say more.

    "Passive: 15% Enhancement bonus to Doublestrike. (Doublestrike is a chance
    to score an additional hit ...)" keeps only what Doublestrike is; Riposte
    loses the bonuses its parts list shows. A leading "Passive:" goes too: the
    planner lists only what gear does while worn.
    """
    sentences = [sentence for sentence in re.split(r'(?<=[.)])\s+(?=[A-Z(+{-])', text) if sentence]
    # A restating sentence stays when the next one leans on it ("It does not
    # stack with a shield"): cut, that would refer to nothing.
    kept = [sentence for index, sentence in enumerate(sentences)
            if not restates_row(sentence, affix_name, is_compound)
            or index + 1 < len(sentences) and _REFERS_BACK.match(sentences[index + 1])]
    text = ' '.join(kept or sentences)
    text = re.sub(r'^Passive:?\s*', '', text)
    # A note in brackets that is all that's left reads better as a sentence.
    if text.startswith('(') and text.endswith(')') and text.count('(') == 1:
        text = text[1:-1]
    return text[:1].upper() + text[1:]


def to_template(body: str, affix_type: str, value: str) -> tuple[str, list[str]]:
    """The body with {v}/{type} placeholders and '#' for its other numbers, and those numbers."""
    if affix_type and affix_type not in ('Bool', '-'):
        body = re.sub(r'\b' + re.escape(affix_type) + r'(?= bonus\b)', '{type}', body, flags=re.IGNORECASE)
    numbers: list[str] = []
    # The sign stays in the text: a "-2 penalty" has the value -2.
    magnitude = value.lstrip('+-')

    def replace(match: re.Match) -> str:
        # A die's sides are never the value, even when they match it (Riposte IV deals 4d4).
        is_die_sides = re.search(r'\dd$', body[:match.start()]) is not None
        if magnitude and affix_type != 'Bool' and match.group(0) == magnitude and not is_die_sides:
            return '{v}'
        numbers.append(match.group(0))
        return '#'

    return _NUMBER.sub(replace, body), numbers


def fill_constants(template: str, number_lists: list[list[str]]) -> str:
    """Put back each '#' every tooltip agrees on; the rest become {n}, n being the '#''s index."""
    parts = template.split('#')
    out = [parts[0]]
    for index, part in enumerate(parts[1:]):
        seen = {numbers[index] for numbers in number_lists if index < len(numbers)}
        out.append(seen.pop() if len(seen) == 1 else '{' + str(index) + '}')
        out.append(part)
    return ''.join(out)


_SLOT = re.compile(r'\{(\d+)\}')


def renumber_slots(text: str) -> tuple[str, list[int]]:
    """The text with its slots numbered 0, 1, ... in order, and each one's index before."""
    kept: list[int] = []

    def replace(match: re.Match) -> str:
        kept.append(int(match.group(1)))
        return '{' + str(len(kept) - 1) + '}'

    return _SLOT.sub(replace, text), kept


def number_table(instances: list[tuple[str, str, list[str]]], kept: list[int]) -> dict[str, str]:
    """The slots' numbers by value - or, where the value doesn't decide them, by value@ml."""
    by_value: dict[str, set[str]] = collections.defaultdict(set)
    by_value_ml: dict[tuple[str, str], set[str]] = collections.defaultdict(set)
    for value, ml, numbers in instances:
        if any(index >= len(numbers) for index in kept):
            continue
        filled = ' '.join(numbers[index] for index in kept)
        by_value[value].add(filled)
        by_value_ml[(value, ml)].add(filled)
    table: dict[str, str] = {}
    for value, seen in by_value.items():
        if len(seen) == 1:
            table[value] = next(iter(seen))
            continue
        for (other, ml), seen_at_ml in by_value_ml.items():
            if other == value and ml and len(seen_at_ml) == 1:
                table[f'{value}@{ml}'] = next(iter(seen_at_ml))
    return dict(sorted(table.items()))


def _words(text: str) -> set[str]:
    words = (word.lower() for word in re.findall(r"[A-Za-z']+", text))
    return {word[:-1] if word.endswith('s') else word for word in words if word not in _NOISE_WORDS}


def restates_row(text: str, affix_name: str, is_compound: bool) -> bool:
    """Whether the text says no more than the planner's row (and, for a compound, its parts)."""
    # A clicky's tooltip is its spell's name, caster level and charges: the name says as much.
    clicky = re.fullmatch(r'(.*?)\s*Caster level: \S+\s*Charges: .*', text)
    if clicky:
        return _words(clicky.group(1)) <= _words(affix_name)
    body = re.sub(r'^Passive:?\s*', '', text)
    sentences = [sentence for sentence in re.split(r'(?<=\.)\s+', body) if sentence]
    if len(sentences) != 1 or '(' in body:
        return False
    target = re.search(r'\b(bonus|penalty) (?:to|on) (.*)$', body, re.IGNORECASE)
    if not target:
        return False
    if is_compound:
        # A compound's penalty is part of what it is ("oblivious to your
        # surroundings, causing a -10 penalty to Search and Spot"), and its
        # parts list doesn't show one.
        return target.group(1).lower() == 'bonus'
    return _words(target.group(2)) <= _words(affix_name)


def describe_affixes(tooltips: set[Tooltip], compound_names: set[str]) -> tuple[dict[str, dict[str, str]], dict[str, dict[str, dict[str, str]]]]:
    """The "texts" and "numbers" of data/affix-descriptions.json; see the module's docstring."""
    tooltips = {tooltip if len(tooltip) > 4 else (*tooltip, '') for tooltip in tooltips}
    # A tooltip under several affix names came from one wiki line the parser
    # split into its parts ("+2 to AC and saves"): it describes none of them.
    names_by_tooltip: dict[str, set[str]] = collections.defaultdict(set)
    for name, _, _, tooltip, _ in tooltips:
        names_by_tooltip[tooltip].add(name)

    # name -> type -> template -> each tooltip's (value, ml, numbers, tooltip)
    found: dict[str, dict[str, dict[str, list[tuple[str, str, list[str], str]]]]] = collections.defaultdict(
        lambda: collections.defaultdict(lambda: collections.defaultdict(list)))
    for name, affix_type, value, tooltip, ml in sorted(tooltips):
        if len(names_by_tooltip[tooltip]) > 1:
            continue
        body = _tidy(strip_enchantment_name(tooltip, name))
        if len(body) < 8:
            continue
        template, numbers = to_template(body, affix_type, value)
        found[name][affix_type][template].append((value, ml, numbers, tooltip))

    def support(instances: list[tuple[str, str, list[str], str]]) -> int:
        # How many distinct tooltips: the same one on items of several levels counts once.
        return len({(value, tooltip) for value, _, _, tooltip in instances})

    texts: dict[str, dict[str, str]] = {}
    numbers: dict[str, dict[str, dict[str, str]]] = {}
    for name in sorted(found):
        by_type = found[name]
        overall: collections.Counter[str] = collections.Counter()
        for templates in by_type.values():
            for template, instances in templates.items():
                overall[template] += support(instances)

        def render(template: str, affix_type: str | None) -> tuple[str, dict[str, str]]:
            """The text for a template, and its slots' numbers from this type's tooltips (any type's, for None)."""
            all_instances = [instance for templates in by_type.values() for instance in templates.get(template, [])]
            text = fill_constants(template, [instance[2] for instance in all_instances])
            if restates_row(text, name, name in compound_names):
                return '', {}
            text, kept = renumber_slots(trim_restatements(text, name, name in compound_names))
            own = all_instances if affix_type is None else by_type[affix_type].get(template, [])
            return text, number_table([(value, ml, numbers) for value, ml, numbers, _ in own], kept) if kept else {}

        default_template = _most_common(overall)
        # "*" is what the site shows with no type to go on (the affix picker).
        # When no one wording covers half the tooltips (DR names its bypass),
        # it would misdescribe most of them, so it stays empty and each type
        # gets its own text.
        dominant = overall[default_template] * 2 >= sum(overall.values())
        text, table = render(default_template, None) if dominant else ('', {})
        entry = {'*': text}
        tables = {'*': table} if table else {}
        for affix_type in sorted(by_type):
            counts = collections.Counter({template: support(instances) for template, instances in by_type[affix_type].items()})
            template = _most_common(counts)
            # One odd tooltip isn't a type's own wording; it's a wiki slip.
            if template == default_template and dominant or counts[template] < MIN_TYPE_SUPPORT:
                continue
            text, table = render(template, affix_type)
            if text != entry['*']:
                entry[affix_type] = text
                if table:
                    tables[affix_type] = table
        if any(entry.values()):
            texts[name] = entry
            if tables:
                numbers[name] = tables
    return texts, numbers


def build_descriptions(tooltips: set[Tooltip], compound_names: set[str]) -> dict[str, dict[str, str]]:
    return describe_affixes(tooltips, compound_names)[0]


def _most_common(counts: collections.Counter[str]) -> str:
    # Ties go to the alphabetically first, so a rebuild is byte for byte.
    return min(counts, key=lambda template: (-counts[template], template))


def _affix_names(value: Any, names: set[str]) -> set[str]:
    if isinstance(value, dict):
        if isinstance(value.get('name'), str) and ('type' in value or 'value' in value):
            names.add(value['name'])
        for child in value.values():
            _affix_names(child, names)
    elif isinstance(value, list):
        for child in value:
            _affix_names(child, names)
    return names


def write_affix_descriptions() -> None:
    compound_names = {group['name'] for group in read_json('affix-groups')}
    # Tooltips come from intermediate writes too; only affixes the site can show need text.
    names: set[str] = set()
    for file_name in ('items', 'crafting', 'sets'):
        _affix_names(read_json(file_name), names)
    tooltips = {tooltip for tooltip in captured_affix_tooltips() if tooltip[0] in names}
    stop_tooltip_capture()
    texts, numbers = describe_affixes(tooltips, compound_names)
    write_json({'texts': texts, 'numbers': numbers}, 'affix-descriptions')
