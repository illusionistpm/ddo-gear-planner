import { Affix } from '../affixes/affix';
import { RawItemBonusOption } from './game-data-types';

/**
 * Bonuses a player's copy of an item can carry on top of its fixed affixes
 * (data/item-bonuses.json): a Mythic Boost and a Reaper bonus rolled on the
 * drop, and a Curse from a Deck of Many Curses. At most one of each.
 */
export const ITEM_BONUS_KINDS = ['mythic', 'reaper', 'curse'] as const;
export type ItemBonusKind = typeof ITEM_BONUS_KINDS[number];

/** One choice of bonus. Immutable and shared by every item that carries it, like CraftableOption. */
export class ItemBonusOption {
  readonly name: string;
  readonly affixes: readonly Affix[];

  constructor(raw: RawItemBonusOption) {
    this.name = raw.name;
    this.affixes = raw.affixes.map(affix => new Affix(affix));
  }
}

/** The bonuses one item carries, by kind. A kind it lacks is absent. */
export type ItemBonuses = Partial<Record<ItemBonusKind, ItemBonusOption>>;

export function isItemBonusKind(value: string): value is ItemBonusKind {
  return (ITEM_BONUS_KINDS as readonly string[]).includes(value);
}
