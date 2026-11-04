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
  /** What counts as "the same thing" across slots, for quantities. */
  identity: string;
  label: string;
  /** The crafting system a non-gear entry was chosen in, else null. */
  system: string | null;
  ml: number;
  /** Where it drops or is crafted, as the data lists them; empty when it doesn't say. */
  sources: readonly ShoppingSource[];
  /** True when the sources are the item's, because the option names none of its own. */
  sourceInherited: boolean;
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

/** The quests the user chose to get a thing from, by the thing's identity. */
export type ShoppingSourcePicks = Readonly<Record<string, readonly string[]>>;

/**
 * The order the user arranged the route in: packs by name ('' for quests in
 * no pack), and quests by name, each pack's in the order they come here.
 * Anything not listed goes where it would by default, after what it would
 * follow (see arrangeInOrder). Empty lists: the default order.
 */
export interface ShoppingRouteOrder {
  packs: readonly string[];
  quests: readonly string[];
}

/**
 * What a friend's link to the build shows: the keys of the entries still
 * needed, and for each thing still needed the quests the owner's list sends
 * them to - in the shape of picks, so a friend's list routes it the same way.
 */
export interface ShoppingPublished {
  needed: readonly string[];
  route: ShoppingSourcePicks;
}

/** What friends see of a saved build's list, as the server stores it. */
export interface SharedShoppingList {
  /** Still-needed entry keys; null when the owner has never shared a list. */
  needed: readonly string[] | null;
  /** For each still-needed thing, the quests the owner's list sends them to. */
  route: ShoppingSourcePicks;
  /** The order the owner arranged the route in; null for the default. */
  order: ShoppingRouteOrder | null;
}

/**
 * What friends will see once a build is saved, sent with the save so
 * their pages switch to the new gear and its list together.
 */
export interface ShoppingSaveProgress extends ShoppingPublished {
  order: ShoppingRouteOrder | null;
}

export type ShoppingFilter = 'all' | 'needed';
export type ShoppingRowState = 'checked' | 'mixed' | 'unchecked';

/** What the shopping list needs from the trove import. */
export interface ShoppingTroveLookup {
  locationsFor(name: string): readonly UserItemLocation[] | undefined;
}

/** One of the places a thing comes from, to pick where to get it. */
export interface ShoppingSourceChoice {
  source: ShoppingSource;
  /** The list sends you there for it. */
  chosen: boolean;
  /** In a pack the planner's pack filter hides. */
  hidden: boolean;
  /** How many other things the list sends you there for. */
  alsoThere: number;
}

/** One line of the list: one or more entries for the same thing. */
export interface ShoppingRow {
  id: string;
  /** The first entry folded into the row; supplies what's displayed. */
  entry: ShoppingEntry;
  entryKeys: string[];
  /** Entries folded into this row. */
  quantity: number;
  acquired: number;
  state: ShoppingRowState;
  /** Where the trove has it, or null when it doesn't. */
  ownedLocations: readonly UserItemLocation[] | null;
  /** The row's other sources, besides the quest it's listed under. */
  alsoFrom: ShoppingSource[];
  /** Every place the thing comes from, in heading order, when there's more than one; else empty. */
  choices: ShoppingSourceChoice[];
  /** True when the user picked where to get it, rather than the list. */
  picked: boolean;
  children: ShoppingRow[];
}

/** A card of the list: one quest, with everything to get there. */
export interface ShoppingGroup {
  id: string;
  label: string;
  /** The quest's wiki page; null for an unknown source. */
  wikiUrl: string | null;
  raid: boolean;
  /** Which pack colour the card is marked with, by the quest's pack; null when it has none. */
  accent: number | null;
  rows: ShoppingRow[];
  acquired: number;
  total: number;
}

/** Cards under one heading: a pack's quests. */
export interface ShoppingSection {
  id: string;
  /** The pack's name; '' for quests in no pack. */
  pack: string;
  label: string;
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
  filter: ShoppingFilter;
  /** True when the user picked where to get something in the list, whatever the filter shows. */
  picked: boolean;
  /**
   * True when planning the route again, around what's still needed now and
   * with no picks, would list something still needed somewhere else.
   */
  replannable: boolean;
  /** Each pack's colour, to hand to the next view so packs keep theirs. */
  packAccents: ReadonlyMap<string, number>;
  /** True when the user arranged the route, rather than it being in its default order. */
  arranged: boolean;
}
