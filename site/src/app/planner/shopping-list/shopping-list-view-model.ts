import type { UserItemLocation } from '../user-gear.service';
import { comparePacks, routeSources, ShoppingRouteOptions } from './shopping-list-routing';
import type {
  ShoppingEntry, ShoppingFilter, ShoppingGroup, ShoppingListView, ShoppingProgress, ShoppingProgressPatch,
  ShoppingRow, ShoppingRowState, ShoppingSection, ShoppingSource, ShoppingSourcePicks, ShoppingTroveLookup
} from './shopping-list-types';

/**
 * Turns entries, explicit ticks and the trove into what the list shows, and
 * clicks back into progress changes. Pure: no Angular, no storage.
 *
 * Whether an entry is acquired: an explicit tick (1) or untick (0) wins;
 * otherwise it is acquired when the trove covers it. The trove covers entries
 * for the same thing in list order, as many as it holds copies of, so a build
 * that needs two of an augment you have one of starts with one ticked.
 */

export const UNKNOWN_SOURCE_LABEL = 'Unknown source';
/** The heading for quests that aren't in a pack, or that quests.json doesn't place. */
export const OTHER_SOURCES_LABEL = 'Other sources';
/** How many pack colours the list has (`--pack-accent-*` in styles.css); past that they repeat. */
export const PACK_ACCENT_COUNT = 8;

export interface ShoppingListViewOptions {
  filter: ShoppingFilter;
  /** The packs the planner's pack filter hides, whose quests the list sends you to only as a last resort. */
  hiddenPacks?: ReadonlySet<string>;
  /** The quests the user chose to get things from; see shopping-list-routing.ts. */
  picks?: ShoppingSourcePicks;
}

/** How many copies of each name the trove holds. */
function troveCopies(locations: readonly UserItemLocation[] | undefined): number {
  return (locations ?? []).reduce((total, location) => total + (location.quantity ?? 1), 0);
}

/** The entries the trove covers, by key: the first N for each name it holds N of. */
export function troveCoveredKeys(entries: readonly ShoppingEntry[], trove: ShoppingTroveLookup | null): Set<string> {
  const covered = new Set<string>();
  if (!trove) {
    return covered;
  }
  const remaining = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.troveName) {
      continue;
    }
    const name = entry.troveName;
    const left = remaining.get(name) ?? troveCopies(trove.locationsFor(name));
    if (left > 0) {
      covered.add(entry.key);
    }
    remaining.set(name, left - 1);
  }
  return covered;
}

export function isEntryAcquired(key: string, progress: ShoppingProgress, covered: ReadonlySet<string>): boolean {
  const value = progress[key];
  return value === undefined ? covered.has(key) : value === 1;
}

/** Keys of the entries still needed. */
export function stillNeededKeys(entries: readonly ShoppingEntry[], progress: ShoppingProgress,
    trove: ShoppingTroveLookup | null): string[] {
  const covered = troveCoveredKeys(entries, trove);
  return entries.filter(entry => !isEntryAcquired(entry.key, progress, covered)).map(entry => entry.key);
}

/**
 * The change a click on a row makes: every entry ticked, unless all already
 * are, then every entry unticked. A key matching what the trove would say on
 * its own is removed rather than stored.
 */
export function togglePatch(row: ShoppingRow, entries: readonly ShoppingEntry[], progress: ShoppingProgress,
    trove: ShoppingTroveLookup | null): ShoppingProgressPatch {
  const covered = troveCoveredKeys(entries, trove);
  const target = row.state !== 'checked';
  const patch: ShoppingProgressPatch = {};
  for (const key of row.entryKeys) {
    if (target === covered.has(key)) {
      if (key in progress) {
        patch[key] = null;
      }
    } else if (progress[key] !== (target ? 1 : 0)) {
      patch[key] = target ? 1 : 0;
    }
  }
  return patch;
}

/** Removes progress for entries no longer in the build. */
export function prunePatch(progress: ShoppingProgress, entries: readonly ShoppingEntry[]): ShoppingProgressPatch {
  const live = new Set(entries.map(entry => entry.key));
  const patch: ShoppingProgressPatch = {};
  for (const key of Object.keys(progress)) {
    if (!live.has(key)) {
      patch[key] = null;
    }
  }
  return patch;
}

