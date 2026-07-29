from bs4 import BeautifulSoup
from pathlib import Path
import re

GREEN_STEEL_TIER_QUESTS = {
    1: 'Legendary Altar of Invasion',
    2: 'Legendary Altar of Subjugation',
    3: 'Legendary Altar of Devastation',
}


def get_green_steel_recipe_table(soup):
    for table in soup.find_all('table'):
        if table.find('th', string='Equipment Augment'):
            return table
    raise ValueError('Unable to find Legendary Green Steel recipe table')


def get_green_steel_focus_name(focus_text):
    focus_name = focus_text.replace('Legendary Superior Focus of ', '')
    focus_name = focus_name.replace('Legendary Inferior Focus of ', '')
    focus_name = focus_name.replace('Legendary Focus of ', '')
    focus_name = focus_name.replace(' Energy', '')
    return focus_name.strip()


def get_green_steel_gem_name(gem_text):
    gem_match = re.search(r'Gem of ([A-Za-z]+)', gem_text)
    return gem_match.group(1) if gem_match else None


def get_green_steel_essence_name(essence_text):
    if 'Ethereal' in essence_text:
        return 'Ethereal'
    if 'Material' in essence_text:
        return 'Material'
    return None


def get_green_steel_affix_type_prefix(affix_text):
    type_prefixes = {
        'Competence': 'Competence',
        'Enhancement': 'Enhancement',
        'Exceptional': 'Exceptional',
        'Insightful': 'Insight',
        'Insight': 'Insight',
        'Profane': 'Profane',
        'Quality': 'Quality',
        'Resistance': 'Resistance',
    }

    for prefix, affix_type in type_prefixes.items():
        if affix_text.startswith(prefix + ' '):
            return affix_type, affix_text[len(prefix) + 1:]
    return None, affix_text


def normalize_green_steel_affix_name(name):
    name = name.strip()
    if name == 'Lifeforce':
        return 'False Life'
    if name == 'Undying':
        return 'Unconsciousness Range'
    if name == 'Proof Against Disease':
        return 'Fortitude Save Vs Disease'
    if name == 'Electrical Resistance':
        return 'Electric Resistance'
    if name.endswith(' Saves'):
        return name[:-1]
    return name


def parse_green_steel_equipment_affix_part(affix_text, default_type=None):
    affix_text = affix_text.strip()
    affix_type, affix_text = get_green_steel_affix_type_prefix(affix_text)
    explicit_type = affix_type
    affix_type = affix_type or default_type

    healing_match = re.search(r'([0-9]+) healing every 10 seconds', affix_text)
    if healing_match:
        return {
            'name': 'Regeneration',
            'type': affix_type or 'Untyped',
            'value': healing_match.group(1),
        }, explicit_type

    value_match = re.match(r'(.+?) \+([0-9]+)%?$', affix_text)
    if value_match:
        name = normalize_green_steel_affix_name(value_match.group(1))
        if affix_type is None:
            if name.endswith(' Resistance'):
                affix_type = 'Enhancement'
            elif name.endswith(' Save'):
                affix_type = 'Resistance'
            else:
                affix_type = 'Untyped'
        return {
            'name': name,
            'type': affix_type,
            'value': value_match.group(2),
        }, explicit_type

    return {
        'name': normalize_green_steel_affix_name(affix_text),
        'type': affix_type or 'Bool',
        'value': 1,
    }, explicit_type


def parse_green_steel_equipment_affixes(equipment_text):
    affixes = []
    current_type = None
    for affix_text in equipment_text.split(','):
        if not affix_text.strip():
            continue
        affix, explicit_type = parse_green_steel_equipment_affix_part(affix_text, default_type=current_type)
        if explicit_type:
            current_type = explicit_type
        affixes.append(affix)
    return sorted(
        affixes,
        key=lambda affix: 1 if affix.get('name') in ['False Life', 'Wizardry'] else 0,
    )


def parse_legendary_green_steel_tier_options_from_soup(soup, tier):
    options = []
    current_gem = None
    current_essence = None
    table = get_green_steel_recipe_table(soup)

    for row in table.find_all('tr')[1:]:
        row_texts = [cell.get_text(' ', strip=True) for cell in row.find_all(['td', 'th'])]
        if len(row_texts) < 3 or not row_texts[0]:
            continue

        focus = get_green_steel_focus_name(row_texts[0])
        equipment_text_index = 1

        for index, text in enumerate(row_texts[1:], start=1):
            gem = get_green_steel_gem_name(text)
            essence = get_green_steel_essence_name(text)
            if gem:
                current_gem = gem
                equipment_text_index = index + 1
            elif essence:
                current_essence = essence
                equipment_text_index = index + 1
            else:
                break

        if current_gem != 'Escalation' and not (current_gem == 'Opposition' and current_essence == 'Material'):
            continue
        if equipment_text_index >= len(row_texts):
            continue

        equipment_text = row_texts[equipment_text_index]
        if not equipment_text:
            continue

        options.append({
            'name': f'Green Steel Augment (Equipment, Tier {tier}, {focus} {current_gem} {current_essence})',
            'ml': 26,
            'affixes': parse_green_steel_equipment_affixes(equipment_text),
            'quests': [GREEN_STEEL_TIER_QUESTS[tier]],
        })

    return options


def parse_legendary_green_steel_tier_options():
    options = {}
    for tier in [1, 2, 3]:
        page = Path(f'./cache/crafting/Legendary_Green_Steel_items_Tier_{tier}.html').read_text(encoding='utf-8')
        soup = BeautifulSoup(page, 'html.parser')
        options[f'T{tier} (Equipment)'] = {
            '*': parse_legendary_green_steel_tier_options_from_soup(soup, tier),
        }
    return options


def add_legendary_green_steel_tier_options(item_augments, tier_options=None):
    tier_options = tier_options or parse_legendary_green_steel_tier_options()
    for system_name, system_options in tier_options.items():
        system = item_augments.setdefault(system_name, {}).setdefault('*', [])
        existing_names = {option.get('name') for option in system}

        for option in system_options.get('*', []):
            if option.get('name') in existing_names:
                continue
            system.append(option)


def postprocess_legendary_green_steel_augments(item_augments, tier_options=None):
    add_legendary_green_steel_tier_options(item_augments, tier_options=tier_options)

    for system_name, system_map in item_augments.items():
        if not (system_name.startswith('T1 ') or system_name.startswith('T2 ') or system_name.startswith('T3 ')):
            continue

        for options in system_map.values():
            if not isinstance(options, list):
                continue

            for option in options:
                if option.get('name', '').startswith('Green Steel Augment '):
                    del option['name']
                option.pop('ml', None)

            deduped_options = []
            seen_options = set()
            for option in options:
                option_key = (
                    tuple(
                        (affix.get('name'), affix.get('type'), str(affix.get('value')))
                        for affix in option.get('affixes', [])
                    ),
                    tuple(option.get('quests', [])),
                )
                if option_key in seen_options:
                    continue
                seen_options.add(option_key)
                deduped_options.append(option)
            options[:] = deduped_options
