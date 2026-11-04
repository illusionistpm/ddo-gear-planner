import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { convertToParamMap } from '@angular/router';
import { Observable, of, Subject } from 'rxjs';
import { catchError, map, scan, startWith, switchMap } from 'rxjs/operators';

import { BuildProgressService } from '../../build/build-progress.service';
import { BuildUrlCodecService } from '../../build/build-url-codec.service';
import { BuildsService } from '../../build/builds.service';
import { EssenceCraftingService } from '../../gear/essence-crafting.service';
import { GearDbService } from '../../gear/gear-db.service';
import { QuestService } from '../../gear/quest.service';
import { slotsFromParams } from '../slots-from-params';
import { deriveShoppingEntries, ShoppingSourceLookup } from './shopping-list-entries';
import type { ShoppingEntry, ShoppingListView, ShoppingProgress, ShoppingRouteOrder, ShoppingSourcePicks } from './shopping-list-types';
import { buildShoppingListView } from './shopping-list-view-model';

/** How often a friend can fetch a build's list again. The worker caches it for 15 s. */
export const FRIEND_REFRESH_INTERVAL_MS = 30000;

/** A saved build, read for a friend's list without loading it into the planner. */
export type FriendBuild =
  | { status: 'loading' }
  | { status: 'ready'; name: string; entries: ShoppingEntry[] }
  /** Not found (or private); a blob this client can't read; or anything else, which may come right on retry. */
  | { status: 'error'; error: 'not-found' | 'invalid-link' | 'network' };

export interface FriendShoppingList {
  /** What's still needed, by quest; null while the owner's list is loading. */
  view: ShoppingListView | null;
  /** How many things are still needed. */
  needed: number;
  /** The owner hasn't shared a list for this build: everything it needs is listed. */
  notShared: boolean;
  /** The owner's list couldn't be fetched. */
  failed: boolean;
}

/** What the owner's list says is still needed, and where it sends you for each. */
interface Shared {
  isNeeded: (key: string) => boolean;
  /** In the shape of picks, so the list routes things as the owner's does. */
  route: ShoppingSourcePicks;
  /** The order the owner arranged it in, if they did. */
  order: ShoppingRouteOrder | undefined;
  notShared: boolean;
}

const EVERYTHING: Shared = { isNeeded: () => true, route: {}, order: undefined, notShared: true };

/** The last list fetched (null before the first arrives), and whether the latest fetch failed. */
interface Fetched {
  shared: Shared | null;
  failed: boolean;
}

/**
 * A friend's read-only view of what a saved build still needs (see
 * StillNeededPageComponent): the build's own entries, cut down to those the
 * owner last published as still needed, routed and arranged as the owner's
 * list is.
 *
 * Touches nothing of the planner's or the friend's own: not the equipped
 * gear, progress, picks or the server's copy.
 */
@Injectable({ providedIn: 'root' })
export class FriendShoppingListService {
  private readonly refreshSubject = new Subject<void>();
  private readonly sources: ShoppingSourceLookup;
  private lastFetchAt = 0;

  constructor(
    private readonly builds: BuildsService,
    private readonly codec: BuildUrlCodecService,
    private readonly gearDb: GearDbService,
    private readonly essenceCrafting: EssenceCraftingService,
    private readonly api: BuildProgressService,
    quests: QuestService
  ) {
    this.sources = { isRaid: quest => quests.isRaid(quest), packOf: quest => quests.getPack(quest) };
  }

  /** The saved build and everything its gear needs. */
  build(shortId: string): Observable<FriendBuild> {
    return this.builds.getByShortId(shortId).pipe(
      map(({ name, blob }): FriendBuild => {
        const decoded = this.codec.decode(blob);
        if (!decoded) {
          return { status: 'error', error: 'invalid-link' };
        }
        const slots = slotsFromParams(convertToParamMap(decoded), this.gearDb, this.essenceCrafting);
        return { status: 'ready', name, entries: deriveShoppingEntries(slots, this.sources) };
      }),
      catchError((err: HttpErrorResponse) => of<FriendBuild>({ status: 'error', error: err.status === 404 ? 'not-found' : 'network' })),
      startWith<FriendBuild>({ status: 'loading' })
    );
  }

  /** What's still needed of these entries, the build's, as its owner's list last said; again on each refresh(). */
  list(shortId: string, entries: readonly ShoppingEntry[]): Observable<FriendShoppingList> {
    return this.refreshSubject.pipe(
      startWith(undefined),
      switchMap(() => this.fetch(shortId)),
      // A failed Refresh keeps the list it had, saying it couldn't update it.
      scan((last: Fetched, shared: Shared | null) => shared ? { shared, failed: false } : { shared: last.shared, failed: true },
        { shared: null, failed: false }),
      startWith<Fetched>({ shared: null, failed: false }),
      map(({ shared, failed }): FriendShoppingList => {
        if (!shared) {
          return { view: null, needed: 0, notShared: false, failed };
        }
        const view = buildShoppingListView(entries, progressOf(entries, shared), null,
          { filter: 'needed', picks: shared.route, order: shared.order });
        return { view, needed: view.total - view.acquired, notShared: shared.notShared, failed };
      })
    );
  }

  /** When Refresh may fetch the list again, as a Date.now() time. */
  get nextRefreshAt(): number {
    return this.lastFetchAt + FRIEND_REFRESH_INTERVAL_MS;
  }

  /** Fetches the list again, unless it was fetched too recently. Says whether it did. */
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
        const order = published.order ?? undefined;
        if (published.needed === null) {
          return { ...EVERYTHING, order };
        }
        const needed = new Set(published.needed);
        return { isNeeded: key => needed.has(key), route: published.route, order, notShared: false };
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
