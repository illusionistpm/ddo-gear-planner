import type {
  ShoppingEntry, ShoppingFilter, ShoppingListView, ShoppingProgress, ShoppingProgressPatch, ShoppingRouteOrder, ShoppingRow,
  ShoppingSourcePicks
} from './shopping-list-types';
import { buildShoppingListView, routeEveryThing } from './shopping-list-view-model';

/**
 * A group run's list: several builds' entries shopped for as one, each
 * row saying whose it is (ShoppingRow.members). Pure: no Angular, no
 * storage.
 *
 * Each build's entries keep their identity, so the same augment needed by
 * three characters is one row, routed once; their keys are prefixed with
 * the build's id, so they stay apart for ticking.
 *
 * The route is planned around everything the builds need, got or not, with
 * the host's picks and order: every member's page then shows the same
 * route, and ticking something off never moves anything.
 */

/** How many character colours the list has (`--member-accent-*` in styles.css): one for each build a group can hold. */
export const MEMBER_ACCENT_COUNT = 12;

/** One build of the group, with what it needs: its own entries, unprefixed, and its published still-needed keys. */
export interface GroupMemberEntries {
  buildId: string;
  characterName: string;
  entries: readonly ShoppingEntry[];
  /** The build's still-needed keys as its owner last shared them; null when they never have, so everything is needed. */
  needed: readonly string[] | null;
}

export interface GroupListOptions {
  filter: ShoppingFilter;
  /** The group's shared route. */
  picks: ShoppingSourcePicks;
  order: ShoppingRouteOrder | null;
  /** Ticks made on this page not yet in the members' lists, by prefixed key. */
  pending?: ShoppingProgress;
  /** Only these builds' rows, routed as the whole group's are; by default, everyone's. */
  only?: ReadonlySet<string>;
  /** The colour each pack had last time, so a pack keeps its colour. */
  packAccents?: ReadonlyMap<string, number>;
}

/** The key an entry has on a group's list: the build's id, then its own key. */
export function groupEntryKey(buildId: string, key: string): string {
  return `${buildId}|${key}`;
}

/** A group key's build and the build's own key; null for a key that isn't one. */
export function splitGroupEntryKey(key: string): { buildId: string; key: string } | null {
  const bar = key.indexOf('|');
  return bar < 0 ? null : { buildId: key.slice(0, bar), key: key.slice(bar + 1) };
}

/** A build's entries as the group's list holds them. */
export function memberEntries(member: GroupMemberEntries): ShoppingEntry[] {
  return member.entries.map(entry => ({
    ...entry,
    key: groupEntryKey(member.buildId, entry.key),
    parentKey: entry.parentKey === null ? null : groupEntryKey(member.buildId, entry.parentKey),
    member: member.buildId,
  }));
}

/**
 * What's got, by group key: each entry its build's owner doesn't list as
 * still needed, with this page's own pending ticks laid over.
 */
export function groupProgress(members: readonly GroupMemberEntries[], pending: ShoppingProgress = {}): ShoppingProgress {
  const progress: Record<string, 0 | 1> = {};
  for (const member of members) {
    const needed = member.needed === null ? null : new Set(member.needed);
    for (const entry of member.entries) {
      if (needed !== null && !needed.has(entry.key)) {
        progress[groupEntryKey(member.buildId, entry.key)] = 1;
      }
    }
  }
  return { ...progress, ...pending };
}

/** The group's list, as one view. */
export function buildGroupListView(members: readonly GroupMemberEntries[], options: GroupListOptions): ShoppingListView {
  const entries = members.flatMap(memberEntries);
  const progress = groupProgress(members, options.pending);
  // Planned around everything, so no one's ticks move anyone's route.
  const routeSettled = new Set<string>();
  const order = options.order ?? undefined;
  if (!options.only) {
    return buildShoppingListView(entries, progress, null,
      { filter: options.filter, picks: options.picks, order, routeSettled, packAccents: options.packAccents });
  }
  // Some builds' rows only: routed as the whole group's are, by handing
  // their part the whole group's route as picks.
  const only = options.only;
  const route = routeEveryThing(entries, { picks: options.picks, routeSettled });
  const view = buildShoppingListView(entries.filter(entry => entry.member !== undefined && only.has(entry.member)), progress, null,
    { filter: options.filter, picks: route, order, routeSettled, packAccents: options.packAccents });
  return { ...view, picked: Object.keys(options.picks).length > 0, replannable: false };
}

