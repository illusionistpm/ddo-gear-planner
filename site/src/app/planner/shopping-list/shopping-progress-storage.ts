import type { ShoppingProgress, ShoppingProgressPatch, ShoppingRouteOrder, ShoppingSourcePicks } from './shopping-list-types';
import { applyProgressPatch } from './shopping-list-view-model';

/**
 * Shopping-list ticks, and the quests picked to get things from, kept in this
 * browser per build ("scope"). Never part of the build itself: ticking things
 * off mustn't change a build's URL, mark it unsaved, or travel with a shared
 * link.
 *
 * Every write re-reads storage and changes only the keys it was given, so two
 * tabs ticking different things don't undo each other.
 */
export const SHOPPING_PROGRESS_STORAGE_KEY = 'ddo-gear-planner-shopping-progress';

/** Builds remembered, the least recently changed forgotten first. */
export const MAX_STORED_SCOPES = 30;

interface StoredScope {
  entries: ShoppingProgress;
  /** Absent when nothing is picked. */
  picks?: ShoppingSourcePicks;
  /** Absent when the route is in its default order. */
  order?: ShoppingRouteOrder;
  updatedAt: number;
}

interface StoredProgress {
  v: 1;
  scopes: Record<string, StoredScope>;
}

export function readScopeProgress(scope: string): ShoppingProgress {
  return readAll().scopes[scope]?.entries ?? {};
}

export function readScopePicks(scope: string): ShoppingSourcePicks {
  return readAll().scopes[scope]?.picks ?? {};
}

/** The order a scope's route is arranged in; null for the default. */
export function readScopeOrder(scope: string): ShoppingRouteOrder | null {
  return readAll().scopes[scope]?.order ?? null;
}

/** Arranges a scope's route, or (null) puts it back in its default order. */
export function setScopeOrder(scope: string, order: ShoppingRouteOrder | null): void {
  const all = readAll();
  setScope(all, scope, { order });
  writeAll(all);
}

/** Whether a scope has anything stored: ticks, picks or an order. */
export function hasScopeProgress(scope: string): boolean {
  return readAll().scopes[scope] !== undefined;
}

/** Applies a patch to a scope's stored ticks and returns the result. */
export function patchScopeProgress(scope: string, patch: ShoppingProgressPatch): ShoppingProgress {
  const all = readAll();
  const entries = applyProgressPatch(all.scopes[scope]?.entries ?? {}, patch);
  setScope(all, scope, { entries });
  writeAll(all);
  return entries;
}

/** Sets the quests picked for one thing, or forgets the pick (null), and returns the scope's picks. */
export function setScopePick(scope: string, identity: string, quests: readonly string[] | null): ShoppingSourcePicks {
  const all = readAll();
  const picks: Record<string, readonly string[]> = { ...(all.scopes[scope]?.picks ?? {}) };
  if (quests?.length) {
    picks[identity] = [...quests];
  } else {
    delete picks[identity];
  }
  setScope(all, scope, { picks });
  writeAll(all);
  return picks;
}

/** Forgets every pick in a scope, keeping its ticks. */
export function clearScopePicks(scope: string): void {
  const all = readAll();
  setScope(all, scope, { picks: {} });
  writeAll(all);
}

/** Replaces a scope's ticks and picks, and its order when given, as when the server's copy arrives. */
export function replaceScopeProgress(scope: string, entries: ShoppingProgress, picks: ShoppingSourcePicks,
    order?: ShoppingRouteOrder | null): void {
  const all = readAll();
  setScope(all, scope, order === undefined ? { entries, picks } : { entries, picks, order });
  writeAll(all);
}

/**
 * Copies one scope's ticks, picks and order into another (the copy's own
 * win), dropping the source when `moveSource` is set.
 */
export function copyScopeProgress(from: string, to: string, moveSource: boolean): void {
  const all = readAll();
  const source = all.scopes[from];
  if (!source) {
    return;
  }
  const target = all.scopes[to];
  setScope(all, to, {
    entries: { ...source.entries, ...(target?.entries ?? {}) },
    picks: { ...(source.picks ?? {}), ...(target?.picks ?? {}) },
    order: target?.order ?? source.order ?? null,
  });
  if (moveSource) {
    delete all.scopes[from];
  }
  writeAll(all);
}

interface ScopeChanges {
  entries?: ShoppingProgress;
  picks?: ShoppingSourcePicks;
  /** null puts the route back in its default order. */
  order?: ShoppingRouteOrder | null;
}

/** Changes a scope, keeping what isn't given, or forgets it when it has nothing in it. */
function setScope(all: StoredProgress, scope: string, changes: ScopeChanges): void {
  const stored = all.scopes[scope];
  const entries = changes.entries ?? stored?.entries ?? {};
  const picks = changes.picks ?? stored?.picks ?? {};
  const order = changes.order === undefined ? stored?.order ?? null : changes.order;
  const hasPicks = Object.keys(picks).length > 0;
  const hasOrder = !!order && (order.packs.length > 0 || order.quests.length > 0);
  if (Object.keys(entries).length || hasPicks || hasOrder) {
    all.scopes[scope] = { entries, ...(hasPicks ? { picks } : {}), ...(hasOrder ? { order } : {}), updatedAt: Date.now() };
  } else {
    delete all.scopes[scope];
  }
  const byAge = Object.entries(all.scopes).sort(([, a], [, b]) => b.updatedAt - a.updatedAt);
  for (const [stale] of byAge.slice(MAX_STORED_SCOPES)) {
    delete all.scopes[stale];
  }
}

function readAll(): StoredProgress {
  try {
    const parsed = JSON.parse(localStorage.getItem(SHOPPING_PROGRESS_STORAGE_KEY) ?? 'null') as StoredProgress | null;
    if (parsed?.v === 1 && parsed.scopes && typeof parsed.scopes === 'object') {
      return parsed;
    }
  } catch {
    // Unavailable, or not ours: start over.
  }
  return { v: 1, scopes: {} };
}

function writeAll(all: StoredProgress): void {
  try {
    localStorage.setItem(SHOPPING_PROGRESS_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Storage full or unavailable: the ticks last for this visit only.
  }
}
