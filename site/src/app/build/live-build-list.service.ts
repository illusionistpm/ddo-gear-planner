import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { distinctUntilChanged, scan, startWith } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import type { SharedShoppingList } from '../planner/shopping-list/shopping-list-types';
import { LIVE_SOCKET_FACTORY, LIVE_TIMING, LiveConnection, liveSocket, LiveSocketEvent } from './live-socket';

export { LIVE_SOCKET_FACTORY, LIVE_TIMING } from './live-socket';
export type { LiveConnection, LiveTiming } from './live-socket';

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

export interface LiveBuildState {
  /** The latest list; null until the first arrives. Kept through a dropped connection. */
  list: LiveBuildList | null;
  connection: LiveConnection;
  /** There's no (longer a) build by that link: missing, private or deleted. Final. */
  gone: boolean;
}

/** worker/src/live.ts's LiveMessage, but 'gone', which liveSocket reports itself. */
type LiveMessage = { kind: 'list' } & LiveBuildList;

/**
 * A friend's live view of what a saved build still needs, over the Worker's
 * WebSocket (GET /api/build/:shortId/live; see liveSocket). The Worker
 * sends the whole list on connect and again whenever the owner changes
 * what friends see.
 */
@Injectable({ providedIn: 'root' })
export class LiveBuildListService {
  private readonly timing = inject(LIVE_TIMING);
  private readonly openSocket = inject(LIVE_SOCKET_FACTORY);

  /** The build's list as it changes. Closing the subscription closes the socket. */
  watch(shortId: string): Observable<LiveBuildState> {
    const url = `${environment.apiBaseUrl.replace(/^http/, 'ws')}/api/build/${encodeURIComponent(shortId)}/live`;
    const initial: LiveBuildState = { list: null, connection: 'connecting', gone: false };
    return liveSocket<LiveMessage>(url, this.timing, this.openSocket).pipe(
      scan((state: LiveBuildState, event: LiveSocketEvent<LiveMessage>): LiveBuildState => {
        switch (event.type) {
          case 'connection':
            return { ...state, connection: event.connection };
          case 'gone':
            return { ...state, gone: true };
          default:
            // The message is the list, with its kind alongside. One older than the list shown is stale.
            return event.message.kind === 'list' && (!state.list || event.message.version >= state.list.version)
              ? { ...state, list: event.message }
              : state;
        }
      }, initial),
      startWith(initial),
      distinctUntilChanged()
    );
  }
}
