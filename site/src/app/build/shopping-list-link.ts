/**
 * The shopping list's URL fragments. View state rides in the fragment,
 * never in query keys: the build URL codec never sees it, it never reaches
 * a server, and build URLs stay exactly as they were.
 *
 * - `#shopping-list`: your own list, open.
 * - `#still-needed`: a friend's view of a saved build's list, live - what's
 *   still needed comes from the server, as the owner last published it.
 * - `#still-needed:1.<hash>.<hash>…`: a friend's view as a snapshot, for a
 *   build with no server copy (a short or long link). The hashes are of
 *   the still-needed entry keys, so the link stays short and says nothing
 *   readable about the build beyond what its gear already does.
 *
 * Every link that has ever been shared must keep parsing: a snapshot's
 * version prefix is there so its format can change without breaking them.
 */

export type ShoppingListLink =
  | { kind: 'own' }
  | { kind: 'live' }
  | { kind: 'snapshot'; hashes: ReadonlySet<string> };

const OWN = 'shopping-list';
const STILL_NEEDED = 'still-needed';
const SNAPSHOT_VERSION = '1';

/** The fragment, without its '#', for a link. */
export function shoppingListFragment(link: ShoppingListLink): string {
  switch (link.kind) {
    case 'own':
      return OWN;
    case 'live':
      return STILL_NEEDED;
    case 'snapshot':
      return [`${STILL_NEEDED}:${SNAPSHOT_VERSION}`, ...[...link.hashes].sort()].join('.');
  }
}

/** A snapshot link of these still-needed entry keys. */
export function snapshotLink(neededKeys: Iterable<string>): ShoppingListLink {
  return { kind: 'snapshot', hashes: new Set([...neededKeys].map(hashNeededKey)) };
}

/**
 * The link a URL's fragment (with or without its '#') stands for, or null
 * when it isn't one - including a snapshot of a version this code doesn't
 * know, which leaves the planner showing the build.
 */
export function parseShoppingListFragment(fragment: string | null | undefined): ShoppingListLink | null {
  const text = decodeFragment((fragment ?? '').replace(/^#/, ''));
  if (text === OWN) {
    return { kind: 'own' };
  }
  if (text === STILL_NEEDED) {
    return { kind: 'live' };
  }
  const prefix = `${STILL_NEEDED}:${SNAPSHOT_VERSION}`;
  if (text !== prefix && !text.startsWith(`${prefix}.`)) {
    return null;
  }
  const hashes = text.slice(prefix.length).split('.').filter(Boolean);
  return hashes.every(hash => /^[0-9a-z]{1,7}$/.test(hash)) ? { kind: 'snapshot', hashes: new Set(hashes) } : null;
}

/** FNV-1a 32-bit over the key's UTF-8 bytes, in base 36. Part of the snapshot format: never change it. */
export function hashNeededKey(key: string): string {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(key)) {
    hash = Math.imul(hash ^ byte, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function decodeFragment(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}