export function applyProgressPatch(progress: ShoppingProgress, patch: ShoppingProgressPatch): ShoppingProgress {
  const next: Record<string, 0 | 1> = { ...progress };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  return next;
}

interface RowContext {
  progress: ShoppingProgress;
  covered: ReadonlySet<string>;
  trove: ShoppingTroveLookup | null;
  inBuild: ReadonlyMap<string, number>;
}

export function buildShoppingListView(entries: readonly ShoppingEntry[], progress: ShoppingProgress,
    trove: ShoppingTroveLookup | null, options: ShoppingListViewOptions): ShoppingListView {
  const covered = troveCoveredKeys(entries, trove);
  const inBuild = new Map<string, number>();
  for (const entry of entries) {
    inBuild.set(entry.identity, (inBuild.get(entry.identity) ?? 0) + 1);
  }
  const context: RowContext = { progress, covered, trove, inBuild };

  const route: ShoppingRouteOptions = { hiddenPacks: options.hiddenPacks ?? new Set<string>(), picks: options.picks ?? {} };
  const allSections = sectionsByPack(groupBySource(entries, route, context), context);
  const sections = options.filter === 'needed'
    ? allSections.map(({ groups, ...rest }) => ({
      ...rest,
      groups: groups.map(group => ({ ...group, rows: neededRows(group.rows) })).filter(group => group.rows.length),
    })).filter(candidate => candidate.groups.length)
    : allSections;

  const acquired = entries.filter(entry => isEntryAcquired(entry.key, progress, covered)).length;
  return { sections, acquired, total: entries.length, filter: options.filter };
}

/** Totals count each entry once, though it may be listed under several quests. */
function section(id: string, label: string, groups: ShoppingGroup[], context: RowContext,
    accent: number | null): ShoppingSection {
  const keys = new Set<string>();
  const collect = (rows: readonly ShoppingRow[]) => rows.forEach(row => {
    row.entryKeys.forEach(key => keys.add(key));
    collect(row.children);
  });
  groups.forEach(group => collect(group.rows));
  const acquired = Array.from(keys).filter(key => isEntryAcquired(key, context.progress, context.covered)).length;
  return { id, label, accent, groups, acquired, total: keys.size };
}

/**
 * A heading per pack, in comparePacks order; each pack's quests by name,
 * unknown last. Each pack listed gets a colour, in heading order, so packs
 * next to each other differ; quests in no pack get none.
 */
function sectionsByPack(groups: readonly SourceGroup[], context: RowContext): ShoppingSection[] {
  const byPack = new Map<string, SourceGroup[]>();
  for (const group of groups) {
    const pack = group.pack ?? '';
    byPack.set(pack, [...(byPack.get(pack) ?? []), group]);
  }
  const packs = Array.from(byPack.keys()).sort(comparePacks);
  const named = packs.filter(Boolean);
  return packs.map(pack => {
    const accent = pack ? named.indexOf(pack) % PACK_ACCENT_COUNT : null;
    const members = byPack.get(pack)!.sort((a, b) =>
      a.unknown !== b.unknown ? (a.unknown ? 1 : -1) : a.group.label.localeCompare(b.group.label));
    return section(`pack:${pack}`, pack || OTHER_SOURCES_LABEL, members.map(member => ({ ...member.group, accent })),
      context, accent);
  });
}

function neededRows(rows: ShoppingRow[]): ShoppingRow[] {
  const kept: ShoppingRow[] = [];
  for (const row of rows) {
    const children = neededRows(row.children);
    if (row.state !== 'checked' || children.length) {
      kept.push({ ...row, children });
    }
  }
  return kept;
}

/** Folds entries into rows, one per identity, in first-seen order. */
function foldRows(entries: readonly ShoppingEntry[], idPrefix: string, context: RowContext,
    childrenOf: (folded: readonly ShoppingEntry[]) => ShoppingRow[],
    alsoFromOf: (folded: readonly ShoppingEntry[]) => ShoppingSource[] = () => []): ShoppingRow[] {
  const byIdentity = new Map<string, ShoppingEntry[]>();
  for (const entry of entries) {
    const same = byIdentity.get(entry.identity);
    if (same) {
      same.push(entry);
    } else {
      byIdentity.set(entry.identity, [entry]);
    }
  }

  return Array.from(byIdentity.entries(), ([identity, folded]) => {
    const acquired = folded.filter(entry => isEntryAcquired(entry.key, context.progress, context.covered)).length;
    const first = folded[0];
    const locations = first.troveName ? context.trove?.locationsFor(first.troveName) : undefined;
    return {
      id: `${idPrefix}|${identity}`,
      entry: first,
      entryKeys: folded.map(entry => entry.key),
      quantity: folded.length,
      quantityInBuild: context.inBuild.get(identity) ?? folded.length,
      acquired,
      state: rowState(acquired, folded.length),
      ownedLocations: locations?.length ? locations : null,
      alsoFrom: alsoFromOf(folded),
      children: childrenOf(folded),
    };
  });
}

