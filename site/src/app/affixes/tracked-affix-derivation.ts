import { AffixService, UNIVERSAL_COMPANION_AFFIXES } from './affix.service';
import { AffixGroupDisplay, groupAffixNames, UTILITY_CHECKLIST_CATEGORY } from './affix-organization';
import { affixTypeKey } from './affix-type-key';
import { getCountAffixChipLabel } from './count-affix';
import type { GearDbService } from '../gear/gear-db.service';

/**
 * Pure rules for deriving the tracked-affix display from the covered-affix map.
 * Shared by the full Tracked Affixes table and the compact equipment-tab
 * summary so the two cannot drift apart. Kept free of Angular DI so
 * EquippedService can use the threshold without a circular import; the parts
 * that need live gear data live in TrackedAffixDerivationService.
 */

/**
 * One entry of EquippedService's covered-affix map: the best value equipped
 * gear supplies for one bonus type of a tracked affix. A checklist affix has
 * a single entry with the "Bool" pseudo-type.
 */
export interface CoveredBonusType {
  bonusType: string;
  value: number;
}

/**
 * A bonus type as displayed. For a universal companion row, `sourceAffixName`
 * is the universal affix (e.g. "Universal Spell Power") rather than the
 * tracked affix it is shown under.
 */
export interface TrackedBonusTypeDisplay extends CoveredBonusType {
  label: string;
  sourceAffixName: string;
  sourceBonusType: string;
}

/** Either shape; display-only fields fall back to the tracked affix and bonusType. */
export type TrackedBonusTypeRef = CoveredBonusType & Partial<TrackedBonusTypeDisplay>;

/** Just enough to locate where a bonus type comes from; no value needed. */
export type TrackedBonusTypeSource = Pick<TrackedBonusTypeDisplay, 'bonusType'> &
  Partial<Omit<TrackedBonusTypeDisplay, 'bonusType'>>;

export interface TrackedAffixGroupDisplay extends AffixGroupDisplay {
  checklistAffixes: string[];
}

export interface SplitCoveredAffixes {
  affixMap: Map<string, CoveredBonusType[]>;
  affixNames: string[];
  boolAffixMap: Map<string, CoveredBonusType[]>;
  boolAffixNames: string[];
}

const BONUS_TYPE_SORT_ORDER: Array<string | undefined> = [
  'Equipment', 'Enhancement', 'DUMMY', 'Insight', 'Quality', 'Exceptional', 'Artifact', undefined, 'Penalty'
];

/**
 * The "mostly covered" threshold: 3/4 of the best available value. At or past
 * it a bonus type stops being chased - the Scarcity view files it under
 * Mostly covered and gear suggestions stop weighting it - and its chip gets
 * the amber tint; below it, only amber text. The chip's numbers say how far
 * short it is: a ratio alone can't say whether a gap matters.
 */
export function moderateValueThreshold(maxValue: number): number {
  return maxValue * 3 / 4;
}

/** CSS class for a bonus type's value: the best available, mostly covered, short, none, or a penalty. */
export function classForBonusValue(bonusType: string, value: number, maxValue: number): string {
  if (bonusType === 'Penalty') {
    return 'penalty-value';
  }
  // Must come before the max check, or 0/0 would read as "best possible".
  if (!value) {
    return 'no-value';
  }
  if (value >= maxValue) {
    return 'max-value';
  }
  return value >= moderateValueThreshold(maxValue) ? 'covered-value' : 'short-value';
}

/** A checklist affix: its only covered "type" is the Bool pseudo-type. */
export function isBoolAffixTypes(types: CoveredBonusType[]): boolean {
  return types.length === 1 && types[0].bonusType === 'Bool';
}

/** Split the covered-affix map into regular and checklist affixes. */
export function splitCoveredAffixes(covered: Map<string, CoveredBonusType[]>): SplitCoveredAffixes {
  const split: SplitCoveredAffixes = {
    affixMap: new Map<string, CoveredBonusType[]>(),
    affixNames: [],
    boolAffixMap: new Map<string, CoveredBonusType[]>(),
    boolAffixNames: [],
  };
  for (const [affixName, types] of covered.entries()) {
    if (isBoolAffixTypes(types)) {
      split.boolAffixMap.set(affixName, types);
      split.boolAffixNames.push(affixName);
    } else {
      split.affixMap.set(affixName, types);
      split.affixNames.push(affixName);
    }
  }
  return split;
}

export function sortBonusTypes<T extends { bonusType: string; label?: string; sourceAffixName?: string }>(types: Array<T>): Array<T> {
  const indexOf = (bonusType: string) => {
    const index = BONUS_TYPE_SORT_ORDER.indexOf(bonusType);
    return index === -1 ? BONUS_TYPE_SORT_ORDER.indexOf('DUMMY') : index;
  };
  return types.sort((a, b) => {
    const diff = indexOf(a.bonusType) - indexOf(b.bonusType);
    if (diff !== 0) {
      return diff;
    }

    const affixDiff = (a.sourceAffixName || '').localeCompare(b.sourceAffixName || '');
    if (affixDiff !== 0) {
      return affixDiff;
    }

    return (a.label || a.bonusType).localeCompare(b.label || b.bonusType);
  });
}

/**
 * Group tracked affixes by category, folding the checklist affixes into the
 * utility group (created ahead of Immunities/Other if no utility affix is
 * tracked). `checklistAffixNames` is used in the order given.
 */
