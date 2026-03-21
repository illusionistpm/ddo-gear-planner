from bs4 import BeautifulSoup
import requests
import os
import re
import json
import collections
from roman_numerals import int_from_roman_numeral
from write_json import write_json
from read_json import read_json
from get_inverted_synonym_map import get_inverted_synonym_map
import copy

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
    search = re.search(r'^(Artifact|Competence|Enhanced|Enhancement|Equipment|Equipped|Exceptional|Festive|Inherent|Insight|Insightful|Profane(?! Experiment)|Quality|Sacred) (.*)$', name)
    if search:
        return search.group(2)

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


def strip_text_commentary(name):
    for needle in ["(if Paladin)", "(if Paladin 20)"]:
        name = name.replace(needle, '')
    return name


#JAK: FIXME!! This should technically be a crafting system...
def cleanup_one_of_the_following(name):
    for match in ["Random effect, for example", "Contains a Random pair from the following"]:
        if name.startswith(match):
            return "<Multiple effects available>"

    return name


def add_default_one(name):
    return name + " 1" if name in ["Necromancy Focus"] else name


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
        ['+102 Enhancement bonus (Typo, it is actually an Equipment bonus) to all Spellpowers. If this is slotted in a Quarterstaff, also grants a +2 Exceptional bonus to Spell DCs.', '+102 Equipment bonus to all Spellpowers. If this is slotted in a Quarterstaff, also grants a +2 Exceptional bonus to Spell DCs.'],
        ]:
        if name == pair[0]:
            return pair[1]

    # For Isle of Dread, Lamordia, etc crafting. Anything where the crafting slot is of the format "Expansion: SLOT_NAME Slot (MaybeEquipmentType): Empty"
    dino_crafting_search = re.search(r'^(?:[A-Za-z \-\']+): ([A-Za-z]+) Slot (\([A-Za-z]+\))', name)
    if dino_crafting_search:
        return f"{dino_crafting_search.group(1)} {dino_crafting_search.group(2)}"

    name = name.replace('Spellcrit', 'Spell Crit')

    return name


def strip_trailing_colon(name):
    if len(name) > 0 and name[-1] == ':':
        return name[:-1]
    return name


def strip_leading_asterisk(name):
    if len(name) > 0 and name[0] == '*':
        return name[1:]
    return name


