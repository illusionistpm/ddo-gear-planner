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

/**
 * The Masterworks curses, by how many levels higher they power "some effects" on the item. The wiki doesn't
 * say which effects, so the planner can't apply them; it marks the item's values that might be higher.
 */
const MASTERWORKS_LEVELS: Readonly<Record<string, number>> = {
  'Curse of Minor Masterworks': 1,
  'Curse of Major Masterworks': 2,
};

/** How many levels a Masterworks curse raises its item's effects by; 0 for any other bonus, or none. */
export function masterworksLevels(curse: CraftableOption | undefined): number {
  return (curse && MASTERWORKS_LEVELS[curse.name]) || 0;
}

/** "one level" / "2 levels": how much higher a Masterworks curse treats its item. */
export function masterworksHigher(levels: number): string {
  return levels === 1 ? 'one level' : `${levels} levels`;
}

/** The picker's note beside a Masterworks curse, or '' for any other option. */
export function masterworksNote(option: CraftableOption | undefined): string {
  const levels = masterworksLevels(option);
  return levels ? `Boosts some values (+${levels} ML)` : '';
}

/** What a Masterworks curse does and why the planner doesn't apply it, or '' for any other option. */
export function masterworksDescription(option: CraftableOption | undefined): string {
  const levels = masterworksLevels(option);
  if (!option || !levels) {
    return '';
  }
  return `${option.name} powers some of the item's effects as if it were ${masterworksHigher(levels)} higher.`
    + ` The wiki doesn't say which, so the planner doesn't apply it; the item's values it might boost are marked.`;
}
