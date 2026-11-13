/**
 * Bonus types only a player's copy of an item carries - Mythic Boosts, Reaper
 * bonuses and Curses (data/item-bonuses.json) - never game data's items, sets
 * or crafting. GearDbService doesn't list them for any affix, so the tracked
 * affixes show one only while equipped gear supplies it.
 */
export const ITEM_BONUS_TYPES: readonly string[] = ['Fortune', 'Mythic', 'Reaper'];