/** The keys of a row's own entries that are these builds'. */
function keysFor(row: ShoppingRow, buildIds: ReadonlySet<string>): string[] {
  return row.members.filter(part => buildIds.has(part.member)).flatMap(part => part.keys);
}

/**
 * A tap on one build's chip on a row: ticks off its next copy not yet got,
 * or, once every copy is, unticks them all - so two copies go 0/2, 1/2,
 * 2/2, then back to 0/2, and one simply toggles. Ticks the copies in list
 * order, the order they were listed in.
 */
export function chipPatch(row: ShoppingRow, buildId: string, progress: ShoppingProgress): ShoppingProgressPatch {
  const part = row.members.find(candidate => candidate.member === buildId);
  if (!part) {
    return {};
  }
  const next = part.keys.find(key => progress[key] !== 1);
  return next === undefined
    ? Object.fromEntries(part.keys.map(key => [key, 0 as const]))
    : { [next]: 1 };
}

/**
 * The row's box, for the builds that are yours: ticks off all of yours in
 * it, unless they all are, then unticks them all.
 */
export function ownRowPatch(row: ShoppingRow, yours: ReadonlySet<string>, progress: ShoppingProgress): ShoppingProgressPatch {
  const keys = keysFor(row, yours);
  const target = keys.every(key => progress[key] === 1) ? 0 : 1;
  return Object.fromEntries(keys.map(key => [key, target as 0 | 1]));
}

/** How a row's box reads for the builds that are yours: their entries in it got, all, some or none. */
export function ownRowState(row: ShoppingRow, yours: ReadonlySet<string>): 'checked' | 'mixed' | 'unchecked' | null {
  const parts = row.members.filter(part => yours.has(part.member));
  if (!parts.length) {
    return null;
  }
  const quantity = parts.reduce((total, part) => total + part.quantity, 0);
  const acquired = parts.reduce((total, part) => total + part.acquired, 0);
  return acquired === quantity ? 'checked' : acquired === 0 ? 'unchecked' : 'mixed';
}

/**
 * A patch in group keys, split into each build's own: what each build's
 * owner would write. Keys that aren't a group's are dropped.
 */
export function patchesByBuild(patch: ShoppingProgressPatch): Map<string, Record<string, 0 | 1>> {
  const byBuild = new Map<string, Record<string, 0 | 1>>();
  for (const [groupKey, value] of Object.entries(patch)) {
    const split = splitGroupEntryKey(groupKey);
    if (!split || value === null) {
      continue;
    }
    byBuild.set(split.buildId, { ...(byBuild.get(split.buildId) ?? {}), [split.key]: value });
  }
  return byBuild;
}

/**
 * A build's still-needed keys after ticks made from the group's page:
 * those ticked off go, those unticked come back, in the build's own order.
 * Starts from what the owner last shared, so things the trove covers on
 * their device - which this one may not have - stay off it. Null shared
 * means everything was needed.
 */
export function neededAfter(entries: readonly ShoppingEntry[], shared: readonly string[] | null,
    ticks: Readonly<Record<string, 0 | 1>>): string[] {
  const needed = new Set(shared ?? entries.map(entry => entry.key));
  for (const [key, value] of Object.entries(ticks)) {
    if (value === 1) {
      needed.delete(key);
    } else {
      needed.add(key);
    }
  }
  return entries.map(entry => entry.key).filter(key => needed.has(key));
}
