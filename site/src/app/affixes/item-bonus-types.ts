/**
 * Bonus types only a player's copy of an item carries - Mythic Boosts, Reaper
 * bonuses and Curses (data/item-bonuses.json) - never game data's items, sets
 * or crafting.
 */
export const ITEM_BONUS_TYPES: readonly string[] = ['Fortune', 'Mythic', 'Reaper'];

/**
 * The two that stack. Any named item can carry them, so GearDbService offers each affix's best total
 * from them (ItemBonusService.getMaxima); Fortune, which doesn't stack, shows only while equipped gear
 * supplies it.
 */
export const STACKING_ITEM_BONUS_TYPES: ReadonlySet<string> = new Set(['Mythic', 'Reaper']);
