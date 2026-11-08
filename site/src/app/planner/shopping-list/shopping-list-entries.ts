import { isCraftingSlotAvailable } from '../../gear/augment-slots';
import { classifyCraftSelection, craftSystemName } from '../../gear/crafting-acquisition';
import type { Craftable } from '../../gear/craftable';
import type { Item } from '../../gear/item';
import { sortSlotsForDisplay } from '../../gear/slot-display';
import type { FiligreeLoadout } from '../../gear/filigree';
import { countLoadoutFiligree, findFiligreeHosts } from '../filigree-loadout';
import type { ShoppingEntry, ShoppingEntryKind, ShoppingSource } from './shopping-list-types';

/**
 * Turns the equipped gear into the list of things to get.
 *
 * Entry keys are the progress keys, so they must stay stable across reloads and
 * builds. Each starts with its kind, then the slot; `|` never occurs in a slot name.
 *
 *   gear:    g|<slot>|<item>
 *   augment: a|<slot>|<crafting slot>#<n>|<selection>
 *   upgrade: u|<slot>|<item>|<crafting slot>#<n>|<selection>
 *   step:    s|<slot>|<item>|<crafting slot>#<n>|<selection>
 *   filigree: f|<weapon|artifact>|<filigree>|<r|n>#<k>
 *
 * `<n>` tells apart same-named crafting slots on one item (two Colorless slots);
 * `<selection>` is Craftable.getSelectedParamDescription(), the same string build
 * URLs carry. An augment's key leaves out the item: it is fetched on its own, so
 * swapping the item it goes in doesn't undo having it. Upgrades and steps are
 * crafted onto that item, so a different item starts them over. A filigree's key
 * leaves out the item too, as the filigree moves with the sentient jewel or is fed
 * into whichever artifact is worn. `r` marks the rare copy, and `<k>` counts copies of the
 * same filigree in that host, so removing one above it doesn't move its progress.
 */

/** What an entry's source says about it, from quests.json. */
export interface ShoppingSourceLookup {
  isRaid(quest: string): boolean;
  packOf(quest: string): string | null;
}

/** Essence-crafted blanks are made at the Cannith stations, not dropped anywhere. */
export const CANNITH_CRAFTING_SOURCE = 'Cannith Crafting';

const WIKI_SEARCH_URL = 'https://ddowiki.com/page/Special:Search?go=Go&search=';
const WIKI_ITEM_URL = 'https://ddowiki.com/page/Item:';

function wikiItemUrl(name: string): string {
  return WIKI_ITEM_URL + encodeURIComponent(name.replace(/ /g, '_'));
}

/**
 * Augments are items, with pages in the wiki's Item namespace, which its
 * search doesn't look in. Upgrades are mostly crafted effects with no page of
 * their own, so they get a search.
 */
function craftedWikiUrl(kind: ShoppingEntryKind, name: string): string {
  return kind === 'augment'
    ? wikiItemUrl(name)
    : WIKI_SEARCH_URL + encodeURIComponent(name);
}

/**
 * The wiki's Go search, which opens the page of that name when there is one.
 * Most sources are quests, NPCs or vendors with a page, but the pack map also
 * names placeholders with none ("Sharn quests", "Special event items"); those
 * land on search results rather than a missing page.
 */
function sourceWikiUrl(source: string): string {
  return WIKI_SEARCH_URL + encodeURIComponent(source);
}

/** Each source's pack comes from quests.json's pack map, which names every source the data emits. */
function sourcesFor(quests: readonly string[], lookup: ShoppingSourceLookup): ShoppingSource[] {
  return quests.map(quest => ({
    quest,
    pack: lookup.packOf(quest),
    raid: lookup.isRaid(quest),
    wikiUrl: sourceWikiUrl(quest),
  }));
}

export function shoppingGearKey(slot: string, itemName: string): string {
  return `g|${slot}|${itemName}`;
}

/** Where filigrees drop and their wiki page, for the filigree entries. */
export interface ShoppingFiligreeLookup {
  loadout: FiligreeLoadout;
  sourcesOf(name: string): ShoppingSource[];
  wikiUrlOf(name: string): string;
}

export function deriveShoppingEntries(
    slots: ReadonlyMap<string, Item | null>, sources: ShoppingSourceLookup, filigree?: ShoppingFiligreeLookup): ShoppingEntry[] {
  const entries: ShoppingEntry[] = [];
  const filigreeEntries = filigree ? filigreeEntriesByHostSlot(slots, filigree) : new Map<string, ShoppingEntry[]>();
  for (const slot of sortSlotsForDisplay(Array.from(slots.keys()))) {
    const item = slots.get(slot);
    if (item) {
      entries.push(...entriesForItem(slot, item, sources), ...(filigreeEntries.get(slot) ?? []));
    }
  }
  return entries;
}

