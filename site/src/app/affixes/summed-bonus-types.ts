import { FILIGREE_BONUS_TYPE, FILIGREE_SET_BONUS_TYPE } from '../gear/filigree';
import { STACKING_ITEM_BONUS_TYPES } from './item-bonus-types';

/**
 * Bonus types whose values add up across sources, where every other type takes only the best: a
 * filigree's own bonuses and filigree set bonuses (gear/filigree.ts), and all Mythic and all Reaper
 * bonuses (affixes/item-bonus-types.ts). Curses' Fortune bonuses don't stack.
 */
const SUMMED_BONUS_TYPES: ReadonlySet<string> = new Set([FILIGREE_BONUS_TYPE, FILIGREE_SET_BONUS_TYPE, ...STACKING_ITEM_BONUS_TYPES]);

export function isSummedBonusType(bonusType: string): boolean {
  return SUMMED_BONUS_TYPES.has(bonusType);
}

/** What several values of one bonus type are worth together: their sum if the type adds up, else the best of them. */
export function combineBonusTypeValues(bonusType: string, values: readonly number[]): number {
  if (!values.length) {
    return 0;
  }
  return isSummedBonusType(bonusType)
    ? values.reduce((total, value) => total + value, 0)
    : Math.max(...values);
}