export function buildTrackedAffixGroups(
  affixNames: string[],
  checklistAffixNames: string[],
  affixSvc: AffixService
): TrackedAffixGroupDisplay[] {
  const groups: TrackedAffixGroupDisplay[] = groupAffixNames(affixNames, '', affixSvc).map(group => ({
    ...group,
    checklistAffixes: [] as string[]
  }));
  if (!checklistAffixNames.length) {
    return groups;
  }

  const utilityGroup = groups.find(group => group.name === UTILITY_CHECKLIST_CATEGORY);
  if (utilityGroup) {
    utilityGroup.checklistAffixes = checklistAffixNames;
    return groups;
  }

  const utilityIndex = groups.findIndex(group => group.name === 'Immunities' || group.name === 'Other');
  const insertIndex = utilityIndex >= 0 ? utilityIndex : groups.length;
  groups.splice(insertIndex, 0, {
    name: UTILITY_CHECKLIST_CATEGORY,
    affixes: [],
    checklistAffixes: checklistAffixNames
  });
  return groups;
}

/** What visibleTypesOf needs to know about the game data. */
export interface VisibleTypeRules {
  /** Every bonus type the affix has at any level. */
  allLevelTypes(affixName: string): string[];
  /** A bonus type that only reaches this per-element affix through a universal companion (GearDbService). */
  isUniversalCompanionOnly(affixName: string, bonusType: string): boolean;
  /** Whether a row with no value is still worth showing: gear could give it. */
  isAvailable(affixName: string, bonusType: string): boolean;
  isGroupMember(affixName: string, groupName: string): boolean;
}

/**
 * The rules over the game data. A row with no value shows only when `isAvailable` says gear could
 * give it: the planner's level range does; by default none does.
 */
export function visibleTypeRulesOf(
    gearDb: Pick<GearDbService, 'getAllLevelTypesForAffix' | 'isBonusTypeOnlyFromUniversalCompanion'>,
    affixSvc: Pick<AffixService, 'isGroupMember'>,
    isAvailable: VisibleTypeRules['isAvailable'] = () => false): VisibleTypeRules {
  return {
    allLevelTypes: affixName => gearDb.getAllLevelTypesForAffix(affixName),
    isUniversalCompanionOnly: (affixName, bonusType) => gearDb.isBonusTypeOnlyFromUniversalCompanion(affixName, bonusType),
    isAvailable,
    isGroupMember: (affixName, groupName) => affixSvc.isGroupMember(affixName, groupName),
  };
}

/** A bonus type as a row; a universal companion's rows read "Universal <type>". */
export function makeDisplayType(sourceAffixName: string, bonusType: string, value: number): TrackedBonusTypeDisplay {
  const label = getCountAffixChipLabel(sourceAffixName) ?? (bonusType ? bonusType : 'Untyped');
  return {
    bonusType,
    value,
    label: UNIVERSAL_COMPANION_AFFIXES.includes(sourceAffixName) ? 'Universal ' + label : label,
    sourceAffixName,
    sourceBonusType: bonusType,
  };
}

/** The universal companion affixes ("Universal Spell Power") an affix is a member of. */
export function universalCompanionsOf(affixName: string, rules: Pick<VisibleTypeRules, 'isGroupMember'>): string[] {
  return UNIVERSAL_COMPANION_AFFIXES.filter(groupName => rules.isGroupMember(affixName, groupName));
}

/**
 * The bonus types to show for one tracked affix: those it has (`covered`) or could get, plus a
 * "Universal <type>" row for each universal companion affix it belongs to, valued by
 * `currentValue`. Penalties are excluded, and so is a plain row for a type that only comes from
 * a universal companion, which its Universal row already shows.
 *
 * Its rows' values add up to the affix's total, as the Tracked Affixes table shows it.
 */
export function visibleTypesOf(covered: ReadonlyArray<CoveredBonusType>, affixName: string,
    currentValue: (affixName: string, bonusType: string) => number, rules: VisibleTypeRules): TrackedBonusTypeDisplay[] {
  const typeMap = new Map<string, TrackedBonusTypeDisplay>();

  for (const type of covered) {
    if (rules.isUniversalCompanionOnly(affixName, type.bonusType)) {
      continue;
    }
    if (type.bonusType !== 'Penalty' && (type.value || rules.isAvailable(affixName, type.bonusType))) {
      typeMap.set(affixTypeKey(affixName, type.bonusType), makeDisplayType(affixName, type.bonusType, type.value));
    }
  }

  for (const bonusType of rules.allLevelTypes(affixName)) {
    if (rules.isUniversalCompanionOnly(affixName, bonusType)) {
      continue;
    }
    const key = affixTypeKey(affixName, bonusType);
    if (bonusType !== 'Penalty' && !typeMap.has(key) && rules.isAvailable(affixName, bonusType)) {
      typeMap.set(key, makeDisplayType(affixName, bonusType, 0));
    }
  }

  for (const sourceAffixName of universalCompanionsOf(affixName, rules)) {
    for (const bonusType of rules.allLevelTypes(sourceAffixName)) {
      const value = currentValue(sourceAffixName, bonusType);
      const key = affixTypeKey(sourceAffixName, bonusType);
      if (bonusType !== 'Penalty' && !typeMap.has(key) && (value || rules.isAvailable(sourceAffixName, bonusType))) {
        typeMap.set(key, makeDisplayType(sourceAffixName, bonusType, value));
      }
    }
  }

  return sortBonusTypes(Array.from(typeMap.values()));
}
