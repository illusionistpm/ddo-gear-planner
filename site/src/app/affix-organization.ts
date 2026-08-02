import { Affix } from './affix';
import { AffixService } from './affix.service';

export interface AffixGroupDisplay {
  name: string;
  affixes: string[];
}

export const UTILITY_CHECKLIST_CATEGORY = 'Utility & Checklist';

const GROUP_ORDER = [
  UTILITY_CHECKLIST_CATEGORY,
  'Attributes',
  'Defense',
  'Offense',
  'Casting',
  'Saves',
  'Skills',
  'Immunities',
  'Other'
];

const ATTRIBUTE_AFFIXES = new Set([
  'Strength',
  'Dexterity',
  'Constitution',
  'Intelligence',
  'Wisdom',
  'Charisma'
]);

const SAVE_AFFIXES = new Set([
  'Fortitude Save',
  'Reflex Save',
  'Will Save'
]);

const SKILL_AFFIXES = new Set([
  'Balance',
  'Bluff',
  'Concentration',
  'Diplomacy',
  'Disable Device',
  'Haggle',
  'Heal',
  'Hide',
  'Intimidate',
  'Jump',
  'Listen',
  'Move Silently',
  'Open Lock',
  'Open Locks',
  'Perform',
  'Repair',
  'Search',
  'Spellcraft',
  'Spot',
  'Swim',
  'Tumble',
  'Use Magic Device'
]);

const OFFENSE_AFFIXES = new Set([
  'Enhancement Bonus (Weapon)',
  'Destruction',
  'Improved Destruction',
  'Maiming',
  'Shield Bashing',
  'Holy',
  'Adamantine',
  'Silver',
  'Keen',
  'Chilling'
]);

const DEFENSE_AFFIXES = new Set([
  'Enhancement Bonus (Armor)',
  'Healing Amplification',
  'Negative Amplification',
  'Repair Amplification'
]);

const UTILITY_CHECKLIST_AFFIXES = new Set([
  'Magical Efficiency',
  'Returning'
]);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  return normalize(value).split(/\s+/).filter(token => token.length > 0);
}

function textMatches(query: string, candidates: string[]): boolean {
  const queryTokens = tokenize(query);
  if (!queryTokens.length) {
    return true;
  }

  const candidateTokens = candidates.flatMap(candidate => tokenize(candidate));
  if (!candidateTokens.length) {
    return false;
  }

  return queryTokens.every(queryToken =>
    candidateTokens.some(candidateToken => candidateToken.includes(queryToken))
  );
}

function getContainingAffixGroupNames(affixName: string, affixSvc: AffixService): string[] {
  const containingGroups: string[] = [];
  for (const [groupName, affixes] of affixSvc.affixGroups.entries()) {
    if (affixes.includes(affixName)) {
      containingGroups.push(groupName);
    }
  }
  return containingGroups;
}

export function getAffixSearchTerms(affixName: string, affixSvc: AffixService): string[] {
  const terms = new Set<string>([affixName]);
  const canonicalName = affixSvc.getCanonicalName(affixName);
  terms.add(canonicalName);

  for (const synonym of affixSvc.getSynonyms(canonicalName)) {
    terms.add(synonym);
  }

  for (const groupName of getContainingAffixGroupNames(canonicalName, affixSvc)) {
    terms.add(groupName);
    for (const synonym of affixSvc.getSynonyms(groupName)) {
      terms.add(synonym);
    }
    for (const groupedAffix of affixSvc.ungroupAffix(new Affix({ name: groupName, type: 'Bool', value: 1 }))) {
      terms.add(groupedAffix.name);
      for (const synonym of affixSvc.getSynonyms(groupedAffix.name)) {
        terms.add(synonym);
      }
    }
  }

  if (affixSvc.affixGroups.has(canonicalName)) {
    for (const groupedAffix of affixSvc.ungroupAffix(new Affix({ name: canonicalName, type: 'Bool', value: 1 }))) {
      terms.add(groupedAffix.name);
      for (const synonym of affixSvc.getSynonyms(groupedAffix.name)) {
        terms.add(synonym);
      }
    }
  }

  return Array.from(terms);
}

export function matchesAffixSearch(affixName: string, query: string, affixSvc: AffixService): boolean {
  return textMatches(query, getAffixSearchTerms(affixName, affixSvc));
}

function getDirectAffixCategory(affixName: string): string {
  if (ATTRIBUTE_AFFIXES.has(affixName)) {
    return 'Attributes';
  }
  if (SAVE_AFFIXES.has(affixName)) {
    return 'Saves';
  }
  if (SKILL_AFFIXES.has(affixName) || affixName.endsWith(' Skills')) {
    return 'Skills';
  }
  if (/\b(Immunity|Deathblock)\b/.test(affixName)) {
    return 'Immunities';
  }
  if (/\b(Spell Power|Lore|Focus|Spell Penetration|Wizardry|Intensity)\b/.test(affixName)) {
    return 'Casting';
  }
  if (OFFENSE_AFFIXES.has(affixName) || /\b(Deadly|Accuracy|Armor-Piercing|Doublestrike|Doubleshot|Melee Power|Ranged Power|Alacrity|Assassinate|Stunning|Sundering|Vertigo|Seeker|Deception)\b/.test(affixName)) {
    return 'Offense';
  }
  if (DEFENSE_AFFIXES.has(affixName) || /\b(Sheltering|Armor Class|Fortification|Resistance|Absorption|False Life|Dodge|Parrying|Ghostly|Blurry|Protection|Guard|Diversion)\b/.test(affixName)) {
    return 'Defense';
  }
  if (UTILITY_CHECKLIST_AFFIXES.has(affixName) || /\b(Speed|Feather Falling|Freedom of Movement|Action Boost|Run Speed)\b/.test(affixName)) {
    return UTILITY_CHECKLIST_CATEGORY;
  }
  return 'Other';
}

export function getAffixCategory(affixName: string, affixSvc?: AffixService): string {
  const directCategory = getDirectAffixCategory(affixName);
  if (directCategory !== 'Other' || !affixSvc?.affixGroups.has(affixName)) {
    return directCategory;
  }

  const childCategories = new Set(
    affixSvc
      .ungroupAffix(new Affix({ name: affixName, type: 'Bool', value: 1 }))
      .map(childAffix => getDirectAffixCategory(childAffix.name))
      .filter(category => category !== 'Other')
  );

  return childCategories.size === 1 ? Array.from(childCategories)[0] : 'Other';
}

export function groupAffixNames(
  affixNames: Iterable<string>,
  query: string,
  affixSvc: AffixService,
  getCategoryOverride?: (affixName: string) => string | null
): AffixGroupDisplay[] {
  const groups = new Map<string, string[]>();
  for (const groupName of GROUP_ORDER) {
    groups.set(groupName, []);
  }

  for (const affixName of affixNames) {
    if (!matchesAffixSearch(affixName, query, affixSvc)) {
      continue;
    }
    const category = getCategoryOverride?.(affixName) || getAffixCategory(affixName, affixSvc);
    const affixes = groups.get(category) || [];
    affixes.push(affixName);
    groups.set(category, affixes);
  }

  return GROUP_ORDER
    .map(groupName => ({
      name: groupName,
      affixes: (groups.get(groupName) || []).sort((left, right) => left.localeCompare(right))
    }))
    .filter(group => group.affixes.length > 0);
}
