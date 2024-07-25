from bs4 import BeautifulSoup
import requests
import os
import re
import json
import collections
from roman_numerals import int_from_roman_numeral
from write_json import write_json
from read_json import read_json

def get_fake_bonuses():
    return set(['dodge', 'attack', 'combat', 'strength', 'dex', 'skills', 'ability'])


def cleanup_unicode(name):
    name = name.strip().replace('\u00a0', ' ')
    name = name.strip().replace('\u2014', '-')
    name = name.strip().replace('\u2019', '\'')
    return name


def cleanup_whitespace(name):
    return re.sub(r'\s+', ' ', name).strip()


def convert_roman_numerals(name):
    search = re.search(r'^(.*) ([IVXCMDL]+) *$', name)
    if search:
        return search.group(1) + " " + str(int_from_roman_numeral(search.group(2)))

    return name


def strip_bonus_types(name):
    for type in ['Insightful', 'Exceptional', 'Enhanced', 'Quality', 'Profane', 'Competence', 'Equipment', 'Equipped', 'Inherent', 'Sacred']:
        if name.startswith(type):
            name = name[len(type)+1:]

    return name


def strip_charges(name):
    newName = re.sub(r'(-? \d+ Charges)?( *\(Recharged/[Dd]ay: *?(\d+|None)\))?', '', name)
    return newName.strip() + " clicky" if newName != name else name


def strip_necro4_upgrades(name):
    search = re.search(r'^(Upgradeable - [A-Za-z]+ Augment)', name)
    if search:
        return search.group(1)

    return name


def clean_up_old_augments(name):
    search = re.search(r'^([A-Za-z]+) Slot', name)
    if search:
        return search.group(1) + " Augment Slot"

    return name


def strip_preslotted_augments(name):
    search = re.search(r'^Empty ([A-Za-z]+ Augment Slot)', name)
    if search:
        return search.group(1)

    # The format switched to "{Color} Augment Slot: Empty"
    search = re.search(r'^([A-Za-z]+ Augment Slot)', name)
    if search:
        return search.group(1)

    return name


def strip_fixed_suffixes(name):
    for prefix in ["Attuned to Heroism", "Nearly Finished", "Hidden effect (Defiance)", "Visibility 1",
        "Visibility 2", "Jet Propulsion", "A Mysterious Effect", "Haggle +3 ", "Vampirism 1 ", "Unholy 9 ",
         "Cannith Combat Infusion", "Chitinous Covering", 'Upgradeable Item', 'Thunder-Forged']:
        if name.startswith(prefix):
            return prefix

    return name


#JAK: FIXME!! This should technically be a crafting system...
def cleanup_one_of_the_following(name):
    for match in ["Random effect, for example", "Contains a Random pair from the following"]:
        if name.startswith(match):
            return "<Multiple effects available>"

    return name


def add_default_one(name):
    return name + " 1" if name in ["Necromancy Focus", "Deathblock"] else name


def x_skills_exceptional_bonus(name):
    search = re.search(r'^([A-Za-z]+ Skills) - Exceptional Bonus (.*)', name)
    if search:
        return search.group(1) + " " + search.group(2)

    return name


def sub_name(name):
    for pair in [
        ['Against the Slave Lords Set Bonus', 'Slaver\'s Set Bonus'],
        ['Slaver\'s Augment Slot', 'Green Augment Slot'],
        ['Legendary Slaver\'s Augment Slot', 'Green Augment Slot'],
        ['Fortification Penalty', 'Fortification'],
        ['Construct Fortification', 'Fortification'],
        ['all Spell DCs', 'Spell DCs'],
        ['all Spell DCs (note items display +4 for this bonus, but only +3 is actually granted)', 'Spell DCs'],
        ['+102 Enhancement bonus (Typo, it is actually an Equipment bonus) to all Spellpowers. If this is slotted in a Quarterstaff, also grants a +2 Exceptional bonus to Spell DCs.', '+102 Equipment bonus to all Spellpowers. If this is slotted in a Quarterstaff, also grants a +2 Exceptional bonus to Spell DCs.']
        ]:
        if name == pair[0]:
            return pair[1]

        dino_crafting_search = re.search(r'^Isle of Dread: ([A-Za-z]+) Slot (\([A-Za-z]+\))', name)
        if dino_crafting_search:
            return f"{dino_crafting_search.group(1)} {dino_crafting_search.group(2)}"

    return name


def strip_trailing_colon(name):
    if len(name) > 0 and name[-1] == ':':
        return name[:-1]
    return name


def strip_leading_asterisk(name):
    if len(name) > 0 and name[0] == '*':
        return name[1:]
    return name


