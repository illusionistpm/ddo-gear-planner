import { isCraftingSlotAvailable } from '../../gear/augment-slots';
import { classifyCraftSelection, craftSystemName } from '../../gear/crafting-acquisition';
import type { Craftable } from '../../gear/craftable';
import type { Item } from '../../gear/item';
import { sortSlotsForDisplay } from '../../gear/slot-display';
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
 *
 * `<n>` tells apart same-named crafting slots on one item (two Colorless slots);
 * `<selection>` is Craftable.getSelectedParamDescription(), the same string build
 * URLs carry. An augment's key leaves out the item: it is fetched on its own, so
 * swapping the item it goes in doesn't undo having it. Upgrades and steps are
 * crafted onto that item, so a different item starts them over.
 */

/** What an entry's source says about it, from quests.json. */
export interface ShoppingSourceLookup {
  isRaid(quest: string): boolean;
  packOf(quest: string): string | null;
}

/** Essence-crafted blanks are made at the Cannith stations, not dropped anywhere. */
export const CANNITH_CRAFTING_SOURCE = 'Cannith Crafting';

const WIKI_PAGE_URL = 'https://ddowiki.com/page/';
const WIKI_SEARCH_URL = 'https://ddowiki.com/page/Special:Search?go=Go&search=';
const WIKI_ITEM_URL = 'https://ddowiki.com/page/Item:';

function wikiPageUrl(prefix: string, title: string): string {
  return prefix + encodeURIComponent(title.replace(/ /g, '_'));
}

/**
 * Augments are items, with pages in the wiki's Item namespace, which its
 * search doesn't look in. Upgrades are mostly crafted effects with no page of
 * their own, so they get a search.
 */
function craftedWikiUrl(kind: ShoppingEntryKind, name: string): string {
  return kind === 'augment'
    ? wikiPageUrl(WIKI_ITEM_URL, name)
    : WIKI_SEARCH_URL + encodeURIComponent(name);
}

/**
 * A quest quests.json knows - it has a pack, or is a raid - links to its page:
 * the name is the one the wiki's quest lists give it. Other sources (vendors,
 * crafting, NPCs, events) may have no page by that name, so they get the
 * wiki's Go search, which still opens the page when there is one.
 */
function questWikiUrl(quest: string, known: boolean): string {
  return known ? wikiPageUrl(WIKI_PAGE_URL, quest) : WIKI_SEARCH_URL + encodeURIComponent(quest);
}

/** Each source's pack comes from quests.json's pack map, which names every source the data emits. */
function sourcesFor(quests: readonly string[], lookup: ShoppingSourceLookup): ShoppingSource[] {
  return quests.map(quest => {
    const pack = lookup.packOf(quest);
    const raid = lookup.isRaid(quest);
    return {
      quest,
      pack,
      raid,
      wikiUrl: questWikiUrl(quest, pack !== null || raid),
    };
  });
}

export function shoppingGearKey(slot: string, itemName: string): string {
  return `g|${slot}|${itemName}`;
}

export function deriveShoppingEntries(
    slots: ReadonlyMap<string, Item | null>, sources: ShoppingSourceLookup): ShoppingEntry[] {
  const entries: ShoppingEntry[] = [];
  for (const slot of sortSlotsForDisplay(Array.from(slots.keys()))) {
    const item = slots.get(slot);
    if (item) {
      entries.push(...entriesForItem(slot, item, sources));
    }
  }
  return entries;
}

function entriesForItem(slot: string, item: Item, sources: ShoppingSourceLookup): ShoppingEntry[] {
  const blank = item.isGeneratedEssenceCraftingBlank();
  const quests = item.quests?.length ? item.quests : blank ? [CANNITH_CRAFTING_SOURCE] : [];
  const itemSources = sourcesFor(quests, sources);
  const gearKey = shoppingGearKey(slot, item.name);
  const gear: ShoppingEntry = {
    key: gearKey,
    kind: 'gear',
    slot,
    identity: `gear|${item.name}`,
    label: item.name,
    system: null,
    itemName: item.name,
    ml: item.ml,
    sources: itemSources,
    sourceInherited: false,
    raid: itemSources.some(source => source.raid),
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
    slot,
    identity: fetchedAlone && option.name
      ? `${kind}|${option.name}`
      : `${kind}|${system}|${selection}${kind === 'step' ? `|${item.name}` : ''}`,
    label: option.describe(),
    system,
    itemName: item.name,
    ml: option.ml,
    sources: optionSources,
    sourceInherited: inherits,
    raid: optionSources.some(source => source.raid),
    rare: false,
    artifact: false,
    wikiUrl: fetchedAlone && option.name ? craftedWikiUrl(kind, option.name) : null,
    troveName: fetchedAlone && option.name ? option.name : null,
    parentKey: gear.key,
    details: [],
  };
}
