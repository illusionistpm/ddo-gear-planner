import { AffixService } from './affix.service';
import { AffixGroupDisplay, groupAffixNames, UTILITY_CHECKLIST_CATEGORY } from './affix-organization';

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
 * The "moderate value" threshold: 3/4 of the best available value. At or past
 * it, a bonus type is considered adequately covered.
 */
export function moderateValueThreshold(maxValue: number): number {
  return maxValue * 3 / 4;
}

/** CSS quality class for a bonus type's current value against the best available. */
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
  if (value >= moderateValueThreshold(maxValue)) {
    return 'mid-value';
  }
  return 'low-value';
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
