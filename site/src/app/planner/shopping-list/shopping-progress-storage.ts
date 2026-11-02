import type { ShoppingProgress, ShoppingProgressPatch, ShoppingSourcePicks } from './shopping-list-types';
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

/** Whether a scope has anything stored: ticks or picks. */
export function hasScopeProgress(scope: string): boolean {
  return readAll().scopes[scope] !== undefined;
}

/** Applies a patch to a scope's stored ticks and returns the result. */
export function patchScopeProgress(scope: string, patch: ShoppingProgressPatch): ShoppingProgress {
  const all = readAll();
  const entries = applyProgressPatch(all.scopes[scope]?.entries ?? {}, patch);
  setScope(all, scope, entries, all.scopes[scope]?.picks ?? {});
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
  setScope(all, scope, all.scopes[scope]?.entries ?? {}, picks);
  writeAll(all);
  return picks;
}

/** Forgets every pick in a scope, keeping its ticks. */
export function clearScopePicks(scope: string): void {
  const all = readAll();
  setScope(all, scope, all.scopes[scope]?.entries ?? {}, {});
  writeAll(all);
}

/** Replaces a scope's ticks and picks, as when the server's copy arrives. */
export function replaceScopeProgress(scope: string, entries: ShoppingProgress, picks: ShoppingSourcePicks): void {
  const all = readAll();
  setScope(all, scope, entries, picks);
  writeAll(all);
}

/**
 * Copies one scope's ticks and picks into another (the copy's own win),
 * dropping the source when `moveSource` is set.
 */
export function copyScopeProgress(from: string, to: string, moveSource: boolean): void {
  const all = readAll();
  const source = all.scopes[from];
  if (!source) {
    return;
  }
  const target = all.scopes[to];
  setScope(all, to, { ...source.entries, ...(target?.entries ?? {}) }, { ...(source.picks ?? {}), ...(target?.picks ?? {}) });
  if (moveSource) {
    delete all.scopes[from];
  }
  writeAll(all);
}

/** Stores a scope, or forgets it when it has nothing in it. */
function setScope(all: StoredProgress, scope: string, entries: ShoppingProgress, picks: ShoppingSourcePicks): void {
  const hasPicks = Object.keys(picks).length > 0;
  if (Object.keys(entries).length || hasPicks) {
    all.scopes[scope] = { entries, ...(hasPicks ? { picks } : {}), updatedAt: Date.now() };
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
