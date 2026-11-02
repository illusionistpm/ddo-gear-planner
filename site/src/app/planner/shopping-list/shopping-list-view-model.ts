import type { UserItemLocation } from '../user-gear.service';
import { comparePacks, distinctSources, isSourceHidden, routeSources, ShoppingRouteOptions } from './shopping-list-routing';
import type {
  ShoppingEntry, ShoppingFilter, ShoppingGroup, ShoppingListView, ShoppingProgress, ShoppingProgressPatch,
  ShoppingPublished, ShoppingRow, ShoppingRowState, ShoppingSection, ShoppingSource, ShoppingSourcePicks, ShoppingTroveLookup
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
  /**
   * The things got when the route was planned (settledIdentities), which it
   * isn't planned around; by default, those got now. Planned with the ticks
   * of the moment, the route would move things about as they were ticked.
   */
  routeSettled?: ReadonlySet<string>;
  /** The colour each pack had last time (the last view's `packAccents`), so a pack keeps its colour. */
  packAccents?: ReadonlyMap<string, number>;
}

/**
 * A colour for each pack listed, given them in heading order. A pack that
 * had one keeps it, so listing a new pack doesn't recolour the rest; a new
 * pack gets the least-used colour its neighbours don't have. With none
 * before, that's each colour in turn. Packs no longer listed keep theirs,
 * for when they come back.
 */
