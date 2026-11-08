import { Location } from '@angular/common';
import { inject, Injectable, OnDestroy } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { distinctUntilChanged, filter } from 'rxjs/operators';

import { urlFragmentOf, urlWithoutFragment } from '../../build/build-route';
import { QueryParamsService } from '../../build/query-params.service';
import { isShoppingListFragment, SHOPPING_LIST_FRAGMENT } from '../../build/shopping-list-link';

/** What opened a list: a button, a URL saying it's open (a reload, say), or a friend's link to a build's. */
export type ShoppingListEntryPoint = 'toolbar' | 'menu' | 'url' | 'friend_link' | 'wrap_up';

/**
 * Whether your shopping list has taken the planner's place on screen. The
 * URL's fragment says so (see shopping-list-link.ts), so a reload comes back
 * to it and the app's own URL writes (edits, saves, signing in) keep it.
 *
 * Opening the list is a step in the browser's history, so Back (the
 * browser's, or Android's) returns to the planner, as the list's own
 * Planner button does. Opened from the URL there's no step to go back to,
 * so closing just takes the fragment off.
 */
@Injectable({ providedIn: 'root' })
export class ShoppingListViewService implements OnDestroy {
  private readonly router = inject(Router);
  private readonly queryParams = inject(QueryParamsService);
  private readonly location = inject(Location);
  private readonly openSubject = new BehaviorSubject<boolean>(false);
  readonly isOpen$: Observable<boolean> = this.openSubject.pipe(distinctUntilChanged());
  /** What opened the list last, for analytics. */
  openedFrom: ShoppingListEntryPoint | null = null;
  private readonly subscription: Subscription;
  /**
   * The URL open() added to history, while it's still the current one. Saving
   * with the list open replaces it with the saved build's, so Back would then
   * leave the build rather than close the list.
   */
  private pushedUrl: string | null = null;

  constructor() {
    this.followUrl();
    this.subscription = this.router.events.pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => this.followUrl());
  }

  get isOpen(): boolean {
    return this.openSubject.value;
  }

  open(from: ShoppingListEntryPoint): void {
    this.openedFrom = from;
    this.openSubject.next(true);
    if (this.queryParams.writeViewFragment(SHOPPING_LIST_FRAGMENT, false)) {
      this.pushedUrl = `${urlWithoutFragment(this.router.url)}#${SHOPPING_LIST_FRAGMENT}`;
    }
  }

  close(): void {
    this.openSubject.next(false);
    const pushed = this.pushedUrl !== null && this.pushedUrl === this.router.url;
    this.pushedUrl = null;
    if (pushed) {
      this.location.back();
    } else {
      this.queryParams.writeViewFragment(null, true);
    }
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  private followUrl(): void {
    const open = isShoppingListFragment(urlFragmentOf(this.router.url));
    if (open && !this.isOpen) {
      this.openedFrom = 'url';
    }
    this.openSubject.next(open);
  }
}