def addAffixToCraftingSystem(affix, keyName, discoveredCraftingSystem, sets):
    if affix['name'] in sets:
        discoveredCraftingSystem[keyName].append(affix)

    # if the affix name was NOT detected as being a set, create a sub "affixes" key with list entry and add THAT parent crafting key
    else:
        affixMap = {}
        affixMap['affixes'] = []
        affixMap['affixes'].append(affix)
        discoveredCraftingSystem[keyName].append(affixMap)


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
                        if isinstance(parsed_affix, list):
                            for affixEntry in parsed_affix:
                                addAffixToCraftingSystem(affixEntry, keyName, discoveredCraftingSystem, sets)
                        else:
                            addAffixToCraftingSystem(parsed_affix, keyName, discoveredCraftingSystem, sets)

                    if keyName not in craftingSystems:
                        craftingSystems[keyName] = {}

                    craftingSystems[keyName][itemName] = discoveredCraftingSystem[keyName]

    tooltipSpan = tag.find('span', {'class': 'tooltip'})
    tooltip = tooltipSpan.extract() if tooltipSpan else None
    words = str(tooltip)

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
    affixName = strip_text_commentary(affixName)
    affixName = strip_preslotted_augments(affixName)
    affixName = strip_trailing_colon(affixName)
    affixName = strip_leading_asterisk(affixName)
    affixName = convert_roman_numerals(affixName)
    affixName = clean_up_old_augments(affixName)
    affixName = cleanup_one_of_the_following(affixName)
    affixName = add_default_one(affixName)
    affixName = x_skills_exceptional_bonus(affixName)

    affixName = affixName.strip()

    # begin logic to determine properties based on affix name

    # peel out string if this affix only applies to unique item property (Minor Artifact/Quarterstaff)
    affixNameSearch = re.search(r'^(.*)\(if (Quarterstaff|Minor Artifact)\).*$', affixName)
    if affixNameSearch:
        # remove the (if <UNIQUE PROPERTY>) string if found
        affixName = affixNameSearch.group(1).strip()
        # add a value to indicate this affix applies to items with unique property only
        aff['uniquePropertyRequired'] = affixNameSearch.group(2).strip()

    # ex: +5% Quality bonus to Light and Alignment Spell Crit Damage.
    affixNameSearch = re.search(r'^(?:You have a )?\+?([0-9]+)%? ([A-Za-z]+) [Bb]onus to (?:the )?([A-Za-z ]+)\.?$', affixName)
    if ((affixNameSearch) and ('name' not in aff)):
        aff['name'] = affixNameSearch.group(3).strip()
        aff['type'] = affixNameSearch.group(2).strip()
        aff['value'] = affixNameSearch.group(1).strip()

    # ex: +2d6 Profane bonus to your Sneak Attack Dice.
    affixNameSearch = re.search(r'^\+([0-9]+)(?:d6)? (.*?)(?: [Bb]onus to )(?:your )?(.*)\.$', affixName)
    if ((affixNameSearch) and ('name' not in aff)):
        aff['name'] = affixNameSearch.group(3).strip()
        aff['type'] = affixNameSearch.group(2).strip()
        aff['value'] = affixNameSearch.group(1).strip()

    # ex: +15 Enhancement Bonus
    affixNameSearch = re.search(r'^\+(\d+) (Enhancement|Orb) [Bb]onus$', affixName)
    if ((affixNameSearch) and ('name' not in aff)):
        aff['name'] = affixNameSearch.group(2) + ' Bonus'
        aff['type'] = affixNameSearch.group(2)
        aff['value'] = affixNameSearch.group(1)

    # ex: Doublestrike 16%
    affixNameSearch = re.search(r'^(.*?) (- )?\(?\+?(-?[0-9]+)\%?\)?$', affixName)
    if ((affixNameSearch) and ('name' not in aff)):
        aff['name'] = affixNameSearch.group(1).strip()
        aff['value'] = affixNameSearch.group(3).strip()

    # ex: DR 15/Lawful
    affixNameSearch = re.search(r'^(DR) (\d+)/([A-Za-z\-]+)', affixName)
    if ((affixNameSearch) and ('name' not in aff)):
        aff['name'] = affixNameSearch.group(1)
        aff['type'] = affixNameSearch.group(3)
        aff['value'] = affixNameSearch.group(2)

    # ex: Action Boost Enhancement
    affixNameSearch = re.search(r'^.*(Action Boost Enhancement).*$', affixName)
    if ((affixNameSearch) and ('name' not in aff)):
        aff['name'] = affixNameSearch.group(1)

    # ex: Lesser Dragonmark Enhancement/Greater Dragonmark Enhancement
    affixNameSearch = re.search(r'^.*(Lesser|Greater)( Dragonmark Enhancement).*$', affixName)
    if ((affixNameSearch) and ('name' not in aff)):
        aff['name'] = affixNameSearch.group(1) + affixNameSearch.group(2)

    # if previous pass did not populate a name, then just put the full value of the enchantment name as the affix name
    if 'name' not in aff:
        aff['name'] = affixName.strip()

    aff['name'] = strip_trailing_colon(aff['name'])

    # *** must rework this to leverage synonym map at some point ***
    aff['name'] = sub_name(aff['name'])


    # begin logic to determine properties based on tooltip

    if (('type' not in aff) and (tooltip) and ('Augment Slot' not in aff['name'])):
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

    # ex: Increases the damage of your 4th level and lower spells by 20%. ...
    tooltipSearch = re.search(r'^.*?damage.*spells.*?([0-9]+)%.*$', words)
    if ((tooltipSearch) and ('type' not in aff)):
        aff['type'] = 'Equipment'
        aff['value'] = tooltipSearch.group(1)

    # ex: ... Grants a +2 Profane bonus to all abilities.
    tooltipSearch = re.search(r'^.*?Grants a \+([0-9]+).*?bonus.*$', words)
    if ((tooltipSearch) and ('value' not in aff)):
        aff['value'] = tooltipSearch.group(1)

    # ex: ... will increase the total number of Action Boosts you can use by 3. ...
    tooltipSearch = re.search(r'^.*?you can use by ([0-9]+).*$', words)
    if ((tooltipSearch) and ('value' not in aff)):
        aff['value'] = tooltipSearch.group(1)
        if ('type' not in aff):
            aff['type'] = 'Enhancement'

    # ex: ... reduces the arcane spell failure chance by -#%
    tooltipSearch = re.search(r'^.*?reduces the.*arcane spell failure.*chance by -([0-9]+)%.*$', words)
    if ((tooltipSearch) and ('value' not in aff)):
        aff['value'] = tooltipSearch.group(1)

    # case exists where Deathblock effect is previously detected, but really should be Negative Energy Absorption
    tooltipSearch = re.search(r'^.*?([0-9]+)%.*?([A-Za-z]+) [bB]onus.*(Negative Energy Absorption).*$', words)
    if (tooltipSearch):
        aff['name']  = tooltipSearch.group(3)
        aff['type']  = tooltipSearch.group(2)
        aff['value'] = tooltipSearch.group(1)

    # prefix affix with "Feat:" string to create consistency for affixes that grant feats
    tooltipSearch = re.search(r'^.*?grants you the (.*) feat.*$', words)
    if (tooltipSearch):
        aff['name'] = "Feat: " + tooltipSearch.group(1)

    # begin logic for name and type translations

    # unique cases exist where text in (tooltip) description does not correspond to bonus type
    # need to manually compensate
    if tag.getText().startswith('Insightful Natural Armor Bonus'):
        aff['type'] = 'Insight Natural'

    if tag.getText().startswith('Quality Armor Bonus'):
        aff['type'] = 'Quality'

    if tag.getText().startswith('Rough Hide'):
        aff['type'] = 'Primal Natural'

    # Old fortification (heavy/moderate/light) items don't have a type listed, but it's always enhancement
    if aff['name'] == 'Fortification' and aff['value'] in ['25', '75', '100'] and 'type' not in aff:
        aff['type'] = 'Enhancement'

    if aff['name'] == 'Sheltering' and (('type' in aff) and (aff['type'] == 'Physical')):
        aff['type'] = 'Enhancement'

    if aff['name'] == 'Striding' and 'type' not in aff:
        aff['type'] = 'Enhancement'

    if 'value' in aff and int(aff['value']) < 0:
        aff['type'] = 'Penalty'

    if aff['name'] == 'Slaver\'s Set Bonus' and ml == 28:
        aff['name'] = 'Legendary Slaver\'s Set Bonus'

    if (('type' in aff) and (aff['type'] == 'Insightful')):
        aff['type'] = 'Insight'

    if (('type' in aff) and (aff['type'] == 'Natural Armor')):
        aff['type'] = 'Natural'

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
        aff['name'] = aff['name'].replace('Inherent ', '')
        aff['type'] = 'Enhancement'
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

    # if all the work is done and we still dont have a value defined, treat value as 1 and type as boolean
    if 'value' not in aff:
        aff['type'] = 'Bool'
        aff['value'] = 1

    # Radiance (on Celestia, for example) is a different affix than the more common spellpower-boosting Radiance
    if aff['name'] == 'Radiance' and aff['type'] == 'Bool':
        aff['name'] = 'Radiance (enchantment)'

    if aff['name'] in synonymMap:
        aff['name'] = synonymMap[aff['name']]


    # case exists where affix is detected as being associated with a set
    # in those cases, add the set value and remove the value value and type value
    if aff['name'] in sets:
        aff['set'] = aff['name']
        if 'type' in aff:
            del(aff['type'])
        if 'value' in aff:
            del(aff['value'])

    # case exists where deathblock effect is added to other effects
    # append the deathblock effect to the detected effect when returning to caller
    tooltipSearch = re.search(r'^.*?immune to magical effects that can cause instant death.*$', words)
    if (tooltipSearch):
        affDeathblock = {
            'name'  : 'Deathblock',
            'type'  : 'Bool',
            'value' : 1,
        }

        aff = [ aff, affDeathblock ]

    return aff


