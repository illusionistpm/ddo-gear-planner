import { Injectable } from '@angular/core';
import { combineLatest, Observable, of, Subject } from 'rxjs';
import { catchError, distinctUntilChanged, map, scan, startWith, switchMap } from 'rxjs/operators';

import { BuildProgressService } from '../../build/build-progress.service';
import { CurrentBuildService } from '../../build/current-build.service';
import { hashNeededKey } from '../../build/shopping-list-link';
import { FiltersService } from '../filters.service';
import type { FriendShoppingListLink } from './shopping-list-view.service';
import type { ShoppingEntry, ShoppingListView, ShoppingProgress, ShoppingSourcePicks } from './shopping-list-types';
import { buildShoppingListView } from './shopping-list-view-model';
import { ShoppingListService } from './shopping-list.service';

/** How often a friend can fetch a live list again. The worker caches it for 15 s. */
export const FRIEND_REFRESH_INTERVAL_MS = 30000;

export interface FriendShoppingList {
  /** What's still needed, by quest; null while a live list is loading. */
  view: ShoppingListView | null;
  /** How many things are still needed. */
  needed: number;
  /** A live list, which Refresh fetches again; else a snapshot carried in the link. */
  live: boolean;
  /** The owner hasn't shared a list for this build: everything it needs is listed. */
  notShared: boolean;
  /** A live list that couldn't be fetched. */
  failed: boolean;
}

/** What the link says is still needed, and where the owner's list sends you for each. */
interface Shared {
  isNeeded: (key: string) => boolean;
  /** In the shape of picks, so the list routes things as the owner's does. */
  route: ShoppingSourcePicks;
  notShared: boolean;
}

const EVERYTHING: Shared = { isNeeded: () => true, route: {}, notShared: true };

/** The last list fetched (null before the first arrives), and whether the latest fetch failed. */
interface Fetched {
  shared: Shared | null;
  failed: boolean;
}

/**
 * A friend's read-only view of what a build still needs, from a link to
 * the owner's list (see shopping-list-link.ts). The build's own entries,
 * cut down to those still needed:
 *
 * - live: the owner's list as last published, routed as theirs is;
 * - snapshot: the entries the link's hashes name, routed as the friend's
 *   own list would route them, since the link carries no route.
 *
 * Read only: nothing here touches progress, picks or the server's copy.
 */
@Injectable({ providedIn: 'root' })
export class FriendShoppingListService {
  private readonly refreshSubject = new Subject<void>();
  private lastFetchAt = 0;

  constructor(
    private readonly shoppingList: ShoppingListService,
    private readonly currentBuild: CurrentBuildService,
    private readonly api: BuildProgressService,
    private readonly filters: FiltersService
  ) { }

  listFor(link: FriendShoppingListLink): Observable<FriendShoppingList> {
    const fetched$: Observable<Fetched> = link.kind === 'snapshot'
      ? of({ shared: { isNeeded: key => link.hashes.has(hashNeededKey(key)), route: {}, notShared: false }, failed: false })
      : this.currentBuild.state$.pipe(
        map(state => state.shortId),
        distinctUntilChanged(),
        switchMap(shortId => shortId === null
          // Not a saved build, so nothing on the server: list everything.
          ? of({ shared: EVERYTHING, failed: false })
          : this.refreshSubject.pipe(
            startWith(undefined),
            switchMap(() => this.fetch(shortId)),
            // A failed Refresh keeps the list it had, saying it couldn't update it.
            scan((last: Fetched, shared: Shared | null) => shared ? { shared, failed: false } : { shared: last.shared, failed: true },
              { shared: null, failed: false }),
            startWith({ shared: null, failed: false }))));
    const hiddenPacks$ = this.filters.getItemFilters().pipe(map(itemFilters => itemFilters.hiddenPacks), distinctUntilChanged());

    return combineLatest([this.shoppingList.entries$, fetched$, hiddenPacks$]).pipe(
      map(([entries, { shared, failed }, hiddenPacks]): FriendShoppingList => {
        const live = link.kind === 'live';
        if (!shared) {
          return { view: null, needed: 0, live, notShared: false, failed };
        }
        const view = buildShoppingListView(entries, progressOf(entries, shared), null,
          { filter: 'needed', hiddenPacks, picks: shared.route });
        return { view, needed: view.total - view.acquired, live, notShared: shared.notShared, failed };
      })
    );
  }

  /** When Refresh may fetch a live list again, as a Date.now() time. */
  get nextRefreshAt(): number {
    return this.lastFetchAt + FRIEND_REFRESH_INTERVAL_MS;
  }

  /** Fetches a live list again, unless it was fetched too recently. Says whether it did. */
  refresh(): boolean {
    if (Date.now() < this.nextRefreshAt) {
      return false;
    }
    this.refreshSubject.next();
    return true;
  }

  /** The owner's list as published, or null when it couldn't be fetched. */
  private fetch(shortId: string): Observable<Shared | null> {
    this.lastFetchAt = Date.now();
    return this.api.getPublic(shortId).pipe(
      map((published): Shared => {
        if (published.needed === null) {
          return EVERYTHING;
        }
        const needed = new Set(published.needed);
        return { isNeeded: key => needed.has(key), route: published.route, notShared: false };
      }),
      catchError(() => {
        // Nothing came back to cache, so Refresh may try again at once.
        this.lastFetchAt = 0;
        return of(null);
      })
    );
  }
}

/** Every entry not still needed counts as got, so the 'needed' filter leaves only what is. */
function progressOf(entries: readonly ShoppingEntry[], shared: Shared): ShoppingProgress {
  return Object.fromEntries(entries.filter(entry => !shared.isNeeded(entry.key)).map(entry => [entry.key, 1 as const]));
}
