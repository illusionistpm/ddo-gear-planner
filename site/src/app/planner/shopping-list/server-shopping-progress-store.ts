import { inject, Injectable, InjectionToken, OnDestroy } from '@angular/core';
import { BehaviorSubject, firstValueFrom, Observable, Subscription } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';

import { BuildProgressService, buildProgressFailureOf, OwnBuildProgress } from '../../build/build-progress.service';
import { CurrentBuildService } from '../../build/current-build.service';
import { AuthService } from '../../shared/auth.service';
import type {
  ShoppingProgress, ShoppingProgressPatch, ShoppingPublished, ShoppingSourcePicks
} from './shopping-list-types';
import { applyProgressPatch } from './shopping-list-view-model';
import {
  addToOutbox, dropOutbox, isEmptyWrite, outboxRequestBody, OutboxWrite, readOutbox, settleOutbox
} from './shopping-progress-outbox';
import { readScopePicks, readScopeProgress } from './shopping-progress-storage';
import {
  LocalShoppingProgressStore, shoppingProgressScope, ShoppingProgressStore, ShoppingSyncState
} from './shopping-progress-store';

export interface ShoppingSyncTiming {
  /** Quiet time after a change before it's sent, so a burst of ticks is one request. */
  debounceMs: number;
  /**
   * Waits after successive failures to reach the server. After the last,
   * it's tried again only when the user comes back to the page or changes
   * something, so a tab left open on a dead connection goes quiet.
   */
  backoffMs: readonly number[];
  /** On focus, the server's copy is read again if it's older than this. */
  refetchAfterMs: number;
}

/** Specs replace this, so they can run on real timers without waiting. */
export const SHOPPING_SYNC_TIMING = new InjectionToken<ShoppingSyncTiming>('ShoppingSyncTiming', {
  providedIn: 'root',
  factory: () => ({ debounceMs: 2000, backoffMs: [5000, 15000, 60000], refetchAfterMs: 60000 })
});

const SAVED_SCOPE_PREFIX = 'saved:';

/**
 * Keeps a saved build's ticks and picks on the server too, so they follow
 * the owner to other devices, and publishes what's still needed for
 * friends' links. Everything else (drafts, other people's builds, signed
 * out) stays in this browser only, exactly as LocalShoppingProgressStore
 * keeps it.
 *
 * Changes land locally at once and go to an outbox; the outbox is sent
 * after a quiet spell, one request at a time. The server's answer becomes
 * the local copy, with anything still queued laid over it.
 *
 * Nothing runs on a timer while idle. Reads happen when a saved build
 * becomes current and when the page is focused or shown again with the
 * last read stale. Hiding the page sends what's queued without waiting out
 * the quiet spell, and closing it sends it once more with keepalive, in
 * case that didn't land.
 * Failures:
 * - too soon after the last write: retry when the server says;
 * - unreachable: retry after a growing wait, a few times, then when the
 *   user comes back to the page;
 * - daily cap, a refused token, not the owner, or a write the server
 *   refuses: stop syncing this build until it's opened again, keeping
 *   everything on this device.
 */
@Injectable({ providedIn: 'root' })
export class ServerShoppingProgressStore extends ShoppingProgressStore implements OnDestroy {
  private readonly local = inject(LocalShoppingProgressStore);
  private readonly api = inject(BuildProgressService);
  private readonly auth = inject(AuthService);
  private readonly timing = inject(SHOPPING_SYNC_TIMING);

  private readonly syncStateSubject = new BehaviorSubject<ShoppingSyncState>('off');
  readonly syncState$: Observable<ShoppingSyncState> = this.syncStateSubject.pipe(distinctUntilChanged());
  readonly progress$ = this.local.progress$;
  readonly picks$ = this.local.picks$;