export function assignPackAccents(packs: readonly string[],
    previous: ReadonlyMap<string, number> = new Map()): Map<string, number> {
  const accents = new Map(previous);
  const uses = new Array<number>(PACK_ACCENT_COUNT).fill(0);
  packs.forEach(pack => {
    const accent = previous.get(pack);
    if (accent !== undefined) {
      uses[accent]++;
    }
  });
  packs.forEach((pack, index) => {
    if (previous.has(pack)) {
      return;
    }
    const neighbours = [packs[index - 1], packs[index + 1]]
      .map(neighbour => neighbour === undefined ? undefined : accents.get(neighbour));
    const candidates = uses.map((_, accent) => accent).filter(accent => !neighbours.includes(accent));
    const accent = candidates.reduce((best, candidate) => uses[candidate] < uses[best] ? candidate : best);
    accents.set(pack, accent);
    uses[accent]++;
  });
  return accents;
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

/** The things got, by identity: those with every entry acquired. */
export function settledIdentities(entries: readonly ShoppingEntry[], progress: ShoppingProgress,
    trove: ShoppingTroveLookup | null): Set<string> {
  const covered = troveCoveredKeys(entries, trove);
  const needed = new Set(entries.filter(entry => !isEntryAcquired(entry.key, progress, covered)).map(entry => entry.identity));
  return new Set(entries.map(entry => entry.identity).filter(identity => !needed.has(identity)));
}

/** Keys of the entries still needed. */
export function stillNeededKeys(entries: readonly ShoppingEntry[], progress: ShoppingProgress,
    trove: ShoppingTroveLookup | null): string[] {
  const covered = troveCoveredKeys(entries, trove);
  return entries.filter(entry => !isEntryAcquired(entry.key, progress, covered)).map(entry => entry.key);
}

/**
 * What a friend's link shows of this list: the entries still needed, and the
 * quests the list sends you to for each thing still needed, routed with the
 * same options as the list on screen.
 */
export function publishedProgress(entries: readonly ShoppingEntry[], progress: ShoppingProgress,
    trove: ShoppingTroveLookup | null, options: Omit<ShoppingListViewOptions, 'filter' | 'packAccents'>): ShoppingPublished {
  const needed = stillNeededKeys(entries, progress, trove);
  const neededIdentities = new Set(entries.filter(entry => needed.includes(entry.key)).map(entry => entry.identity));
  const routed = routeSources(thingsToRoute(entries), {
    hiddenPacks: options.hiddenPacks ?? new Set<string>(),
    picks: options.picks ?? {},
    settled: options.routeSettled ?? settledIdentities(entries, progress, trove),
  });
  const route: Record<string, readonly string[]> = {};
  for (const [identity, sources] of routed) {
    if (neededIdentities.has(identity) && sources.length) {
      route[identity] = sources.map(source => source.quest);
    }
  }
  return { needed, route };
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
}

export function buildShoppingListView(entries: readonly ShoppingEntry[], progress: ShoppingProgress,
    trove: ShoppingTroveLookup | null, options: ShoppingListViewOptions): ShoppingListView {
  const covered = troveCoveredKeys(entries, trove);
  const context: RowContext = { progress, covered, trove };

  const settledNow = settledIdentities(entries, progress, trove);
  const route: ShoppingRouteOptions = {
    hiddenPacks: options.hiddenPacks ?? new Set<string>(),
    picks: options.picks ?? {},
    settled: options.routeSettled ?? settledNow,
  };
  const things = thingsToRoute(entries);
  // Ticks since the route was planned play no part, so ticking something off
  // never moves anything: it stays under every quest it's listed under,
  // where it was ticked.
  const routed = routeSources(things, route);
  const { sections: allSections, packAccents } = sectionsByPack(groupBySource(entries, route, routed, context), context,
    options.packAccents);
  const sections = options.filter === 'needed'
    ? allSections.map(({ groups, ...rest }) => ({
      ...rest,
      groups: groups.map(group => ({ ...group, rows: neededRows(group.rows) })).filter(group => group.rows.length),
    })).filter(candidate => candidate.groups.length)
    : allSections;

  const acquired = entries.filter(entry => isEntryAcquired(entry.key, progress, covered)).length;
  const picked = allSections.some(candidate => candidate.groups.some(group => group.rows.some(row => row.picked)));
  const replanned = routeSources(things, { ...route, picks: {}, settled: settledNow });
  const questsOf = (sources: readonly ShoppingSource[] | undefined) => (sources ?? []).map(source => source.quest).join('|');
  const replannable = Array.from(things.keys())
    .some(identity => !settledNow.has(identity) && questsOf(routed.get(identity)) !== questsOf(replanned.get(identity)));
  return { sections, acquired, total: entries.length, filter: options.filter, picked, replannable, packAccents };
}

/** Crafting done where its item comes from is listed under the item, and goes wherever it goes. */
function nestsUnderItem(entry: ShoppingEntry): boolean {
  return entry.kind === 'step' && entry.sourceInherited;
}

/** What the route places, by identity: everything but what nests under its item. */
function thingsToRoute(entries: readonly ShoppingEntry[]): Map<string, readonly ShoppingSource[]> {
  const things = new Map<string, readonly ShoppingSource[]>();
  for (const entry of entries) {
    if (!nestsUnderItem(entry) && !things.has(entry.identity)) {
      things.set(entry.identity, entry.sources);
    }
  }
  return things;
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
 * unknown last. Each pack listed gets a colour (assignPackAccents); quests
 * in no pack get none.
 */
function sectionsByPack(groups: readonly SourceGroup[], context: RowContext,
    previousAccents: ReadonlyMap<string, number> | undefined): { sections: ShoppingSection[]; packAccents: Map<string, number> } {
  const byPack = new Map<string, SourceGroup[]>();
  for (const group of groups) {
    const pack = group.pack ?? '';
    byPack.set(pack, [...(byPack.get(pack) ?? []), group]);
  }
  const packs = Array.from(byPack.keys()).sort(comparePacks);
  const packAccents = assignPackAccents(packs.filter(Boolean), previousAccents);
  const sections = packs.map(pack => {
    const accent = pack ? packAccents.get(pack)! : null;
    const members = byPack.get(pack)!.sort((a, b) =>
      a.unknown !== b.unknown ? (a.unknown ? 1 : -1) : a.group.label.localeCompare(b.group.label));
    return section(`pack:${pack}`, pack || OTHER_SOURCES_LABEL, members.map(member => ({ ...member.group, accent })),
      context, accent);
  });
  return { sections, packAccents };
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

/** Where a row's thing comes from besides where it's listed, and the choice of where to get it. */
type RowSourcing = Pick<ShoppingRow, 'alsoFrom' | 'choices' | 'picked'>;

/** For a row listed with its item, which says where it comes from. */
const WITH_ITEM: RowSourcing = { alsoFrom: [], choices: [], picked: false };

/** Folds entries into rows, one per identity, in first-seen order. */
function foldRows(entries: readonly ShoppingEntry[], idPrefix: string, context: RowContext,
    childrenOf: (folded: readonly ShoppingEntry[]) => ShoppingRow[],
    sourcingOf: (folded: readonly ShoppingEntry[]) => RowSourcing = () => WITH_ITEM): ShoppingRow[] {
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
      acquired,
      state: rowState(acquired, folded.length),
      ownedLocations: locations?.length ? locations : null,
      ...sourcingOf(folded),
      children: childrenOf(folded),
    };
  });
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
    routed: ReadonlyMap<string, readonly ShoppingSource[]>, context: RowContext): SourceGroup[] {
  const listed = entries.filter(entry => !nestsUnderItem(entry));
  const bySource = new Map<string, ShoppingEntry[]>();
  const thingsAt = new Map<string, Set<string>>();
  for (const entry of listed) {
    const routedTo = routed.get(entry.identity) ?? [];
    const quests = routedTo.length ? routedTo.map(source => source.quest) : [''];
    for (const quest of quests) {
      const same = bySource.get(quest);
      if (same) {
        same.push(entry);
      } else {
        bySource.set(quest, [entry]);
      }
      thingsAt.set(quest, (thingsAt.get(quest) ?? new Set()).add(entry.identity));
    }
  }

  const sourcingOf = (entry: ShoppingEntry, quest: string): RowSourcing => {
    const sources = distinctSources(entry.sources);
    if (sources.length < 2) {
      return WITH_ITEM;
    }
    const routedTo = new Set((routed.get(entry.identity) ?? []).map(source => source.quest));
    const picks = route.picks[entry.identity] ?? [];
    const inHeadingOrder = [...sources].sort((a, b) => comparePacks(a.pack ?? '', b.pack ?? '') || a.quest.localeCompare(b.quest));
    return {
      alsoFrom: sources.filter(source => source.quest !== quest),
      choices: inHeadingOrder.map(source => ({
        source,
        chosen: routedTo.has(source.quest),
        hidden: isSourceHidden(source, route.hiddenPacks),
        alsoThere: Array.from(thingsAt.get(source.quest) ?? []).filter(identity => identity !== entry.identity).length,
      })),
      picked: sources.some(source => picks.includes(source.quest)),
    };
  };

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
          folded => sourcingOf(folded[0], quest)),
        ...groupTotals([...members, ...nested], context),
      },
    };
  });
}