def parse_affixes_from_cell(itemName, cell, synonymMap, fakeBonuses, ml, craftingSystems, sets):
    ret = []

    # some enhancements are starting to be modified to be wrapped in a collapsible class
    # determine if this cell contains any collapsible divs
    collapsibleDivList = cell.find_all('div', class_='mw-collapsible')
    if collapsibleDivList:
        for collapsibleDiv in collapsibleDivList:
            unorderedList = collapsibleDiv.find('ul')
            if unorderedList:
                unorderedListInCollapsibleContentDiv = collapsibleDiv.find('div', class_='mw-collapsible-content').find('ul')
                if unorderedListInCollapsibleContentDiv:
                    listTag = unorderedList.li
                    # start with limited scope and expand as data is updated
                    if listTag.getText().startswith('Random set'):
                        # create a tag which includes the proper formatting of the unordered list
                        listTag.append(unorderedListInCollapsibleContentDiv.find('ul'))

                        # add the newly created tag to the parent unordered list for processing in the next pass
                        cell.find('ul').append(listTag)

    # if the cell contains an unordered list (at any depth) collect list elements
    if cell.find('ul'):
        affixes = cell.find_all('ul', recursive=False)
        affixes = [ul.find_all('li', recursive=False) for ul in affixes]
        affixes = [item for sublist in affixes for item in sublist]

    else:
        affixes = [cell]

    for affix in affixes:
        itemAffixMap = translate_list_tag_to_affix_map(itemName, affix, synonymMap, fakeBonuses, ml, craftingSystems, sets)
        if isinstance(itemAffixMap, list):
            for affixEntry in itemAffixMap:
                ret.append(affixEntry)
        else:
            ret.append(itemAffixMap)

    return ret


