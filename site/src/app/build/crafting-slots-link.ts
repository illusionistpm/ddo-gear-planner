/**
 * The URL fragment saying the Equipment panel shows the crafting slots view
 * rather than the gear cards: `#crafting`. View state, so a fragment like the
 * shopping list's (see shopping-list-link.ts): the build URL codec never sees it.
 */
export const CRAFTING_SLOTS_FRAGMENT = 'crafting';

/** Whether a URL's fragment (with or without its '#') says the crafting slots view is open. */
export function isCraftingSlotsFragment(fragment: string | null | undefined): boolean {
  return (fragment ?? '').replace(/^#/, '') === CRAFTING_SLOTS_FRAGMENT;
}
