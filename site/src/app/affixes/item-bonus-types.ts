import { ItemBonusKind } from '../gear/item-bonus';

/**
 * Bonus types only a player's copy of an item carries - Mythic Boosts, Reaper
 * bonuses and Curses (data/item-bonuses.json) - never game data's items, sets
 * or crafting. The planner offers one for an affix only once the player has
 * switched its system on (ItemBonusSettingsService), or while equipped gear
 * supplies it.
 */
export const ITEM_BONUS_TYPE_BY_KIND: Readonly<Record<ItemBonusKind, string>> = {
  mythic: 'Mythic',
  reaper: 'Reaper',
  curse: 'Fortune',
};

export const ITEM_BONUS_TYPES: ReadonlySet<string> = new Set(Object.values(ITEM_BONUS_TYPE_BY_KIND));

/** The two that stack; a Curse's Fortune takes the best value. */
export const STACKING_ITEM_BONUS_TYPES: ReadonlySet<string> = new Set(['Mythic', 'Reaper']);
