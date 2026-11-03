import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import type {
  ShoppingProgress, ShoppingProgressPatch, ShoppingSourcePicks
} from '../planner/shopping-list/shopping-list-types';

/** For each still-needed thing, the quests the owner's list sends them to. */
export type ShoppingRoute = Readonly<Record<string, readonly string[]>>;

/** What a friend's link may see of a saved build's shopping list. */
export interface PublicBuildProgress {
  /** Still-needed entry keys; null when the owner has never shared a list. */
  needed: readonly string[] | null;
  route: ShoppingRoute;
  updatedAt: string | null;
}

/** The owner's whole doc: their ticks and picks, and what friends see. */
export interface OwnBuildProgress extends PublicBuildProgress {
  entries: ShoppingProgress;
  picks: ShoppingSourcePicks;
}

/** A write. needed and route go together or not at all; absent, friends keep seeing what they saw. */
export interface BuildProgressPut {
  patch?: ShoppingProgressPatch;
  /** The quests to get a thing from; null forgets the pick. */
  picksPatch?: Record<string, readonly string[] | null>;
  needed?: readonly string[];
  route?: ShoppingRoute;
}

/** Why a progress request failed, as far as a caller has to act on it. */
export type BuildProgressFailure =
  /** Too soon after the last write: try again after this long. */
  | { kind: 'throttled'; retryAfterMs: number }
  /** The user's writes for today are used up: keep changes on this device. */
  | { kind: 'daily-cap' }
  /** The worker refused the token (expired, or meant for another API): keep changes on this device. */
  | { kind: 'unauthorized' }
  /** Not a saved build of this user's (any more): keep progress on this device. */
  | { kind: 'not-owned' }
  /** The worker refused this body (invalid or too big): retrying won't help. */
  | { kind: 'rejected' }
  /** Offline, timed out, or the worker failed: try again later. */
  | { kind: 'unavailable' };

// Browsers refuse a keepalive request once the keepalive bodies in flight
// pass 64 KiB. A bigger write stays in the caller's outbox for next time.
const MAX_KEEPALIVE_BODY_LENGTH = 60000;

/** A failed progress request, as a BuildProgressFailure. */
export function buildProgressFailureOf(error: unknown): BuildProgressFailure {
  if (!(error instanceof HttpErrorResponse)) {
    return { kind: 'unavailable' };
  }
  if (error.status === 429) {
    const body = error.error as { retryAfterMs?: unknown; dailyCapReached?: unknown } | null;
    if (body?.dailyCapReached === true) {
      return { kind: 'daily-cap' };
    }
    return { kind: 'throttled', retryAfterMs: typeof body?.retryAfterMs === 'number' ? body.retryAfterMs : 1500 };
  }
  if (error.status === 401) {
    return { kind: 'unauthorized' };
  }
  if (error.status === 403 || error.status === 404) {
    return { kind: 'not-owned' };
  }
  if (error.status === 400 || error.status === 413) {
    return { kind: 'rejected' };
  }
  return { kind: 'unavailable' };
}

/**
 * Shopping-list progress for saved builds - worker/src/routes/progress.ts.
 * The owner's routes sit under /api/builds/ and get a token from the auth
 * interceptor; the public one sits under /api/build/ and is sent without.
 */
@Injectable({
  providedIn: 'root'
})
export class BuildProgressService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api`;

  constructor(private readonly http: HttpClient) {}

  getPublic(shortId: string): Observable<PublicBuildProgress> {
    return this.http.get<PublicBuildProgress>(`${this.baseUrl}/build/${encodeURIComponent(shortId)}/progress`);
  }

  getOwn(buildId: string): Observable<OwnBuildProgress> {
    return this.http.get<OwnBuildProgress>(this.ownUrl(buildId));
  }

  /** Answers with the merged doc. */
  put(buildId: string, body: BuildProgressPut): Observable<OwnBuildProgress> {
    return this.http.put<OwnBuildProgress>(this.ownUrl(buildId), body);
  }

  /**
   * Sends a write that outlives the page, for `pagehide`. Bypasses
   * HttpClient: the interceptor fetches its token asynchronously, which a
   * closing page doesn't wait for, so the caller passes one it already
   * has. Fire and forget - nothing can observe the answer, so the caller
   * keeps the write until a later request confirms it. Returns whether it
   * was sent.
   */
  flushWithKeepalive(buildId: string, body: BuildProgressPut, accessToken: string): boolean {
    const json = JSON.stringify(body);
    if (json.length > MAX_KEEPALIVE_BODY_LENGTH || typeof fetch !== 'function') {
      return false;
    }
    try {
      fetch(this.ownUrl(buildId), {
        method: 'PUT',
        keepalive: true,
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: json
      }).catch(() => undefined);
      return true;
    } catch {
      return false;
    }
  }

  private ownUrl(buildId: string): string {
    return `${this.baseUrl}/builds/${encodeURIComponent(buildId)}/progress`;
  }
}
