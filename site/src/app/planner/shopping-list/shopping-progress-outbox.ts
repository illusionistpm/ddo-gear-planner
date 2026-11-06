import type { BuildProgressPut } from '../../build/build-progress.service';
import type { ShoppingProgressPatch, ShoppingPublished, ShoppingRouteOrder } from './shopping-list-types';

/**
 * Progress changes made on this device and not yet confirmed by the server,
 * per saved build. Kept in localStorage so changes made offline, or just
 * before the tab closed, are sent the next time the build is open.
 *
 * Every write is "set this key to this", so sending one twice - from two
 * tabs, or after a keepalive flush whose answer nobody saw - is harmless.
 */
export const SHOPPING_OUTBOX_STORAGE_KEY = 'ddo-gear-planner-shopping-outbox';

export interface OutboxWrite {
  patch: ShoppingProgressPatch;
  picksPatch: Record<string, readonly string[] | null>;
  /** What friends should see now; absent when it hasn't changed. */
  published?: ShoppingPublished;
  /** The route's order now, null for the default; absent when it hasn't changed. */
  order?: ShoppingRouteOrder | null;
}

interface StoredOutbox {
  v: 1;
  builds: Record<string, OutboxWrite>;
}

export function readOutbox(buildId: string): OutboxWrite | null {
  return readAll().builds[buildId] ?? null;
}

/** Adds changes to a build's outbox, later ones winning key by key. */
export function addToOutbox(buildId: string, write: Partial<OutboxWrite>): void {
  const all = readAll();
  const queued = all.builds[buildId];
  all.builds[buildId] = {
    patch: { ...queued?.patch, ...write.patch },
    picksPatch: { ...queued?.picksPatch, ...write.picksPatch },
    ...(write.published ?? queued?.published ? { published: write.published ?? queued?.published } : {}),
    ...('order' in write ? { order: write.order } : queued && 'order' in queued ? { order: queued.order } : {})
  };
  writeAll(all);
}

/**
 * Forgets what the server just confirmed: each change in `sent` that is
 * still queued as it was sent. A change made while the request was out
 * stays queued.
 */
export function settleOutbox(buildId: string, sent: OutboxWrite): void {
  const all = readAll();
  const queued = all.builds[buildId];
  if (!queued) {
    return;
  }
  for (const [key, value] of Object.entries(sent.patch)) {
    if (key in queued.patch && queued.patch[key] === value) {
      delete queued.patch[key];
    }
  }
  for (const [key, value] of Object.entries(sent.picksPatch)) {
    if (key in queued.picksPatch && JSON.stringify(queued.picksPatch[key]) === JSON.stringify(value)) {
      delete queued.picksPatch[key];
    }
  }
  if (queued.published && JSON.stringify(queued.published) === JSON.stringify(sent.published)) {
    delete queued.published;
  }
  if ('order' in queued && 'order' in sent && JSON.stringify(queued.order) === JSON.stringify(sent.order)) {
    delete queued.order;
  }
  if (isEmptyWrite(queued)) {
    delete all.builds[buildId];
  }
  writeAll(all);
}

export function dropOutbox(buildId: string): void {
  const all = readAll();
  if (all.builds[buildId]) {
    delete all.builds[buildId];
    writeAll(all);
  }
}

export function isEmptyWrite(write: OutboxWrite): boolean {
  return !Object.keys(write.patch).length && !Object.keys(write.picksPatch).length && !write.published && !('order' in write);
}

/** The request body for a queued write. */
export function outboxRequestBody(write: OutboxWrite): BuildProgressPut {
  return {
    ...(Object.keys(write.patch).length ? { patch: write.patch } : {}),
    ...(Object.keys(write.picksPatch).length ? { picksPatch: write.picksPatch } : {}),
    ...(write.published ? { needed: write.published.needed, route: write.published.route } : {}),
    ...('order' in write ? { order: write.order ?? null } : {})
  };
}

function readAll(): StoredOutbox {
  try {
    const parsed = JSON.parse(localStorage.getItem(SHOPPING_OUTBOX_STORAGE_KEY) ?? 'null') as StoredOutbox | null;
    if (parsed?.v === 1 && parsed.builds && typeof parsed.builds === 'object') {
      return parsed;
    }
  } catch {
    // Unavailable, or not ours: start over.
  }
  return { v: 1, builds: {} };
}

function writeAll(all: StoredOutbox): void {
  try {
    if (Object.keys(all.builds).length) {
      localStorage.setItem(SHOPPING_OUTBOX_STORAGE_KEY, JSON.stringify(all));
    } else {
      localStorage.removeItem(SHOPPING_OUTBOX_STORAGE_KEY);
    }
  } catch {
    // Storage full or unavailable: the change stays in this browser's
    // progress (if that could be stored) and isn't synced.
  }
}
