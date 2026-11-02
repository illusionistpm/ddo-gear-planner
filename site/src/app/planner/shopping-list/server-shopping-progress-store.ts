import { inject, Injectable, InjectionToken, OnDestroy } from '@angular/core';
import { BehaviorSubject, firstValueFrom, Observable, Subscription } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';

import { BuildProgressService, buildProgressFailureOf, OwnBuildProgress } from '../../build/build-progress.service';
import { CurrentBuildService } from '../../build/current-build.service';
import { AuthService } from '../../shared/auth.service';
import type {
  ShoppingProgress, ShoppingProgressPatch, ShoppingSourcePicks
} from './shopping-list-types';
import { applyProgressPatch } from './shopping-list-view-model';
import {
  addToOutbox, dropOutbox, isEmptyWrite, outboxRequestBody, OutboxWrite, readOutbox, settleOutbox
} from './shopping-progress-outbox';
import {
  LocalShoppingProgressStore, shoppingProgressScope, ShoppingProgressStore, ShoppingPublished, ShoppingSyncState
} from './shopping-progress-store';

export interface ShoppingSyncTiming {
  /** Quiet time after a change before it's sent, so a burst of ticks is one request. */
  debounceMs: number;
  /** Waits after successive failures to reach the server; the last repeats. */
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
 * becomes current and on window focus when the last read is stale. Hiding
 * the page sends what's queued without waiting out the quiet spell, and
 * closing it sends it once more with keepalive, in case that didn't land.
 * Failures:
 * - too soon after the last write: retry when the server says;
 * - unreachable: retry after a growing wait;
 * - daily cap, not the owner, or a write the server refuses: stop syncing
 *   this build until it's opened again, keeping everything on this device.
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
  /** Why syncing stopped for this build, if it has. */
  private halted: 'local' | null = null;
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
  private readonly onFocus = () => {
    if (this.buildId && Date.now() - this.lastFetchAt >= this.timing.refetchAfterMs) {
      this.fetchWanted = true;
      this.pump();
    }
  };
  private readonly onVisibilityChange = () => {
    if (document.visibilityState === 'hidden' && this.flushTimer) {
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
    window.addEventListener('focus', this.onFocus);
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
    window.removeEventListener('focus', this.onFocus);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('pagehide', this.onPageHide);
    this.clearTimers();
  }

  private changeBuild(scope: string): void {
    const buildId = scope.startsWith(SAVED_SCOPE_PREFIX) ? scope.slice(SAVED_SCOPE_PREFIX.length) : null;
    if (buildId === this.buildId) {
      return;
    }
    this.clearTimers();
    this.buildId = buildId;
    this.halted = null;
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
      }
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
        this.halted = 'local';
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
      case 'unavailable':
        this.retryAfter(this.timing.backoffMs[Math.min(this.failures++, this.timing.backoffMs.length - 1)]);
        return;
      case 'daily-cap':
        // Kept queued for the next visit.
        this.halted = 'local';
        return;
      case 'not-owned':
      case 'rejected':
        // Sending these again can only fail the same way.
        dropOutbox(buildId);
        this.halted = 'local';
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
