import { inject, Injectable, OnDestroy } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { distinctUntilChanged, filter, map } from 'rxjs/operators';

import { urlFragmentOf } from '../../build/build-route';
import { CurrentBuildService } from '../../build/current-build.service';
import { QueryParamsService } from '../../build/query-params.service';
import { parseShoppingListFragment, ShoppingListLink, shoppingListFragment } from '../../build/shopping-list-link';

/** What opened the list: a button, a URL saying it's open (a reload, say), or a friend's link. */
export type ShoppingListEntryPoint = 'toolbar' | 'menu' | 'url' | 'friend_link';

/** A friend's view of the list: live from the server, or a snapshot carried in the link. */
export type FriendShoppingListLink = Exclude<ShoppingListLink, { kind: 'own' }>;

/**
 * Whether the shopping list has taken the planner's place on screen, and
 * whose: your own, or a friend's view of what's still needed. The URL's
 * fragment says which (see shopping-list-link.ts), so a reload comes back
 * to it, a friend's link opens it, and the app's own URL writes (edits,
 * saves, signing in) keep it.
 *
 * A friend's link to a build of yours opens your own list instead, which
 * says more: opened by its owner, or once a friend saves a copy.
 */
@Injectable({ providedIn: 'root' })
export class ShoppingListViewService implements OnDestroy {
  private readonly router = inject(Router);
  private readonly queryParams = inject(QueryParamsService);
  private readonly currentBuild = inject(CurrentBuildService);
  private readonly linkSubject = new BehaviorSubject<ShoppingListLink | null>(null);
  /** The list on screen, or null for the planner. */
  readonly link$: Observable<ShoppingListLink | null> = this.linkSubject.pipe(distinctUntilChanged(sameLink));
  readonly isOpen$: Observable<boolean> = this.link$.pipe(map(link => link !== null), distinctUntilChanged());
  /** What opened the list last, for analytics. */
  openedFrom: ShoppingListEntryPoint | null = null;
  private readonly subscriptions = new Subscription();

  constructor() {
    this.followUrl();
    this.subscriptions.add(this.router.events.pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => this.followUrl()));
    this.subscriptions.add(this.currentBuild.state$.subscribe(() => this.collapseFriendLinkIfYours()));
  }

  get isOpen(): boolean {
    return this.linkSubject.value !== null;
  }

  get link(): ShoppingListLink | null {
    return this.linkSubject.value;
  }

  /** Opens your own list. */
  open(from: ShoppingListEntryPoint): void {
    this.openedFrom = from;
    this.show({ kind: 'own' });
  }

  close(): void {
    this.linkSubject.next(null);
    this.queryParams.writeViewFragment(null, true);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private show(link: ShoppingListLink): void {
    this.linkSubject.next(link);
    this.queryParams.writeViewFragment(shoppingListFragment(link), true);
  }

  private followUrl(): void {
    const link = parseShoppingListFragment(urlFragmentOf(this.router.url));
    if (link && !sameLink(link, this.linkSubject.value)) {
      this.openedFrom = link.kind === 'own' ? 'url' : 'friend_link';
    }
    this.linkSubject.next(link);
    this.collapseFriendLinkIfYours();
  }

  private collapseFriendLinkIfYours(): void {
    const link = this.linkSubject.value;
    if (link && link.kind !== 'own' && this.currentBuild.value.ownership === 'owned') {
      this.show({ kind: 'own' });
    }
  }
}

function sameLink(a: ShoppingListLink | null, b: ShoppingListLink | null): boolean {
  return a === b || (a !== null && b !== null && shoppingListFragment(a) === shoppingListFragment(b));
}
