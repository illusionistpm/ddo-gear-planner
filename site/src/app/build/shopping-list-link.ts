/**
 * The shopping list's URL fragments. View state rides in the fragment,
 * never in query keys: the build URL codec never sees it, it never reaches
 * a server, and build URLs stay exactly as they were.
 *
 * - `#shopping-list`: your own list, open.
 * - `#still-needed`: a friend's view of a saved build's list, live - what's
 *   still needed comes from the server, as the owner last published it.
 */

export type ShoppingListLink = { kind: 'own' } | { kind: 'live' };

const OWN = 'shopping-list';
const STILL_NEEDED = 'still-needed';

/** The fragment, without its '#', for a link. */
export function shoppingListFragment(link: ShoppingListLink): string {
  return link.kind === 'own' ? OWN : STILL_NEEDED;
}

/** The link a URL's fragment (with or without its '#') stands for, or null when it isn't one. */
export function parseShoppingListFragment(fragment: string | null | undefined): ShoppingListLink | null {
  const text = (fragment ?? '').replace(/^#/, '');
  if (text === OWN) {
    return { kind: 'own' };
  }
  return text === STILL_NEEDED ? { kind: 'live' } : null;
}
