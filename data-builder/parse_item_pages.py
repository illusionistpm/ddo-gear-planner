from bs4 import BeautifulSoup
import requests
import os
import re
import json
import collections
from roman_numerals import int_from_roman_numeral
from write_json import write_json

def include_page(fileName):
    return not fileName.startswith('Collars')


def add_cat_to_map(catMap, slot, array):
    for category in array:
        catMap[category] = slot


def build_cat_map():
    catMap = collections.defaultdict(lambda: 'Weapon')

    add_cat_to_map(catMap, 'Armor', ['Cloth armor', 'Heavy armor', 'Medium armor', 'Light armor', 'Cloth armor', 'Docents'])
    add_cat_to_map(catMap, 'Offhand', ['Bucklers', 'Small shields', 'Large shields', 'Tower shields', 'Orbs', 'Rune Arms'])
    add_cat_to_map(catMap, 'Helm', ['Head items'])
    add_cat_to_map(catMap, 'Goggles', ['Eye items'])
    add_cat_to_map(catMap, 'Cloak', ['Back items'])
    add_cat_to_map(catMap, 'Belt', ['Waist items'])
    add_cat_to_map(catMap, 'Boots', ['Feet items'])
    add_cat_to_map(catMap, 'Bracers', ['Wrist items'])
    add_cat_to_map(catMap, 'Gloves', ['Hand items'])
    add_cat_to_map(catMap, 'Necklace', ['Neck items'])
    add_cat_to_map(catMap, 'Ring', ['Finger items'])
    add_cat_to_map(catMap, 'Trinket', ['Trinket items'])
    add_cat_to_map(catMap, 'Collar', ['Collars'])

    return catMap

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
    for type in ['Insightful', 'Exceptional', 'Enhanced', 'Quality', 'Profane', 'Competence', 'Equipment', 'Equipped', 'Inherent']:
        if name.startswith(type):
            name = name[len(type)+1:]

    return name


def strip_charges(name):
    name = re.sub(r'(-? \d+ Charges)?( *\(Recharged/[Dd]ay: *?(\d+|None)\))?', '', name)
    return name
    

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
    for match in ["One of the following", "Random effect, for example", "Contains a Random pair from the following"]:
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
        ]:
        if name == pair[0]:
            return pair[1]
    return name


def strip_trailing_colon(name):
    if len(name) > 0 and name[-1] == ':':
        return name[:-1]
    return name


def strip_leading_asterisk(name):
    if len(name) > 0 and name[0] == '*':
        return name[1:]
    return name


def get_items_from_page(itemPageURL, sets):
    print("Parsing " + itemPageURL)
    page = open(itemPageURL, "r", encoding='utf-8').read()

    soup = BeautifulSoup(page, 'html.parser')

    title = soup.find(id='firstHeading').getText()
    category = title.split(':')[-1]

    cols = {}

    items = []

    table = soup.find(id='bodyContent').find(id='mw-content-text').find('div').find('table', class_="wikitable").find('tbody')
    for idx, col in enumerate(table.find_all('th')):
        cols[col.getText().strip()] = idx

    rows = table.find_all('tr', recursive=False)

    for q in ['Location', 'Quest', 'Quests']:
        if q in cols:
            questIdx = cols[q]

    # For some reason, the header is showing up as a row
    rows.pop(0)

    catMap = build_cat_map()

    craftingSystems = set(['Nearly Finished', 'Almost There', 'Blue Augment Slot', 'Red Augment Slot', 'Yellow Augment Slot', 
        'Green Augment Slot', 'Purple Augment Slot', 'Orange Augment Slot', 'Colorless Augment Slot', 'Incredible Potential',
        'Upgradeable - Tier', 'Upgradeable Item', "Slaver's Prefix Slot", "Legendary Slaver's Prefix Slot", "Slaver's Suffix Slot",
        "Legendary Slaver's Suffix Slot", "Slaver's Extra Slot", "Legendary Slaver's Extra Slot", "Slaver's Bonus Slot",
        "Legendary Slaver's Bonus Slot", "Slaver's Set Bonus", "Legendary Slaver's Set Bonus"])
    fakeBonuses = set(['dodge', 'attack', 'combat', 'strength', 'dex', 'skills', 'ability'])

    for row in rows:
        item = {}
        item['type'] = category
        item['slot'] = catMap[category]

        fields = row.find_all('td', recursive=False)

        itemLink = fields[cols['Item']].find('a')

        item['name'] = itemLink.getText().strip()
        item['url'] = itemLink['href'].strip()
        item['ml'] = fields[cols['ML']].getText().strip()
        item['affixes'] = []

        if 'Drops on leaving adventure' in fields[cols['Bind']].getText():
            continue

        # Uncomment and edit to stop at a particular item
        # if item['name'] == "Diabolist's Robe":
        #     a = 1

        if item['ml'] == 'None':
            item['ml'] = 1

        questsCell = fields[questIdx]
        questsTooltipSpan = questsCell.find('a')
        questsTooltip = questsTooltipSpan.get('title') if questsTooltipSpan else None
        if questsTooltip:
            quests = str(questsTooltip)
            item['quests'] = [quests]

        affixesIdx = cols['Enchantments'] if 'Enchantments' in cols else cols['Special Abilities']
        cell = fields[affixesIdx]

        if cell.find('ul'):
            affixes = cell.find('ul').find_all('li', recursive=False)
            for affix in affixes:
                aff = {}

                tooltipSpan = affix.find('span', {'class': 'tooltip'})
                tooltip = tooltipSpan.extract() if tooltipSpan else None

                # Ignore child lists, which are typically lists of possible attributes,
                # such as for https://ddowiki.com/page/Item:The_Admiral_of_Bling
                for child in affix.findChildren('li'):
                    child.decompose()

                affixName = affix.getText()

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
                    aff['name'] = affixName.strip()

                aff['name'] = strip_trailing_colon(aff['name'])
                aff['name'] = sub_name(aff['name'])


                if aff['name'] in sets:
                    item['set'] = aff['name']
                    continue

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
                    bonusTypeSearch = re.findall('([a-z]+) bonus', words, re.IGNORECASE)
                    bonusTypeSearch = list(set([value for value in bonusTypeSearch if not value.lower() in fakeBonuses and value[0].isupper()]))
                    bonusTypeSearch.sort()

                    if bonusTypeSearch:
                        aff['type'] = bonusTypeSearch[0].strip()
                        if aff['type'] == 'Insightful':
                            aff['type'] = 'Insight'

                # Old fortification (heavy/moderate/light) items don't have a type listed, but it's always enhancement
                if aff['name'] == 'Fortification' and aff['value'] in ['25', '75', '100'] and 'type' not in aff:
                    aff['type'] = 'Enhancement'

                if aff['name'] == 'Slaver\'s Set Bonus' and item['ml'] == '28':
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

                item['affixes'].append(aff)
        else:
            item['affixes'].append({'name': cell.getText()})

        remove = []
        for affix in item['affixes']:
            if affix['name'] in craftingSystems:
                if 'crafting' not in item.keys():
                    item['crafting'] = []
                item['crafting'].append(affix['name'])
                remove.append(affix)

        for affix in remove:
            item['affixes'].remove(affix)

        items.append(item)

    return items


def parse_item_pages():
    with open("../site/src/assets/sets.json", 'r', encoding='utf8') as file:
        sets = json.load(file)
        
    cachePath = "./cache/items/"
    items = []
    for file in os.listdir(cachePath):
        if include_page(file):
            items.extend(get_items_from_page(cachePath + file, sets))

    write_json(items, 'items')


if __name__ == "__main__":
    parse_item_pages()