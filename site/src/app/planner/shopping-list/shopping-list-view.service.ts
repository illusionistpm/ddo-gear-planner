import { inject, Injectable, OnDestroy } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { distinctUntilChanged, filter } from 'rxjs/operators';

import { urlFragmentOf } from '../../build/build-route';
import { QueryParamsService } from '../../build/query-params.service';

/** What opened the list: a button, or a URL saying it's open (a reload, say). */
export type ShoppingListEntryPoint = 'toolbar' | 'menu' | 'url';

const SHOPPING_LIST_FRAGMENT = 'shopping-list';

/**
 * Whether the shopping list has taken the planner's place on screen. The
 * URL's fragment says so - '#shopping-list' - so a reload comes back to the
 * list, and the app's own URL writes (edits, saves, signing in) keep it.
 */
@Injectable({ providedIn: 'root' })
export class ShoppingListViewService implements OnDestroy {
  private readonly router = inject(Router);
  private readonly queryParams = inject(QueryParamsService);
  private readonly openSubject = new BehaviorSubject(false);
  readonly isOpen$: Observable<boolean> = this.openSubject.pipe(distinctUntilChanged());
  /** What opened the list last, for analytics. */
  openedFrom: ShoppingListEntryPoint | null = null;
  private readonly subscription: Subscription;

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
    this.queryParams.writeViewFragment(SHOPPING_LIST_FRAGMENT, true);
  }

  close(): void {
    this.openSubject.next(false);
    this.queryParams.writeViewFragment(null, true);
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  private followUrl(): void {
    const open = urlFragmentOf(this.router.url) === `#${SHOPPING_LIST_FRAGMENT}`;
    if (open && !this.isOpen) {
      this.openedFrom = 'url';
    }
    this.openSubject.next(open);
  }
}
