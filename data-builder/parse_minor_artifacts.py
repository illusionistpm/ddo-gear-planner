from bs4 import BeautifulSoup
import requests
import os
import re
import json
import collections
from roman_numerals import int_from_roman_numeral
from write_json import write_json
from read_json import read_json

FILIGREE_AFFIX_NAME = 'Max Filigree Slots'
FILIGREE_TIP_RE = re.compile(r'maximum\s+of\s+(\d+)\s+filigree\s+slots?', re.IGNORECASE)

# Shrouded Steps is missing its tip on the wiki, so a single miss is expected. More than this
# means the wiki's wording or layout has drifted, and we'd rather stop than ship artifacts
# with no filigree affix.
MAX_ARTIFACTS_WITHOUT_TIP = 3


def get_artifacts_from_page(soup):
    """Returns {artifact name: max filigree slots, or None when the row has no tip}."""

    cols = {}

    table = soup.find(id='bodyContent').find(id='mw-content-text').find('div').find('table', class_="wikitable").find('tbody')
    for idx, col in enumerate(table.find_all('th')):
        cols[col.getText().strip()] = idx

    rows = table.find_all('tr', recursive=False)

    # For some reason, the header is showing up as a row
    rows.pop(0)

    artifacts = {}

    for row in rows:
        fields = row.find_all('td', recursive=False)

        itemLink = fields[cols['Item']].find('a')
        tip = FILIGREE_TIP_RE.search(fields[-1].get_text(' '))
        artifacts[itemLink.getText().strip()] = int(tip.group(1)) if tip else None

    return artifacts


def check_filigree_tips(artifacts):
    missing = [name for name, slots in artifacts.items() if slots is None]
    if missing and (len(missing) > MAX_ARTIFACTS_WITHOUT_TIP or len(missing) == len(artifacts)):
        raise ValueError(
            f'{len(missing)} of {len(artifacts)} Minor Artifacts have no "{FILIGREE_TIP_RE.pattern}" tip '
            f'(allowed: {MAX_ARTIFACTS_WITHOUT_TIP}); the wiki page has probably changed. Missing: {", ".join(missing)}')


def apply_artifacts(items, artifacts):
    """Tags each artifact item and gives it a Max Filigree Slots affix, listed first."""
    for item in items:
        if item['name'] not in artifacts:
            continue

        item['artifact'] = True

        slots = artifacts[item['name']]
        if slots is None:
            continue

        # Shrouded Steps' Feet page carries the tip as an unrecognised Bool enchantment. Dropping our own
        # affix as well keeps a re-run over an already-processed items.json from doubling it up.
        item['affixes'] = [a for a in item.get('affixes', [])
                           if a.get('name') != FILIGREE_AFFIX_NAME and not FILIGREE_TIP_RE.search(a.get('name', ''))]
        # First, so it leads the item's affix list: it's the artifact's defining trait.
        item['affixes'].insert(0, {'name': FILIGREE_AFFIX_NAME, 'type': 'Untyped', 'value': str(slots)})


# Modify the existing items list to add the artifact tag and filigree affix
def parse_minor_artifacts():
    items = read_json('items')

    page = open('./cache/minor_artifacts/Minor_Artifacts.html', "r", encoding='utf-8').read()

    soup = BeautifulSoup(page, 'html.parser')

    artifacts = get_artifacts_from_page(soup)
    check_filigree_tips(artifacts)
    apply_artifacts(items, artifacts)

    write_json(items, 'items')


if __name__ == "__main__":
    parse_minor_artifacts()
