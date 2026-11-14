import { Injectable } from '@angular/core';

import { isShoppingListFragment, SHOPPING_LIST_FRAGMENT } from '../../build/shopping-list-link';
import { FragmentViewService } from '../fragment-view';

/** What opened a list: a button, a URL saying it's open (a reload, say), or a friend's link to a build's. */
export type ShoppingListEntryPoint = 'toolbar' | 'menu' | 'url' | 'friend_link' | 'wrap_up';

/**
 * Whether your shopping list has taken the planner's place on screen. The
 * URL's fragment says so (see shopping-list-link.ts and FragmentViewService),
 * and Back returns to the planner, as the list's own Planner button does.
 */
@Injectable({ providedIn: 'root' })
export class ShoppingListViewService extends FragmentViewService<ShoppingListEntryPoint> {
  constructor() {
    super(SHOPPING_LIST_FRAGMENT, isShoppingListFragment);
  }
}
