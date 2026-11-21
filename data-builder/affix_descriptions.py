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
  becomes X when they differ ("healing you for +XdX hit points").

The output maps an affix name to {"*": text}, plus an entry per type whose own
most common text differs from "*" (a Shield bonus to Armor Class isn't a
Deflection one; DR's type is its bypass). An empty string means "nothing worth
showing".

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

Tooltip = tuple[str, str, str, str]
MIN_TYPE_SUPPORT = 2

# What follows a colon at the start of a tooltip when the colon is the effect's,
# not the end of the enchantment's name ("Passive: +2 Insight bonus ...").
_EFFECT_LABEL = re.compile(r'^(passive|on [a-z -]+|when\b|while\b|note|in addition)', re.IGNORECASE)
_NAME_CONNECTORS = {'of', 'the', 'and', 'to', 'a', 'an', 'in', 'on', 'vs', 'de'}
_NUMBER = re.compile(r'\d+(?:\.\d+)?')
_NOISE_WORDS = {'a', 'an', 'the', 'your', 'you', 'to', 'of', 'and', 'all', 'checks', 'check', 'rolls', 'roll'}


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
    return re.sub(r'\s+', ' ', text).strip()


def to_template(body: str, affix_type: str, value: str) -> tuple[str, list[str]]:
    """The body with {v}/{type} placeholders and '#' for its other numbers, and those numbers."""
    if affix_type and affix_type not in ('Bool', '-'):
        body = re.sub(r'\b' + re.escape(affix_type) + r'(?= bonus\b)', '{type}', body, flags=re.IGNORECASE)
    numbers: list[str] = []
    # The sign stays in the text: a "-2 penalty" has the value -2.
    magnitude = value.lstrip('+-')

    def replace(match: re.Match) -> str:
        if magnitude and affix_type != 'Bool' and match.group(0) == magnitude:
            return '{v}'
        numbers.append(match.group(0))
        return '#'

    return _NUMBER.sub(replace, body), numbers


def fill_constants(template: str, number_lists: list[list[str]]) -> str:
    """Put back each '#' every tooltip agrees on; the rest become X."""
    parts = template.split('#')
    out = [parts[0]]
    for index, part in enumerate(parts[1:]):
        seen = {numbers[index] for numbers in number_lists if index < len(numbers)}
        out.append(seen.pop() if len(seen) == 1 else 'X')
        out.append(part)
    return ''.join(out)


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
    target = re.search(r'\bbonus (?:to|on) (.*)$', body, re.IGNORECASE)
    if not target:
        return False
    return is_compound or _words(target.group(1)) <= _words(affix_name)


def build_descriptions(tooltips: set[Tooltip], compound_names: set[str]) -> dict[str, dict[str, str]]:
    # A tooltip under several affix names came from one wiki line the parser
    # split into its parts ("+2 to AC and saves"): it describes none of them.
    names_by_tooltip: dict[str, set[str]] = collections.defaultdict(set)
    for name, _, _, tooltip in tooltips:
        names_by_tooltip[tooltip].add(name)

    # name -> type -> template -> the numbers each tooltip had in it
    found: dict[str, dict[str, dict[str, list[list[str]]]]] = collections.defaultdict(
        lambda: collections.defaultdict(lambda: collections.defaultdict(list)))
    for name, affix_type, value, tooltip in sorted(tooltips):
        if len(names_by_tooltip[tooltip]) > 1:
            continue
        body = _tidy(strip_enchantment_name(tooltip, name))
        if len(body) < 8:
            continue
        template, numbers = to_template(body, affix_type, value)
        found[name][affix_type][template].append(numbers)

    descriptions: dict[str, dict[str, str]] = {}
    for name in sorted(found):
        by_type = found[name]
        overall: collections.Counter[str] = collections.Counter()
        for templates in by_type.values():
            for template, number_lists in templates.items():
                overall[template] += len(number_lists)

        def render(template: str) -> str:
            number_lists = [numbers for templates in by_type.values() for numbers in templates.get(template, [])]
            text = fill_constants(template, number_lists)
            return '' if restates_row(text, name, name in compound_names) else text

        default_template = _most_common(overall)
        # "*" is what the site shows with no type to go on (the affix picker).
        # When no one wording covers half the tooltips (DR names its bypass),
        # it would misdescribe most of them, so it stays empty and each type
        # gets its own text.
        dominant = overall[default_template] * 2 >= sum(overall.values())
        entry = {'*': render(default_template) if dominant else ''}
        for affix_type in sorted(by_type):
            counts = collections.Counter({template: len(lists) for template, lists in by_type[affix_type].items()})
            template = _most_common(counts)
            # One odd tooltip isn't a type's own wording; it's a wiki slip.
            if template == default_template and dominant or counts[template] < MIN_TYPE_SUPPORT:
                continue
            text = render(template)
            if text != entry['*']:
                entry[affix_type] = text
        if any(entry.values()):
            descriptions[name] = entry
    return descriptions


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
    write_json(build_descriptions(tooltips, compound_names), 'affix-descriptions')