# parse an html tag object and return a map with up to two elements (text and tooltip)
def get_text_map_from_tag(tag):
    textMap = {}

    # create a shallow copy of tag so that when we modify inside this function it does not change value
    tagCopy = copy.copy(tag)

    # if tag contains any unordered lists, remove the contents before processing
    for ul_tag in tagCopy.find_all('ul'):
        ul_tag.decompose()

    # check if tag includes a span with class "has_tooltip"
    hasTooltipSpan = tagCopy.find("span", {"class": "has_tooltip"})
    if (hasTooltipSpan):
        # the span with class has_tooltip will include affix short name
        # as well as a span tag (tooltip) with affix description
        tooltipSpan = tagCopy.find("span", {"class": "tooltip"})

        # sometimes even though a "has_tooltip" span exists, no "tooltip" span exists
        if (tooltipSpan):
            # preserve the contents of the tooltip span in map element "tooltip"
            textMap["tooltip"] = cleanup_unicode(tooltipSpan.getText()).strip()

            # yank out the "tooltip" span from the element
            tooltipSpan.decompose()

        # preserve the remaining contents of the has_tooltip span in map element "text"
        textMap["text"] = cleanup_unicode(tagCopy.getText()).strip()
    else:
        # if no "has_tooltip" span was found, preserve all text in map element "text"
        textMap["text"] = tagCopy.getText().strip()

    return(textMap)


# compare detected affix name against synonym map and return converted (common) name if found
def convert_affix_name_to_common_affix_name(affixName):
    synonymMap = get_inverted_synonym_map()

    if affixName in synonymMap:
        affixName = synonymMap[affixName]

    return affixName


