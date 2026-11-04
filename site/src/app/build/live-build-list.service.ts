import { inject, Injectable, InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

import sharedConstants from '../../../../shared/constants.json';
import { environment } from '../../environments/environment';
import type { SharedShoppingList } from '../planner/shopping-list/shopping-list-types';

/**
 * What a saved build's owner shares with friends, as worker/src/live.ts
 * sends it (its FriendList): the build as saved and its still-needed list.
 */
export interface LiveBuildList extends SharedShoppingList {
  name: string;
  blob: string;
  /** When it last changed. A message older than the one shown is dropped. */
  version: string;
}

/**
 * - connecting: the first connection is being made;
 * - live: connected, and changes arrive as they're made;
 * - reconnecting: the connection dropped, and it's being made again;
 * - offline: it couldn't be, after a few tries. It's tried again when the
 *   page is focused or shown again.
 */
export type LiveConnection = 'connecting' | 'live' | 'reconnecting' | 'offline';

export interface LiveBuildState {
  /** The latest list; null until the first arrives. Kept through a dropped connection. */
  list: LiveBuildList | null;
  connection: LiveConnection;
  /** There's no (longer a) build by that link: missing, private or deleted. Final. */
  gone: boolean;
}

export interface LiveTiming {
  /** Keepalive while the page is visible, so idle proxies don't drop the socket. */
  pingMs: number;
  /**
   * Waits before each reconnect after the connection drops: the first is
   * random up to jitterMs - every socket drops at once when the Worker is
   * deployed - and each later failure waits the next of backoffMs. After
   * the last, it waits for the page to be focused or shown again.
   */
  jitterMs: number;
  backoffMs: readonly number[];
}

/** Specs replace these, to drive a fake socket on real timers. */
export const LIVE_TIMING = new InjectionToken<LiveTiming>('LiveTiming', {
  providedIn: 'root',
  factory: () => ({ pingMs: 45000, jitterMs: 5000, backoffMs: [5000, 15000, 60000] })
});

export const LIVE_SOCKET_FACTORY = new InjectionToken<(url: string) => WebSocket>('LiveSocketFactory', {
  providedIn: 'root',
  factory: () => (url: string) => new WebSocket(url)
});

/** worker/src/live.ts's keepalive and its answer, and its close code for a build that's gone. */
const PING = sharedConstants.livePing;
const PONG = sharedConstants.livePong;
const GONE_CLOSE_CODE = sharedConstants.liveGoneCloseCode;
// WebSocket.OPEN and .CLOSED, which a fake socket's class needn't carry.
const OPEN = 1;
const CLOSED = 3;

/** worker/src/live.ts's LiveMessage. */
type LiveMessage = ({ kind: 'list' } & LiveBuildList) | { kind: 'gone' };

/**
 * A friend's live view of what a saved build still needs, over the Worker's
 * WebSocket (GET /api/build/:shortId/live). The Worker sends the whole list
 * on connect and again whenever the owner changes what friends see, so
 * there's nothing to poll and every reconnect catches up.
 *
 * While the page is hidden it stops pinging and lets the socket go if it's
 * dropped, reconnecting when the page is shown again, so a background tab
 * costs nothing.
 */
@Injectable({ providedIn: 'root' })
export class LiveBuildListService {
  private readonly timing = inject(LIVE_TIMING);
  private readonly openSocket = inject(LIVE_SOCKET_FACTORY);

  /** The build's list as it changes. Closing the subscription closes the socket. */
  watch(shortId: string): Observable<LiveBuildState> {
    const url = `${environment.apiBaseUrl.replace(/^http/, 'ws')}/api/build/${encodeURIComponent(shortId)}/live`;
    return new Observable<LiveBuildState>(subscriber => {
      let state: LiveBuildState = { list: null, connection: 'connecting', gone: false };
      let socket: WebSocket | null = null;
      let failures = 0;
      let stopped = false;
      let pingTimer: ReturnType<typeof setInterval> | null = null;
      let retryTimer: ReturnType<typeof setTimeout> | null = null;

      const emit = (next: Partial<LiveBuildState>) => {
        state = { ...state, ...next };
        subscriber.next(state);
      };
      const hidden = () => document.visibilityState === 'hidden';

      const stopPinging = () => {
        if (pingTimer) {
          clearInterval(pingTimer);
          pingTimer = null;
        }
      };
      const startPinging = () => {
        stopPinging();
        if (!hidden() && socket?.readyState === OPEN) {
          pingTimer = setInterval(() => socket?.send(PING), this.timing.pingMs);
        }
      };

      const connect = () => {
        if (stopped || socket) {
          return;
        }
        const current = this.openSocket(url);
        socket = current;
        current.onopen = () => {
          failures = 0;
          emit({ connection: 'live' });
          startPinging();
        };
        current.onmessage = event => {
          if (event.data === PONG) {
            return;
          }
          const message = parse(event.data);
          if (message?.kind === 'gone') {
            finish(true);
          } else if (message?.kind === 'list' && (!state.list || message.version >= state.list.version)) {
            // The message is the list, with its kind alongside.
            emit({ list: message });
          }
        };
        current.onclose = event => {
          if (socket !== current) {
            return;
          }
          socket = null;
          stopPinging();
          if (event.code === GONE_CLOSE_CODE) {
            finish(true);
          } else if (!stopped) {
            dropped();
          }
        };
      };

      /** The connection is gone: try again shortly, unless the page is hidden. */
      const dropped = () => {
        if (hidden()) {
          emit({ connection: 'reconnecting' });
          return;
        }
        const wait = failures === 0 ? Math.random() * this.timing.jitterMs : this.timing.backoffMs[failures - 1];
        failures++;
        if (wait === undefined) {
          emit({ connection: 'offline' });
          return;
        }
        emit({ connection: 'reconnecting' });
        retryTimer = setTimeout(() => {
          retryTimer = null;
          connect();
        }, wait);
      };

      /** The page is back: catch up at once if the connection went while it was away, or gave up. */
      const onReturn = () => {
        if (stopped || socket || retryTimer) {
          startPinging();
          return;
        }
        failures = 0;
        emit({ connection: 'reconnecting' });
        connect();
      };
      const onVisibilityChange = () => {
        if (hidden()) {
          stopPinging();
        } else {
          onReturn();
        }
      };
      const onPageHide = () => socket?.close(1000);

      const finish = (gone: boolean) => {
        stopped = true;
        stopPinging();
        if (retryTimer) {
          clearTimeout(retryTimer);
          retryTimer = null;
        }
        // The page closes it itself: a socket the room closed may be left
        // half-closed (see worker/src/live.ts).
        const closing = socket;
        socket = null;
        if (closing && closing.readyState !== CLOSED) {
          closing.close(1000);
        }
        window.removeEventListener('focus', onReturn);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('pagehide', onPageHide);
        if (gone) {
          emit({ gone: true });
        }
      };

      window.addEventListener('focus', onReturn);
      document.addEventListener('visibilitychange', onVisibilityChange);
      window.addEventListener('pagehide', onPageHide);
      subscriber.next(state);
      connect();
      return () => finish(false);
    });
  }
}

function parse(data: unknown): LiveMessage | null {
  if (typeof data !== 'string') {
    return null;
  }
  try {
    const message = JSON.parse(data) as LiveMessage;
    return typeof message === 'object' && message !== null ? message : null;
  } catch {
    return null;
  }
}
