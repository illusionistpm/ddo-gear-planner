import type { ShoppingProgress, ShoppingProgressPatch } from './shopping-list-types';
import { applyProgressPatch } from './shopping-list-view-model';

/**
 * Shopping-list ticks, kept in this browser per build ("scope"). Never part of
 * the build itself: ticking things off mustn't change a build's URL, mark it
 * unsaved, or travel with a shared link.
 *
 * Every write re-reads storage and changes only the keys it was given, so two
 * tabs ticking different things don't undo each other.
 */
export const SHOPPING_PROGRESS_STORAGE_KEY = 'ddo-gear-planner-shopping-progress';

/** Builds remembered, the least recently changed forgotten first. */
export const MAX_STORED_SCOPES = 30;

interface StoredScope {
  entries: ShoppingProgress;
  updatedAt: number;
}

interface StoredProgress {
  v: 1;
  scopes: Record<string, StoredScope>;
}

export function readScopeProgress(scope: string): ShoppingProgress {
  return readAll().scopes[scope]?.entries ?? {};
}

export function hasScopeProgress(scope: string): boolean {
  return Object.keys(readScopeProgress(scope)).length > 0;
}

/** Applies a patch to a scope's stored ticks and returns the result. */
export function patchScopeProgress(scope: string, patch: ShoppingProgressPatch): ShoppingProgress {
  const all = readAll();
  const entries = applyProgressPatch(all.scopes[scope]?.entries ?? {}, patch);
  setScope(all, scope, entries);
  writeAll(all);
  return entries;
}

/**
 * Copies one scope's ticks into another (the copy's own ticks win), dropping
 * the source when `moveSource` is set.
 */
export function copyScopeProgress(from: string, to: string, moveSource: boolean): void {
  const all = readAll();
  const source = all.scopes[from]?.entries;
  if (!source || !Object.keys(source).length) {
    return;
  }
  setScope(all, to, { ...source, ...(all.scopes[to]?.entries ?? {}) });
  if (moveSource) {
    delete all.scopes[from];
  }
  writeAll(all);
}

function setScope(all: StoredProgress, scope: string, entries: ShoppingProgress): void {
  if (Object.keys(entries).length) {
    all.scopes[scope] = { entries, updatedAt: Date.now() };
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
