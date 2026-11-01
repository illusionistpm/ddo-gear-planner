import { slotLabel } from '../../gear/slot-display';
import type { UserItemLocation } from '../user-gear.service';
import type {
  ShoppingEntry, ShoppingFilter, ShoppingGroup, ShoppingGroupMode, ShoppingListView, ShoppingProgress,
  ShoppingProgressPatch, ShoppingRow, ShoppingRowState, ShoppingSection, ShoppingTroveLookup
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

export interface ShoppingListViewOptions {
  groupMode: ShoppingGroupMode;
  filter: ShoppingFilter;
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

  const allSections = options.groupMode === 'slot'
    ? [section('slots', null, groupBySlot(entries, context), context)]
    : sectionsByPack(groupBySource(entries, context), context);
  const sections = options.filter === 'needed'
    ? allSections.map(({ groups, ...rest }) => ({
      ...rest,
      groups: groups.map(group => ({ ...group, rows: neededRows(group.rows) }))
        .filter(group => group.rows.length || (group.header && group.header.state !== 'checked')),
    })).filter(candidate => candidate.groups.length)
    : allSections;

  const acquired = entries.filter(entry => isEntryAcquired(entry.key, progress, covered)).length;
  return { sections, acquired, total: entries.length, groupMode: options.groupMode, filter: options.filter };
}

/** Totals count each entry once, though by source it may be listed under several quests. */
function section(id: string, label: string | null, groups: ShoppingGroup[], context: RowContext): ShoppingSection {
  const keys = new Set<string>();
  const collect = (rows: readonly ShoppingRow[]) => rows.forEach(row => {
    row.entryKeys.forEach(key => keys.add(key));
    collect(row.children);
  });
  groups.forEach(group => collect(group.header ? [group.header, ...group.rows] : group.rows));
  const acquired = Array.from(keys).filter(key => isEntryAcquired(key, context.progress, context.covered)).length;
  return { id, label, groups, acquired, total: keys.size };
}

/** A heading per pack, by name, then the quests not in one; each pack's quests by name, unknown last. */
function sectionsByPack(groups: readonly SourceGroup[], context: RowContext): ShoppingSection[] {
  const byPack = new Map<string, SourceGroup[]>();
  for (const group of groups) {
    const pack = group.pack ?? '';
    byPack.set(pack, [...(byPack.get(pack) ?? []), group]);
  }
  const packs = Array.from(byPack.keys()).sort((a, b) => !a !== !b ? (a ? -1 : 1) : a.localeCompare(b));
  return packs.map(pack => {
    const members = byPack.get(pack)!.sort((a, b) =>
      a.unknown !== b.unknown ? (a.unknown ? 1 : -1) : a.group.label.localeCompare(b.group.label));
    return section(`pack:${pack}`, pack || OTHER_SOURCES_LABEL, members.map(member => member.group), context);
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
    contextOf: (folded: readonly ShoppingEntry[]) => string | null,
    alsoFromOf: (folded: readonly ShoppingEntry[]) => string[] = () => []): ShoppingRow[] {
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
      context: contextOf(folded),
      alsoFrom: alsoFromOf(folded),
      children: childrenOf(folded),
    };
  });
}

/** The quests an entry comes from besides this one. */
function otherQuests(entry: ShoppingEntry, quest: string): string[] {
  return Array.from(new Set(entry.sources.map(source => source.quest))).filter(other => other !== quest);
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

/** One card per slot, headed by its item, with what goes into it listed beneath. */
function groupBySlot(entries: readonly ShoppingEntry[], context: RowContext): ShoppingGroup[] {
  const groups: ShoppingGroup[] = [];
  for (const gear of entries.filter(entry => entry.kind === 'gear')) {
    const crafted = entries.filter(entry => entry.parentKey === gear.key);
    const id = `slot:${gear.slot}`;
    groups.push({
      id,
      label: slotLabel(gear.slot),
      header: foldRows([gear], id, context, () => [], () => null)[0],
      slot: gear.slot,
      raid: gear.raid,
      rows: foldRows(crafted, `${id}|${gear.key}`, context, () => [], () => null),
      ...groupTotals([gear, ...crafted], context),
    });
  }
  return groups;
}

/**
 * One group per source, so everything from one quest is together. Crafting
 * that happens where its item comes from stays under the item; anything with
 * a source of its own is listed there, saying what it's for. Something that
 * comes from several quests is listed under each, as any of them will do.
 */
interface SourceGroup {
  group: ShoppingGroup;
  pack: string | null;
  unknown: boolean;
}

function groupBySource(entries: readonly ShoppingEntry[], context: RowContext): SourceGroup[] {
  const parents = new Map(entries.filter(entry => entry.kind === 'gear').map(entry => [entry.key, entry]));
  const nestsUnderItem = (entry: ShoppingEntry) => entry.kind === 'step' && entry.sourceInherited;
  const bySource = new Map<string, ShoppingEntry[]>();
  for (const entry of entries) {
    if (nestsUnderItem(entry)) {
      continue;
    }
    const quests = entry.sources.length ? new Set(entry.sources.map(source => source.quest)) : [''];
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
      () => [], () => null);
  };
  const forWhat = (folded: readonly ShoppingEntry[]) => {
    const forItems = new Set(folded.map(entry => entry.parentKey));
    if (forItems.size > 1) {
      return `for ${forItems.size} items`;
    }
    const parent = parents.get(folded[0].parentKey ?? '');
    return parent ? `for ${parent.label} (${slotLabel(parent.slot)})` : null;
  };

  return Array.from(bySource.entries(), ([quest, members]): SourceGroup => {
    const id = `source:${quest}`;
    const nested = entries.filter(entry => nestsUnderItem(entry) && members.some(member => member.key === entry.parentKey));
    const here = members.flatMap(member => member.sources.filter(source => source.quest === quest));
    return {
      pack: here.find(source => source.pack)?.pack ?? null,
      unknown: !quest,
      group: {
        id,
        label: quest || UNKNOWN_SOURCE_LABEL,
        header: null,
        slot: null,
        raid: here.some(source => source.raid),
        rows: foldRows(members, id, context,
          folded => folded[0].kind === 'gear' ? nestedUnder(folded, `${id}|${folded[0].identity}`) : [],
          folded => folded[0].kind === 'gear' ? null : forWhat(folded),
          folded => otherQuests(folded[0], quest)),
        ...groupTotals([...members, ...nested], context),
      },
    };
  });
}
