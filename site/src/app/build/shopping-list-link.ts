/**
 * The URL fragment saying your shopping list is open: `#shopping-list`.
 * View state rides in the fragment, never in query keys: the build URL
 * codec never sees it, it never reaches a server, and build URLs stay
 * exactly as they were.
 *
 * A friend's view of a build's list is a page of its own (stillNeededPath),
 * not a fragment: it never loads the build into the planner.
 */
export const SHOPPING_LIST_FRAGMENT = 'shopping-list';

/** Whether a URL's fragment (with or without its '#') says the list is open. */
export function isShoppingListFragment(fragment: string | null | undefined): boolean {
  return (fragment ?? '').replace(/^#/, '') === SHOPPING_LIST_FRAGMENT;
}
