import { CraftableOption } from './craftable-option';

/**
 * Bonuses a player's copy of an item can carry on top of its fixed affixes
 * (data/item-bonuses.json): a Mythic Boost and a Reaper bonus rolled on the
 * drop, and a Curse from a Deck of Many Curses. At most one of each. Each is a
 * CraftableOption - a name and its affixes - so it is ranked, coloured and
 * picked with the same code as a crafting option.
 */
export const ITEM_BONUS_KINDS = ['mythic', 'reaper', 'curse'] as const;
export type ItemBonusKind = typeof ITEM_BONUS_KINDS[number];

/** The bonuses one item carries, by kind. A kind it lacks is absent. Options are shared and immutable. */
export type ItemBonuses = Partial<Record<ItemBonusKind, CraftableOption>>;

export function isItemBonusKind(value: string): value is ItemBonusKind {
  return (ITEM_BONUS_KINDS as readonly string[]).includes(value);
}
