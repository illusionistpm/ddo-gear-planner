/**
 * Bonus types only a player's copy of an item carries - Mythic Boosts, Reaper
 * bonuses and Curses (data/item-bonuses.json) - never game data's items, sets
 * or crafting. GearDbService doesn't list them for any affix, so the tracked
 * affixes show one only while equipped gear supplies it.
 */
export const ITEM_BONUS_TYPES: readonly string[] = ['Fortune', 'Mythic', 'Reaper'];

/** Bonus types where every source counts, not just the best: all Mythic and all Reaper bonuses stack. */
const STACKING_BONUS_TYPES: ReadonlySet<string> = new Set(['Mythic', 'Reaper']);

export function isStackingBonusType(bonusType: string): boolean {
  return STACKING_BONUS_TYPES.has(bonusType);
}

/** What several values of one bonus type are worth together: their sum if the type stacks, else the best of them. */
export function combineBonusTypeValues(bonusType: string, values: readonly number[]): number {
  if (!values.length) {
    return 0;
  }
  return isStackingBonusType(bonusType)
    ? values.reduce((total, value) => total + value, 0)
    : Math.max(...values);
}