/**
 * One entry per counted filigree - a duplicate is a filigree to get too - under the item that
 * holds it, keyed by that item's slot.
 */
function filigreeEntriesByHostSlot(
    slots: ReadonlyMap<string, Item | null>, filigree: ShoppingFiligreeLookup): Map<string, ShoppingEntry[]> {
  const hosts = findFiligreeHosts(slots);
  const bySlot = new Map<string, ShoppingEntry[]>();
  const copies = new Map<string, number>();
  for (const counted of countLoadoutFiligree(filigree.loadout, hosts)) {
    const host = hosts[counted.host];
    if (!host) {
      continue;
    }
    const { name, rare } = counted.choice;
    const copyKey = `f|${counted.host}|${name}|${rare ? 'r' : 'n'}`;
    const copy = copies.get(copyKey) ?? 0;
    copies.set(copyKey, copy + 1);
    const entry: ShoppingEntry = {
      key: `${copyKey}#${copy}`,
      kind: 'filigree',
      identity: `filigree|${name}|${rare ? 'rare' : 'normal'}`,
      label: rare ? `${name} (Rare)` : name,
      system: null,
      // Filigrees drop in level 20+ content.
      ml: 20,
      sources: filigree.sourcesOf(name),
      sourceInherited: false,
      rare,
      artifact: false,
      wikiUrl: filigree.wikiUrlOf(name),
      troveName: rare ? `${name} (Rare)` : name,
      parentKey: shoppingGearKey(host.slot, host.item.name),
      details: [],
    };
    bySlot.set(host.slot, [...(bySlot.get(host.slot) ?? []), entry]);
  }
  return bySlot;
}

function entriesForItem(slot: string, item: Item, sources: ShoppingSourceLookup): ShoppingEntry[] {
  const blank = item.isGeneratedEssenceCraftingBlank();
  const quests = item.quests?.length ? item.quests : blank ? [CANNITH_CRAFTING_SOURCE] : [];
  const itemSources = sourcesFor(quests, sources);
  const gearKey = shoppingGearKey(slot, item.name);
  const gear: ShoppingEntry = {
    key: gearKey,
    kind: 'gear',
    identity: `gear|${item.name}`,
    label: item.name,
    system: null,
    ml: item.ml,
    sources: itemSources,
    sourceInherited: false,
    rare: item.rare,
    artifact: item.artifact,
    wikiUrl: item.url ? item.getURL() : null,
    troveName: blank ? null : item.name,
    parentKey: null,
    details: [],
  };

  const crafted: ShoppingEntry[] = [];
  const seen = new Map<string, number>();
  for (const craftable of item.crafting ?? []) {
    const occurrence = seen.get(craftable.name) ?? 0;
    seen.set(craftable.name, occurrence + 1);
    if (!isCraftingSlotAvailable(item, craftable)) {
      continue;
    }

    const system = craftSystemName(craftable);
    const kind = classifyCraftSelection(system, craftable.selected);
    if (kind === 'none') {
      continue;
    }
    if (kind === 'roll') {
      gear.details.push(craftable.selected.describe());
      continue;
    }
    crafted.push(craftedEntry(kind, slot, item, gear, craftable, `${craftable.name}#${occurrence}`, system, sources));
  }
  return [gear, ...crafted];
}

function craftedEntry(kind: Exclude<ShoppingEntryKind, 'gear'>, slot: string, item: Item, gear: ShoppingEntry,
    craftable: Craftable, craftSlot: string, system: string, sources: ShoppingSourceLookup): ShoppingEntry {
  const option = craftable.selected;
  const selection = craftable.getSelectedParamDescription();
  // An augment that names no source still doesn't drop where the item does.
  const inherits = !option.quests.length && kind === 'step';
  const optionSources = inherits ? gear.sources : sourcesFor(option.quests, sources);
  const fetchedAlone = kind === 'augment' || kind === 'upgrade';

  return {
    key: kind === 'augment'
      ? `a|${slot}|${craftSlot}|${selection}`
      : `${kind === 'upgrade' ? 'u' : 's'}|${slot}|${item.name}|${craftSlot}|${selection}`,
    kind,
    identity: fetchedAlone && option.name
      ? `${kind}|${option.name}`
      : `${kind}|${system}|${selection}${kind === 'step' ? `|${item.name}` : ''}`,
    label: option.describe(),
    system,
    ml: option.ml,
    sources: optionSources,
    sourceInherited: inherits,
    rare: false,
    artifact: false,
    wikiUrl: fetchedAlone && option.name ? craftedWikiUrl(kind, option.name) : null,
    troveName: fetchedAlone && option.name ? option.name : null,
    parentKey: gear.key,
    details: [],
  };
}