# recursive function to parse through a list tag
# function will update crafting dict if a child list is detected in tag
# itemName, craftingSystem, and sets are used to help identify if crafting dict needs to be updated
def translate_list_tag_to_affix_map(itemName, tag, synonymMap, fakeBonuses, ml, craftingSystems, sets):
    aff = {}

    # check to see if the tag includes a child unordered list
    # this can be assumed to be a sign of a selectable property
    if tag.find('ul'):
        keyName = strip_trailing_colon(next(tag.stripped_strings))

        # check to see if the current list entry is an already known crafting system
        # this covers the augment slot lists
        if (keyName in craftingSystems) and ('*' in craftingSystems[keyName]):
            # only need to populate name entry, crafting and set detection done by outer item processing loop
            aff['name'] = keyName
            return aff

        # at this point, we have an unknown unordered list (name keyName) with some list entries inside
        else:
            # new crafting system detected
            # loop through all child list elements and buid crafting dict for this

            # only start recursion for certain entry names
            # wiki will eventually be standardized on "Random set" or "Random effect"
            for match in ["One of", "Random"]:
                if keyName.startswith(match):
                    discoveredCraftingSystem = {}
                    discoveredCraftingSystem[keyName] = []

                    for listEntry in (tag.find('ul')).find_all('li', recursive=False):
                        parsed_affix = translate_list_tag_to_affix_map(itemName, listEntry, synonymMap, fakeBonuses, ml, craftingSystems, sets)

                        # if the affix name was detected as being a set, add the entry to the parent crafting key
                        if parsed_affix['name'] in sets:
                            discoveredCraftingSystem[keyName].append(parsed_affix)

                        # if the affix name was NOT detected as being a set, create a sub "affixes" key with list entry and add THAT parent crafting key
                        else:
                            affixMap = {}
                            affixMap['affixes'] = []
                            affixMap['affixes'].append(parsed_affix)
                            discoveredCraftingSystem[keyName].append(affixMap)

                    if keyName not in craftingSystems:
                        craftingSystems[keyName] = {}

                    craftingSystems[keyName][itemName] = discoveredCraftingSystem[keyName]

    tooltipSpan = tag.find('span', {'class': 'tooltip'})
    tooltip = tooltipSpan.extract() if tooltipSpan else None

    # Ignore child lists, which are typically lists of possible attributes,
    # such as for https://ddowiki.com/page/Item:The_Admiral_of_Bling
    for child in tag.findChildren('li'):
        child.decompose()

    affixName = tag.getText()

    affixName = cleanup_unicode(affixName)
    affixName = cleanup_whitespace(affixName)
    affixName = strip_bonus_types(affixName)
    affixName = strip_charges(affixName)
    affixName = strip_necro4_upgrades(affixName)
    affixName = strip_fixed_suffixes(affixName)
    affixName = strip_preslotted_augments(affixName)
    affixName = strip_trailing_colon(affixName)
    affixName = strip_leading_asterisk(affixName)
    affixName = convert_roman_numerals(affixName)
    affixName = clean_up_old_augments(affixName)
    affixName = cleanup_one_of_the_following(affixName)
    affixName = add_default_one(affixName)
    affixName = x_skills_exceptional_bonus(affixName)

    affixName = affixName.strip()

    affixNameSearch = re.search(r'^(.*?) (- )?\(?\+?(-?[0-9]+)\%?\)?$', affixName)
    if affixNameSearch:
        aff['name'] = affixNameSearch.group(1).strip()
        aff['value'] = affixNameSearch.group(3).strip()
    else:
        affixNameSearch = re.search(r'^(?:You have a )?\+?([0-9]+)%? ([A-Za-z]+) bonus to ([A-Za-z ]+).', affixName)
        if affixNameSearch:
            aff['name'] = affixNameSearch.group(3).strip()
            aff['type'] = affixNameSearch.group(2).strip()
            aff['value'] = affixNameSearch.group(1).strip()
        else:
            aff['name'] = affixName.strip()

    aff['name'] = strip_trailing_colon(aff['name'])
    aff['name'] = sub_name(aff['name'])

    enhancementBonusSearch = re.search(r'^\+(\d+) (Enhancement|Orb) Bonus$', affixName)
    if enhancementBonusSearch:
        aff['name'] = enhancementBonusSearch.group(2) + ' Bonus'
        aff['value'] = enhancementBonusSearch.group(1)
        aff['type'] = enhancementBonusSearch.group(2)

    elif aff['name'].startswith('DR '):
        drGroup = re.search(r'^DR (\d+)/([A-Za-z\-]+)', aff['name'])
        if drGroup:
            aff['value'] = drGroup.group(1)
            aff['type'] = drGroup.group(2)
            aff['name'] = 'DR'

    # Ignore the tooltip for augment slots
    elif not 'Augment Slot' in aff['name'] and tooltip:
        words = str(tooltip)

        # Sometimes the tooltip has a hyperlink title. Those are convenient for picking up multi-word
        # bonuses like "Natural Armor"
        bonusTypeSearch = re.findall('title="([a-z ]+) bonus"', words, re.IGNORECASE)

        # Otherwise, fall back on just grabbing the previous word before "bonus"
        if not bonusTypeSearch:
            bonusTypeSearch = re.findall('([a-z]+) bonus', words, re.IGNORECASE)

        bonusTypeSearch = list(set([value for value in bonusTypeSearch if not value.lower() in fakeBonuses and value[0].isupper()]))
        bonusTypeSearch.sort()

        if bonusTypeSearch:
            aff['type'] = bonusTypeSearch[0].strip()
            if aff['type'] == 'Insightful':
                aff['type'] = 'Insight'
            if aff['type'] == 'Natural Armor':
                aff['type'] = 'Natural'

    # Old fortification (heavy/moderate/light) items don't have a type listed, but it's always enhancement
    if aff['name'] == 'Fortification' and aff['value'] in ['25', '75', '100'] and 'type' not in aff:
        aff['type'] = 'Enhancement'

    if aff['name'] == 'Rough Hide':
        aff['type'] = 'Primal Natural'

    if aff['name'] == 'Slaver\'s Set Bonus' and ml == '28':
        aff['name'] = 'Legendary Slaver\'s Set Bonus'

    if aff['name'] == 'Sheltering' and aff['type'] == 'Physical':
        aff['type'] = 'Enhancement'

    if aff['name'].endswith('False Life') and 'value' not in aff:
        aff['type'] = 'Insight' if 'Insightful' in aff['name'] else 'Enhancement'
        switch = {
            'Lesser False Life': 5,
            'False Life': 10,
            'Improved False Life': 20,
            'Greater False Life': 30,
            'Superior False Life': 40,
            'Epic False Life': 45,
            'Improved Insightful False Life': 20
        }
        aff['value'] = str(switch.get(aff['name'], 99999))
        aff['name'] = 'False Life'

    if aff['name'].endswith(' Resistance') and 'value' not in aff:
        aff['type'] = 'Enhancement'
        aff['name'] = aff['name'].replace('Inherent ', '')
        resistanceGroup = re.search(r'^(([A-Za-z]*) )?([A-Za-z]+) Resistance$', aff['name'])
        if resistanceGroup:
            switch = {
                'Lesser': 3,
                None: 10,
                'Improved': 20,
                'Greater': 30,
                'Superior': 40,
                'Sovereign': 40
            }

            aff['value'] = str(switch.get(resistanceGroup.group(2), 99997))
            aff['name'] = resistanceGroup.group(3) + ' Resistance'

    if 'value' in aff and int(aff['value']) < 0:
        aff['type'] = 'Penalty'

    if 'value' not in aff:
        aff['value'] = 1
        aff['type'] = 'bool'

    if aff['name'] == 'Deathblock' and 'type' not in aff:
        aff['type'] = 'Enhancement'

    if aff['name'] == 'Striding' and 'type' not in aff:
        aff['type'] = 'Enhancement'

    if aff['name'] in synonymMap:
        aff['name'] = synonymMap[aff['name']]

    # unique cases exist where text in description does not correspond to bonus type
    # need to manually compensate
    if tag.getText().startswith('Insightful Natural Armor Bonus'):
        aff['type'] = 'Insight Natural'

    if tag.getText().startswith('Quality Armor Bonus'):
        aff['type'] = 'Quality'

    if tag.getText().startswith('Rough Hide'):
        aff['type'] = 'Primal Natural'

    # case exsits where affix is detected as being associated with a set
    # in those cases, add the set value and remove the value value and type value
    if aff['name'] in sets:
        aff['set'] = aff['name']
        if 'type' in aff:
            del(aff['type'])
        if 'value' in aff:
            del(aff['value'])

    return aff


def parse_affixes_from_cell(itemName, cell, synonymMap, fakeBonuses, ml, craftingSystems, sets):
    ret = []

    if cell.find('ul'):
        affixes = cell.find_all('ul', recursive=False)
        affixes = [ul.find_all('li', recursive=False) for ul in affixes]
        affixes = [item for sublist in affixes for item in sublist]

    else:
        affixes = [cell]

    for affix in affixes:
        itemAffixMap = translate_list_tag_to_affix_map(itemName, affix, synonymMap, fakeBonuses, ml, craftingSystems, sets)
        ret.append(itemAffixMap)

    return ret
