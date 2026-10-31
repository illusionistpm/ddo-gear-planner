import { slotLabel } from '../../gear/slot-display';
import type { UserItemLocation } from '../user-gear.service';
import type {
  ShoppingEntry, ShoppingFilter, ShoppingGroup, ShoppingGroupMode, ShoppingListView, ShoppingProgress,
  ShoppingProgressPatch, ShoppingRow, ShoppingRowState, ShoppingTroveLookup
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

  const allGroups = options.groupMode === 'slot'
    ? groupBySlot(entries, context)
    : groupBySource(entries, context);
  const groups = options.filter === 'needed'
    ? allGroups.map(group => ({ ...group, rows: neededRows(group.rows) })).filter(group => group.rows.length)
    : allGroups;

  const acquired = entries.filter(entry => isEntryAcquired(entry.key, progress, covered)).length;
  return { groups, acquired, total: entries.length, groupMode: options.groupMode, filter: options.filter };
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
    contextOf: (folded: readonly ShoppingEntry[]) => string | null): ShoppingRow[] {
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

/** One group per slot: the item, with what goes into it listed beneath. */
function groupBySlot(entries: readonly ShoppingEntry[], context: RowContext): ShoppingGroup[] {
  const groups: ShoppingGroup[] = [];
  for (const gear of entries.filter(entry => entry.kind === 'gear')) {
    const crafted = entries.filter(entry => entry.parentKey === gear.key);
    const id = `slot:${gear.slot}`;
    groups.push({
      id,
      label: slotLabel(gear.slot),
      sublabel: null,
      slot: gear.slot,
      raid: gear.raid,
      rows: foldRows([gear], id, context, () => foldRows(crafted, `${id}|${gear.key}`, context, () => [], () => null),
        () => null),
      ...groupTotals([gear, ...crafted], context),
    });
  }
  return groups;
}

/**
 * One group per source, so everything from one quest is together. Crafting
 * that happens where its item comes from stays under the item; anything with
 * a source of its own is listed there, saying what it's for.
 */
function groupBySource(entries: readonly ShoppingEntry[], context: RowContext): ShoppingGroup[] {
  const parents = new Map(entries.filter(entry => entry.kind === 'gear').map(entry => [entry.key, entry]));
  const nestsUnderItem = (entry: ShoppingEntry) => entry.kind === 'step' && entry.sourceInherited;
  const bySource = new Map<string, ShoppingEntry[]>();
  for (const entry of entries) {
    if (nestsUnderItem(entry)) {
      continue;
    }
    const source = entry.source ?? '';
    const same = bySource.get(source);
    if (same) {
      same.push(entry);
    } else {
      bySource.set(source, [entry]);
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

  const groups = Array.from(bySource.entries(), ([source, members]): ShoppingGroup => {
    const id = `source:${source}`;
    const nested = entries.filter(entry => nestsUnderItem(entry) && members.some(member => member.key === entry.parentKey));
    return {
      id,
      label: source || UNKNOWN_SOURCE_LABEL,
      sublabel: members.find(member => member.pack)?.pack ?? null,
      slot: null,
      raid: members.some(member => member.raid),
      rows: foldRows(members, id, context, folded => folded[0].kind === 'gear' ? nestedUnder(folded, `${id}|${folded[0].identity}`) : [],
        folded => folded[0].kind === 'gear' ? null : forWhat(folded)),
      ...groupTotals([...members, ...nested], context),
    };
  });

  // By pack then quest, so a pack's quests are together; unknown sources last.
  return groups.sort((a, b) => {
    const unknownA = a.id === 'source:';
    const unknownB = b.id === 'source:';
    if (unknownA !== unknownB) {
      return unknownA ? 1 : -1;
    }
    if (!a.sublabel !== !b.sublabel) {
      return a.sublabel ? -1 : 1;
    }
    return (a.sublabel ?? '').localeCompare(b.sublabel ?? '') || a.label.localeCompare(b.label);
  });
}