# parse a map of up to two elements {text : "", tooltip : ""}
# in to an affix map of three elements {name: "", type: "", value: ""}
def convert_affix_text_map_to_affix_map(textMap):
    affixMap = {}

    # build bonus type list to be used when scanning string for bonus type
    bonusTypeList = [
        "Alchemical(?! Air)(?! Earth)(?! Fire)(?! Water)",
        "Artifact",
        "Competence",
        "Deflection",
        "[Ee]nhancement",
        "Equipment",
        "Exceptional",
        "Festive",
        "Implement",
        "[Ii]nsight(?:ful)?",
        "Legendary(?! Ash)(?! Affirmation)(?! Dust)(?! Ice)(?! Ooze)(?! Salt)(?! Steam)(?! Vacuum)",
        "Luck",
        "Natural",
        "Profane",
        "Psionic",
        "Quality",
        "Resistance(?! Rating)",
        "Sacred",
        "Vitality",
    ]

    # convert list to regex capture group string
    bonusTypeString = "(" + "|".join(bonusTypeList) + ")"

    affixExceptionDetectionList = [
        "Crushing Wave(?: Guard)?",
        "(?:Improved )?Demonic Shield",
        "(?:Enhanced )?Ghostly",
        "Greater Marksmanship",
        "Occultation",
        "Relentless Fury",
        "Strength of Purpose",
    ]

    # convert list to regex capture group string
    affixExceptionDetectionString = "(?!" + "|".join(affixExceptionDetectionList) + ")"

    # remove text related to bug information sometimes included in affix text grab
    textMap["text"] = textMap["text"].split('Minor bug:', 1)[0].strip()

    # special case exists if affix requires unique property
    # detect those cases and create a unique flag that can be detected and operated on
    affixTextSearch = re.search(r'^(.*?)( \(if (?:Minor Artifact|Quarterstaff)\))$', textMap["text"])
    if (('name' not in affixMap) and (affixTextSearch)):
        textMap['text'] = affixTextSearch.group(1)

        if ('uniquePropertyRequired' not in affixMap):
            affixMap['uniquePropertyRequired'] = {}

        if (affixTextSearch.group(2) == ' (if Minor Artifact)'):
            affixMap['uniquePropertyRequired']['requireMinorArtifact'] = True

        if (affixTextSearch.group(2) == ' (if Quarterstaff)'):
            affixMap['uniquePropertyRequired']['requireQuarterstaff'] = True

    # detect if text is in format (affix bonus type) (affix bonus name) (affix bonus value)
    # ex : Artifact Universal Spell Power +20
    affixTextSearch = re.search(r'^' + bonusTypeString + r' (.*?)(?::)? \+?([0-9]+)%?$', textMap["text"])
    if (('name' not in affixMap) and (affixTextSearch)):
        affixMap['name'] = affixTextSearch.group(2).strip()
        affixMap['type'] = affixTextSearch.group(1).strip()
        affixMap['value'] = affixTextSearch.group(3).strip()

    # detect if text is in format (affix bonus type) (affix bonus name) (affix bonus value [roman numeral format])
    # ex: Insightful Spell Power V
    affixTextSearch = re.search(r'^' + bonusTypeString + r' (.*?) ([IVX]+)$', textMap["text"])
    if (('name' not in affixMap) and (affixTextSearch)):
        affixMap['name'] = affixTextSearch.group(2).strip()
        affixMap['type'] = affixTextSearch.group(1).strip()

        # assume that roman numeral in text means we search the tooltip for bonus value
        affixTooltipSearch = re.search(r'^.*?\+?([0-9]+)%?.*?$', textMap["tooltip"])
        if (affixTooltipSearch):
            affixMap['value'] = affixTooltipSearch.group(1).strip()

    # detect if text is in format (affix bonus value) (affix bonus type) (affix bonus name)
    # ex: +2% Artifact Bonus to Missile Deflection
    affixTextSearch = re.search(r'^(?!If (?:you also)? have)(?!Once).*?\+?([0-9]+)%? ' + bonusTypeString + r' (?:[Bb]onus )?(?:to )?(?:your )?(?:the )?(.*?)\.?$', textMap["text"])
    if (('name' not in affixMap) and (affixTextSearch)):
        affixMap['name'] = affixTextSearch.group(3).strip()
        affixMap['type'] = affixTextSearch.group(2).strip()
        affixMap['value'] = affixTextSearch.group(1).strip()

    # detect if text is in format (affix bonus name) (missing bonus type) (affix bonus value [integer format])
    # ex: Accuracy +2
    affixTextSearch = re.search(r'^(.*?) \+?([0-9]+)%?$', textMap["text"])
    if (('name' not in affixMap) and (affixTextSearch)):
        affixMap['name'] = affixTextSearch.group(1).strip()
        affixMap['value'] = affixTextSearch.group(2).strip()

    # detect if text is in format (bonus value) (additional) (ability charges)
    # ex: +1 additional Rage Charge after resting
    # ex: +2 additional Bard Song Charges after resting
    affixTextSearch = re.search(r'^\+?([0-9]+).*additional (.*?)s? after.*$', textMap["text"])
    if (('name' not in affixMap) and (affixTextSearch)):
        affixMap['name'] = affixTextSearch.group(2)
        affixMap['value'] = affixTextSearch.group(1)

    # detect if text is in format (affix bonus value) (missing bonus type) (affix bonus name)
    # ex: +20% Offhand Strike Chance
    affixTextSearch = re.search(r'^\+?([0-9]+)%? (?![Cc]hance(?: On)?)(?!.*[Dd]amage)(?!.*every)(.*?)$', textMap["text"])
    if (('name' not in affixMap) and (affixTextSearch)):
        affixMap['name'] = affixTextSearch.group(2).strip()
        affixMap['value'] = affixTextSearch.group(1).strip()

    # detect if text is in format (affix bonus name) (missing bonus type) (affix bonus value [roman numeral format])
    # ex: Power II
    affixTextSearch = re.search(r'^(.*?) ([IVX]+)$', textMap["text"])
    if (('name' not in affixMap) and (affixTextSearch)):
        affixMap['name'] = affixTextSearch.group(1).strip()

        if ('tooltip' in textMap):
            # assume that roman numeral in text means we search the tooltip for bonus value
            affixTooltipSearch = re.search(r'^.*?\+?([0-9]+)%?.*?$', textMap["tooltip"])
            if (affixTooltipSearch):
                affixMap['value'] = affixTooltipSearch.group(1).strip()

    # case exists where tooltip contains affix that will be caught, but does not reflect the true nature of the affix
    # catch those cases before processing tooltip
    # ex: Once every three seconds when you take ...
    affixTextSearch = re.search(r'^Once every.*$', textMap["text"])
    if (('name' not in affixMap) and (affixTextSearch)):
        affixMap['name'] = textMap["text"].strip()
        affixMap['type'] = "Untyped"
        affixMap['value'] = 1

    # begin unique affix detection
    if (('name' not in affixMap) and ('tooltip' in textMap)):
        # check for Set bonus
        affixTextSearch = re.search(r'^.*[0-9]+ Pieces Equipped.*$', textMap["tooltip"])
        if (affixTextSearch):
            affixMap['name'] = textMap["text"]

        # check for Efficient Metamagic
        affixTextSearch = re.search(r'^.*The additional spell point cost for using the (.*) Metamagic feat is reduced by ([0-9]+) SP(?:\.)$', textMap["tooltip"])
        if (affixTextSearch):
            affixMap['name'] = "Efficient Metamagic - " + affixTextSearch.group(1).strip()
            affixMap['value'] = affixTextSearch.group(2).strip()

        # check for Arcane Casting Dexterity
        affixTextSearch = re.search(r'^.*(Arcane Casting Dexterity).*?([0-9]+).*$', textMap["tooltip"])
        if (affixTextSearch):
            affixMap['name'] = affixTextSearch.group(1).strip()
            affixMap['value'] = affixTextSearch.group(2).strip()

        # check for Action Boost/Rage/Dragonmark/... Charges
        affixTextSearch = re.search(r'^.* increase the total number of (.*) you can use by ([0-9]+).*$', textMap["tooltip"])
        if (('name' not in affixMap) and (affixTextSearch)):
            affixMap['name'] = affixTextSearch.group(1)
            affixMap['value'] = affixTextSearch.group(2)

        # check if the tooltip indicates that this grants a feat
        affixTooltipSearch = re.search(r'^.*?grants you the (.*) feat.*$', textMap['tooltip'])
        if (affixTooltipSearch):
            # update the affix name to include "Feat:" qualifier
            affixMap['name'] = "Feat: " + affixTooltipSearch.group(1)

        # final pass where we try to calculate bonus name/type/value from tooltip
        affixTextSearch = re.search(r'^' + affixExceptionDetectionString + r'.*?\+?([0-9]+)%?.*?' + bonusTypeString + r'(?: [Bb]onus)?(?: to)?(?: your)?(.*?)\.?$', textMap["tooltip"])
        if (('name' not in affixMap) and (affixTextSearch)):
            affixMap['name'] = affixTextSearch.group(3).strip()
            affixMap['type'] = affixTextSearch.group(2).strip()
            affixMap['value'] = affixTextSearch.group(1).strip()

    if (('type' not in affixMap) and ('tooltip' in textMap)):
        affixTooltipSearch = re.search(r'^' + affixExceptionDetectionString + r'.*?' + bonusTypeString + r' (?:[Bb]onus|discount).*$', textMap["tooltip"])
        if (affixTooltipSearch):
            affixMap['type'] = affixTooltipSearch.group(1).strip()

    # unable to detect any affix name
    # populate affix name with the string from 'text' field as a final catch
    if ('name' not in affixMap):
        affixMap['name'] = textMap['text']

    # try to catch Ghostly, Heroic Inspiration, Blindness Immunity, etc
    if ('type' not in affixMap) and ('value' not in affixMap):
        affixMap['type'] = 'Bool'
        affixMap['value'] = 1

    if ('type' not in affixMap):
        affixMap['type'] = 'Untyped'

    if ('value' not in affixMap):
        affixMap['value'] = 1

    # capitalize the first letter of the bonus type for standardization
    affixMap['type'] = affixMap['type'][0].upper() + affixMap['type'][1:]

    if 'Insightful' == affixMap['type']:
        affixMap['type'] = 'Insight'

    # case exists for affix types that provide a percentage (%) bonus
    # add a (%) string to the affix name
    if ((affixMap['name'] in ['AC', 'Armor Class', 'Conditioning', 'Maximum Spell Points']) and ('%' in textMap['text'])):
        affixMap['name'] = affixMap['name'] + ' (%)'

    # special case exists for Natural Armor
    if (affixMap['name'] in ['Natural Armor']):
        affixMap['type'] = affixMap['type'] + ' Natural'

    # special case exists for Shield Armor Class
    if (affixMap['name'] in ['Shield Armor Class']):
        affixMap['type'] = affixMap['type'] + ' Shield'

    # convert affix name to standardize
    affixMap['name'] = convert_affix_name_to_common_affix_name(affixMap['name'])

    return(affixMap)


def get_affix_map_list_from_tag(tag):
    affixMapList = []

    # if tag passed in is a unordered list (ul) tag, process each list item (li) tag as a unique affix
    if (tag.name == 'ul'):
        for li_tag in tag.find_all('li', recursive=False):
            textMap = get_text_map_from_tag(li_tag)
            affixMap = convert_affix_text_map_to_affix_map(textMap)
            affixMapList.append(affixMap)

    return affixMapList


# function that loops through a map searching for set references
# if a set reference is found in an affix map
# the set property will be created and the affix associated with the set will be deleted
def replace_item_set_affixes(itemMap):
    sets = read_json('sets')

    for key, value in itemMap.items():
        for ikey, ivalue in value.items():
            for iikey, iivalue in enumerate(ivalue):
                for iiikey, iiivalue in enumerate(iivalue['affixes']):
                    if (iiivalue['name'] in sets):
                        del itemMap[key][ikey][iikey]['affixes'][iiikey]

                        if (not itemMap[key][ikey][iikey]['affixes']):
                            del itemMap[key][ikey][iikey]['affixes']

                        itemMap[key][ikey][iikey]['set'] = iiivalue['name']

    return itemMap
