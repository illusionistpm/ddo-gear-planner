import type { UserItemLocation } from '../user-gear.service';

/**
 * - `gear`: an equipped item.
 * - `augment`: an augment slotted into it - fetched on its own.
 * - `upgrade`: a named, sourced piece crafted onto it (Dolorous, Fang, ...).
 * - `step`: crafting done to the item (Lost Purpose, Green Steel tiers, ...).
 */
export type ShoppingEntryKind = 'gear' | 'augment' | 'upgrade' | 'step';

/** One place a thing comes from. */
export interface ShoppingSource {
  quest: string;
  pack: string | null;
  raid: boolean;
  /** Its wiki page, or a wiki search for it where there may be no page by that name. */
  wikiUrl: string;
}

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
  /** Where it drops or is crafted, as the data lists them; empty when it doesn't say. */
  sources: readonly ShoppingSource[];
  /** True when the sources are the item's, because the option names none of its own. */
  sourceInherited: boolean;
  /** True when every source is a raid, as the planner's Raid badge has it. */
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
  /** In source view, the row's other sources, besides the one it's listed under. */
  alsoFrom: ShoppingSource[];
  children: ShoppingRow[];
}

/**
 * A card of the list. By slot it is one item: `header` is the item's row and
 * `rows` what goes into it. By source it is one quest, with everything from
 * there in `rows` and no header.
 */
export interface ShoppingGroup {
  id: string;
  label: string;
  header: ShoppingRow | null;
  /** The slot, when grouping by slot. */
  slot: string | null;
  /** By source, the quest's wiki page; null by slot, and for an unknown source. */
  wikiUrl: string | null;
  raid: boolean;
  /**
   * Which pack colour the card is marked with, by its pack: the quest's by
   * source, the item's by slot. Null when it has none.
   */
  accent: number | null;
  rows: ShoppingRow[];
  acquired: number;
  total: number;
}

/**
 * Cards under one heading: by source, a pack's quests. By slot there is one
 * section, without a heading.
 */
export interface ShoppingSection {
  id: string;
  label: string | null;
  /** The pack's colour, as its cards have; null for no pack. */
  accent: number | null;
  groups: ShoppingGroup[];
  /** Entries in the section, each counted once however many of its quests it's listed under. */
  acquired: number;
  total: number;
}

export interface ShoppingListView {
  sections: ShoppingSection[];
  acquired: number;
  total: number;
  groupMode: ShoppingGroupMode;
  filter: ShoppingFilter;
}
