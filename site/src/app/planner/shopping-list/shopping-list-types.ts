import type { UserItemLocation } from '../user-gear.service';

/**
 * - `gear`: an equipped item.
 * - `augment`: an augment slotted into it - fetched on its own.
 * - `upgrade`: a named, sourced piece crafted onto it (Dolorous, Fang, ...).
 * - `step`: crafting done to the item (Lost Purpose, Green Steel tiers, ...).
 */
export type ShoppingEntryKind = 'gear' | 'augment' | 'upgrade' | 'step';

/** One thing to get for one slot: the unit a checkbox ticks off. */
export interface ShoppingEntry {
  /** Stable progress key; see shopping-list-entries.ts for the scheme. */
  key: string;
  kind: ShoppingEntryKind;
  slot: string;
  /** What counts as "the same thing" across slots, for quantities. */
  identity: string;
  label: string;
  /** The crafting system a non-gear entry was chosen in, else null. */
  system: string | null;
  /** The item the entry is for (for gear, its own name). */
  itemName: string;
  ml: number;
  /** Where it drops or is crafted; null when the data doesn't say. */
  source: string | null;
  /** True when the source is the item's, because the option names none of its own. */
  sourceInherited: boolean;
  pack: string | null;
  raid: boolean;
  rare: boolean;
  artifact: boolean;
  wikiUrl: string | null;
  /** The name to look for in the trove import, or null when it can't be owned on its own. */
  troveName: string | null;
  /** The gear entry a crafting entry belongs to; null for gear. */
  parentKey: string | null;
  /** Random properties the item should roll with (gear only). */
  details: string[];
}

/** Explicit ticks: 1 = got it, 0 = not got it even though the trove has one. Absent = ask the trove. */
export type ShoppingProgressValue = 0 | 1;
export type ShoppingProgress = Readonly<Record<string, ShoppingProgressValue>>;
/** Changes to progress; null removes a key. */
export type ShoppingProgressPatch = Record<string, ShoppingProgressValue | null>;

export type ShoppingGroupMode = 'slot' | 'source';
export type ShoppingFilter = 'all' | 'needed';
export type ShoppingRowState = 'checked' | 'mixed' | 'unchecked';

/** What the shopping list needs from the trove import. */
export interface ShoppingTroveLookup {
  locationsFor(name: string): readonly UserItemLocation[] | undefined;
}

/** One line of the list: one or more entries for the same thing. */
export interface ShoppingRow {
  id: string;
  /** The first entry folded into the row; supplies what's displayed. */
  entry: ShoppingEntry;
  entryKeys: string[];
  /** Entries folded into this row. */
  quantity: number;
  /** Entries for the same thing anywhere in the build. */
  quantityInBuild: number;
  acquired: number;
  state: ShoppingRowState;
  /** Where the trove has it, or null when it doesn't. */
  ownedLocations: readonly UserItemLocation[] | null;
  /** In source view, crafting rows listed under their item rather than on their own. */
  context: string | null;
  children: ShoppingRow[];
}

export interface ShoppingGroup {
  id: string;
  label: string;
  sublabel: string | null;
  /** The slot, when grouping by slot (for its icon). */
  slot: string | null;
  raid: boolean;
  rows: ShoppingRow[];
  acquired: number;
  total: number;
}

export interface ShoppingListView {
  groups: ShoppingGroup[];
  acquired: number;
  total: number;
  groupMode: ShoppingGroupMode;
  filter: ShoppingFilter;
}