/** Where an entry comes from besides this quest, once each. */
function otherSources(entry: ShoppingEntry, quest: string): ShoppingSource[] {
  const others = new Map<string, ShoppingSource>();
  for (const source of entry.sources) {
    if (source.quest !== quest && !others.has(source.quest)) {
      others.set(source.quest, source);
    }
  }
  return Array.from(others.values());
}

function rowState(acquired: number, total: number): ShoppingRowState {
  return acquired === total ? 'checked' : acquired === 0 ? 'unchecked' : 'mixed';
}

function groupTotals(entries: readonly ShoppingEntry[], context: RowContext): { acquired: number; total: number } {
  return {
    acquired: entries.filter(entry => isEntryAcquired(entry.key, context.progress, context.covered)).length,
    total: entries.length,
  };
}

/**
 * One group per source, so everything from one quest is together. Crafting
 * that happens where its item comes from stays under the item; anything with
 * a source of its own is listed there on its own: by now it's a piece to
 * collect, and which item it goes in doesn't matter. Something that comes
 * from several quests is listed under the one the route picks for it, or
 * each the user picked.
 */
interface SourceGroup {
  group: ShoppingGroup;
  pack: string | null;
  unknown: boolean;
}

function groupBySource(entries: readonly ShoppingEntry[], route: ShoppingRouteOptions,
    context: RowContext): SourceGroup[] {
  const nestsUnderItem = (entry: ShoppingEntry) => entry.kind === 'step' && entry.sourceInherited;
  const listed = entries.filter(entry => !nestsUnderItem(entry));
  const things = new Map<string, readonly ShoppingSource[]>();
  for (const entry of listed) {
    if (!things.has(entry.identity)) {
      things.set(entry.identity, entry.sources);
    }
  }
  const routed = routeSources(things, route);
  // Once got, a thing picked from several quests is listed at the first only.
  const pending = new Set(listed.filter(entry => !isEntryAcquired(entry.key, context.progress, context.covered))
    .map(entry => entry.identity));

  const bySource = new Map<string, ShoppingEntry[]>();
  for (const entry of listed) {
    const routedTo = routed.get(entry.identity) ?? [];
    const chosen = pending.has(entry.identity) ? routedTo : routedTo.slice(0, 1);
    const quests = chosen.length ? chosen.map(source => source.quest) : [''];
    for (const quest of quests) {
      const same = bySource.get(quest);
      if (same) {
        same.push(entry);
      } else {
        bySource.set(quest, [entry]);
      }
    }
  }

  const nestedUnder = (gearEntries: readonly ShoppingEntry[], prefix: string) => {
    const keys = new Set(gearEntries.map(entry => entry.key));
    return foldRows(entries.filter(entry => nestsUnderItem(entry) && keys.has(entry.parentKey ?? '')), prefix, context,
      () => []);
  };

  return Array.from(bySource.entries(), ([quest, members]): SourceGroup => {
    const id = `source:${quest}`;
    const nested = entries.filter(entry => nestsUnderItem(entry) && members.some(member => member.key === entry.parentKey));
    const here = members.flatMap(member => member.sources.filter(source => source.quest === quest));
    const pack = here.find(source => source.pack)?.pack ?? null;
    return {
      pack,
      unknown: !quest,
      group: {
        id,
        label: quest || UNKNOWN_SOURCE_LABEL,
        wikiUrl: here[0]?.wikiUrl ?? null,
        raid: here.some(source => source.raid),
        // Set with its pack's heading.
        accent: null,
        rows: foldRows(members, id, context,
          folded => folded[0].kind === 'gear' ? nestedUnder(folded, `${id}|${folded[0].identity}`) : [],
          folded => otherSources(folded[0], quest)),
        ...groupTotals([...members, ...nested], context),
      },
    };
  });
}
