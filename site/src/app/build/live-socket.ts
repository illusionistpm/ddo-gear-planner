import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

import sharedConstants from '../../../../shared/constants.json';

/**
 * - connecting: the first connection is being made;
 * - live: connected, and changes arrive as they're made;
 * - reconnecting: the connection dropped, and it's being made again;
 * - offline: it couldn't be, after a few tries. It's tried again when the
 *   page is focused or shown again.
 */
export type LiveConnection = 'connecting' | 'live' | 'reconnecting' | 'offline';

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

/** worker/src/live.ts's keepalive and its answer, and its close code for a list that's gone. */
const PING = sharedConstants.livePing;
const PONG = sharedConstants.livePong;
const GONE_CLOSE_CODE = sharedConstants.liveGoneCloseCode;
// WebSocket.OPEN and .CLOSED, which a fake socket's class needn't carry.
const OPEN = 1;
const CLOSED = 3;

/**
 * What a live socket reports: the connection as it changes, each message
 * (but 'gone') as it arrives, and - last of all - that there's no (longer
 * a) list to show.
 */
export type LiveSocketEvent<M> =
  | { type: 'connection'; connection: LiveConnection }
  | { type: 'message'; message: M }
  | { type: 'gone' };

/**
 * A live list over one of the Worker's WebSockets (worker/src/live.ts),
 * which sends the whole list on connect and changes as they're made, so
 * there's nothing to poll and every reconnect catches up. A message whose
 * kind is 'gone', or the room's gone close code, ends it.
 *
 * While the page is hidden it stops pinging and lets the socket go if it's
 * dropped, reconnecting when the page is shown again, so a background tab
 * costs nothing. Closing the subscription closes the socket.
 */
export function liveSocket<M extends { kind: string }>(
  url: string, timing: LiveTiming, openSocket: (url: string) => WebSocket
): Observable<LiveSocketEvent<M>> {
  return new Observable<LiveSocketEvent<M>>(subscriber => {
    let socket: WebSocket | null = null;
    let failures = 0;
    let stopped = false;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connection = (next: LiveConnection) => subscriber.next({ type: 'connection', connection: next });
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
        pingTimer = setInterval(() => socket?.send(PING), timing.pingMs);
      }
    };

    const connect = () => {
      if (stopped || socket) {
        return;
      }
      const current = openSocket(url);
      socket = current;
      current.onopen = () => {
        failures = 0;
        connection('live');
        startPinging();
      };
      current.onmessage = event => {
        if (event.data === PONG) {
          return;
        }
        const message = parse<M>(event.data);
        if (message?.kind === 'gone') {
          finish(true);
        } else if (message) {
          subscriber.next({ type: 'message', message });
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
        connection('reconnecting');
        return;
      }
      const wait = failures === 0 ? Math.random() * timing.jitterMs : timing.backoffMs[failures - 1];
      failures++;
      if (wait === undefined) {
        connection('offline');
        return;
      }
      connection('reconnecting');
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
      connection('reconnecting');
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
        subscriber.next({ type: 'gone' });
      }
    };

    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    connect();
    return () => finish(false);
  });
}

function parse<M>(data: unknown): M | null {
  if (typeof data !== 'string') {
    return null;
  }
  try {
    const message = JSON.parse(data) as M;
    return typeof message === 'object' && message !== null ? message : null;
  } catch {
    return null;
  }
}