  /** The saved build being synced, or null when the current build isn't one of yours. */
  private buildId: string | null = null;
  private lastScope: string | null = null;
  /**
   * The scope this build was known by before it turned out to be yours, if
   * any: its ticks there are merged into the server's copy on the first read.
   */
  private carriedFrom: string | null = null;
  /** Syncing stopped for this build until it's opened again; everything stays on this device. */
  private halted = false;
  private busy = false;
  private fetchWanted = false;
  /** The quiet spell after the last change has passed. */
  private flushDue = false;
  private failures = 0;
  private lastFetchAt = 0;
  /** What friends see, as last sent or read, to skip sending it again. */
  private publishedJson: string | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  /** The token the last request went with, for a keepalive flush that can't wait for one. */
  private lastToken: string | null = null;
  private readonly subscription: Subscription;
  /** The user came back to the page: catch up with other devices, and retry if the last try failed. */
  private readonly onReturn = () => {
    if (!this.buildId) {
      return;
    }
    if (Date.now() - this.lastFetchAt >= this.timing.refetchAfterMs) {
      this.fetchWanted = true;
      this.pump();
    } else if (this.failures > 0) {
      this.flushDue = true;
      this.pump();
    }
  };
  private readonly onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      this.onReturn();
    } else if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
      this.flushDue = true;
      this.pump();
    }
  };
  private readonly onPageHide = () => {
    const queued = this.buildId && !this.halted ? readOutbox(this.buildId) : null;
    if (this.buildId && this.lastToken && queued && !isEmptyWrite(queued)) {
      // Not settled: nothing will see the answer. The outbox sends it again
      // next visit, which is harmless - every write is "set this to that".
      this.api.flushWithKeepalive(this.buildId, outboxRequestBody(queued), this.lastToken);
    }
  };

  constructor() {
    super();
    this.subscription = inject(CurrentBuildService).state$.subscribe(state => this.changeBuild(shoppingProgressScope(state)));
    window.addEventListener('focus', this.onReturn);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('pagehide', this.onPageHide);
  }

  get progress(): ShoppingProgress {
    return this.local.progress;
  }

  get picks(): ShoppingSourcePicks {
    return this.local.picks;
  }

  get scope(): string {
    return this.local.scope;
  }

  applyPatch(patch: ShoppingProgressPatch): void {
    if (!Object.keys(patch).length) {
      return;
    }
    this.local.applyPatch(patch);
    this.queue({ patch });
  }

  setPick(identity: string, quests: readonly string[] | null): void {
    this.local.setPick(identity, quests);
    this.queue({ picksPatch: { [identity]: quests?.length ? [...quests] : null } });
  }

  clearPicks(): void {
    const forgotten = Object.fromEntries(Object.keys(this.local.picks).map(identity => [identity, null]));
    this.local.clearPicks();
    if (Object.keys(forgotten).length) {
      this.queue({ picksPatch: forgotten });
    }
  }

  publish(published: ShoppingPublished): void {
    // Another tab's tick redraws this tab's list too, which offers this
    // tab's copy - its own route, from when its list opened. Only the tab
    // in use says what friends see: otherwise every tick is sent from each
    // open tab, and the second is throttled. A tick is published as it's
    // made, while its tab is still visible.
    if (document.visibilityState === 'hidden') {
      return;
    }
    const json = JSON.stringify(published);
    if (!this.buildId || json === this.publishedJson) {
      return;
    }
    this.publishedJson = json;
    this.queue({ published });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.subscription.unsubscribe();
    window.removeEventListener('focus', this.onReturn);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('pagehide', this.onPageHide);
    this.clearTimers();
  }

  private changeBuild(scope: string): void {
    const previous = this.lastScope;
    this.lastScope = scope;
    const buildId = scope.startsWith(SAVED_SCOPE_PREFIX) ? scope.slice(SAVED_SCOPE_PREFIX.length) : null;
    if (buildId === this.buildId) {
      return;
    }
    this.carriedFrom = buildId && previous?.startsWith('build:') ? previous : null;
    this.clearTimers();
    this.buildId = buildId;
    this.halted = false;
    this.failures = 0;
    this.flushDue = false;
    this.publishedJson = null;
    this.fetchWanted = buildId !== null;
    this.pump();
  }

  private queue(write: Partial<OutboxWrite>): void {
    if (!this.buildId) {
      return;
    }
    addToOutbox(this.buildId, write);
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushDue = true;
      this.pump();
    }, this.timing.debounceMs);
    this.updateSyncState();
  }

  /** Starts the next request, if one is wanted and none is out. */
  private pump(): void {
    this.updateSyncState();
    if (!this.buildId || this.busy || this.retryTimer || this.halted || this.destroyed) {
      return;
    }
    if (this.fetchWanted) {
      void this.fetch(this.buildId);
      return;
    }
    const queued = readOutbox(this.buildId);
    if (this.flushDue && queued && !isEmptyWrite(queued)) {
      void this.send(this.buildId, queued);
    }
  }

  private async fetch(buildId: string): Promise<void> {
    await this.request(buildId, () => this.api.getOwn(buildId), doc => {
      this.fetchWanted = false;
      this.lastFetchAt = Date.now();
      if (doc.updatedAt === null && (Object.keys(this.local.progress).length || Object.keys(this.local.picks).length)) {
        // Nothing on the server yet: this device's ticks are the first copy.
        addToOutbox(buildId, { patch: { ...this.local.progress }, picksPatch: { ...this.local.picks } });
      } else if (doc.updatedAt !== null && this.carriedFrom) {
        // Ticked before it turned out to be yours (signed out, say): bring
        // those along, the server's copy winning where both have a key.
        const patch = Object.fromEntries(Object.entries(readScopeProgress(this.carriedFrom)).filter(([key]) => !(key in doc.entries)));
        const picksPatch = Object.fromEntries(Object.entries(readScopePicks(this.carriedFrom)).filter(([key]) => !(key in doc.picks)));
        if (Object.keys(patch).length || Object.keys(picksPatch).length) {
          addToOutbox(buildId, { patch, picksPatch });
        }
      }
      this.carriedFrom = null;
      // Sends whatever is queued, including changes left from an earlier visit.
      this.flushDue = true;
    });
  }

  private async send(buildId: string, write: OutboxWrite): Promise<void> {
    this.flushDue = false;
    await this.request(buildId, () => this.api.put(buildId, outboxRequestBody(write)), () => settleOutbox(buildId, write));
  }

  private async request(
    buildId: string,
    call: () => Observable<OwnBuildProgress>,
    onSuccess: (doc: OwnBuildProgress) => void
  ): Promise<void> {
    this.busy = true;
    this.updateSyncState();
    try {
      // Asked before every request: once a token exchange fails it answers
      // null without trying again, so this never loops on a dead session.
      const token = await this.auth.getAccessToken();
      if (this.isStale(buildId)) {
        return;
      }
      this.lastToken = token;
      if (!token) {
        this.halted = true;
        return;
      }
      const doc = await firstValueFrom(call());
      if (this.isStale(buildId)) {
        return;
      }
      this.failures = 0;
      onSuccess(doc);
      this.adopt(buildId, doc);
    } catch (error) {
      if (!this.isStale(buildId)) {
        this.handleFailure(buildId, error);
      }
    } finally {
      this.busy = false;
      this.pump();
    }
  }

  /** The current build changed, or the store went away, while a request was out. */
  private isStale(buildId: string): boolean {
    return this.destroyed || buildId !== this.buildId;
  }

  /** Makes the server's copy the local one, with anything still queued laid over it. */
  private adopt(buildId: string, doc: OwnBuildProgress): void {
    const queued = readOutbox(buildId);
    const picks = new Map(Object.entries(doc.picks));
    for (const [identity, quests] of Object.entries(queued?.picksPatch ?? {})) {
      if (quests) {
        picks.set(identity, quests);
      } else {
        picks.delete(identity);
      }
    }
    this.local.replaceScope(
      SAVED_SCOPE_PREFIX + buildId, applyProgressPatch(doc.entries, queued?.patch ?? {}), Object.fromEntries(picks)
    );
    this.publishedJson ??= doc.needed === null ? null : JSON.stringify({ needed: doc.needed, route: doc.route });
  }

  private handleFailure(buildId: string, error: unknown): void {
    const failure = buildProgressFailureOf(error);
    switch (failure.kind) {
      case 'throttled':
        this.retryAfter(failure.retryAfterMs);
        return;
      case 'unavailable': {
        const wait = this.timing.backoffMs[this.failures++];
        if (wait !== undefined) {
          this.retryAfter(wait);
        }
        return;
      }
      case 'daily-cap':
      case 'unauthorized':
        // Kept queued for the next visit. A refused token stays refused:
        // trying again with it would only fail the same way.
        this.halted = true;
        return;
      case 'not-owned':
      case 'rejected':
        // Sending these again can only fail the same way.
        dropOutbox(buildId);
        this.halted = true;
        return;
    }
  }

  private retryAfter(ms: number): void {
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.flushDue = true;
      this.pump();
    }, ms);
  }

  private clearTimers(): void {
    for (const timer of [this.flushTimer, this.retryTimer]) {
      if (timer) {
        clearTimeout(timer);
      }
    }
    this.flushTimer = null;
    this.retryTimer = null;
  }

  private updateSyncState(): void {
    if (!this.buildId) {
      this.syncStateSubject.next('off');
    } else if (this.halted) {
      this.syncStateSubject.next('local');
    } else if (this.failures > 0) {
      this.syncStateSubject.next('offline');
    } else {
      const queued = readOutbox(this.buildId);
      this.syncStateSubject.next(this.busy || this.fetchWanted || (queued && !isEmptyWrite(queued)) ? 'saving' : 'synced');
    }
  }
}
