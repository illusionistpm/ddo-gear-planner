import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { distinctUntilChanged, scan, startWith } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import type { ShoppingRouteOrder, ShoppingSourcePicks } from '../planner/shopping-list/shopping-list-types';
import type { LiveBuildList } from './live-build-list.service';
import { LIVE_SOCKET_FACTORY, LIVE_TIMING, LiveConnection, liveSocket, LiveSocketEvent } from './live-socket';

/** One build of a group, as worker/src/live.ts sends it (its GroupMember). */
export interface LiveGroupMember {
  buildId: string;
  characterName: string;
  list: LiveBuildList;
}

/** A group run's list, as worker/src/live.ts sends it (its GroupList). */
export interface LiveGroupList {
  name: string;
  picks: ShoppingSourcePicks;
  order: ShoppingRouteOrder | null;
  members: LiveGroupMember[];
  /** When the group itself last changed: a 'group' message older than the one shown is dropped. */
  version: string;
}

export interface LiveGroupState {
  /** The latest group; null until the first arrives. Kept through a dropped connection. */
  group: LiveGroupList | null;
  connection: LiveConnection;
  /** There's no (longer a) group by that link: ended, its link replaced, or never there. Final. */
  gone: boolean;
}

/** worker/src/live.ts's GroupLiveMessage, but 'gone', which liveSocket reports itself. */
type GroupMessage =
  | ({ kind: 'group' } & LiveGroupList)
  | { kind: 'member'; buildId: string; list: LiveBuildList };

/** The newer of two of a build's lists. */
function newer(a: LiveBuildList, b: LiveBuildList | undefined): LiveBuildList {
  return b && b.version > a.version ? b : a;
}

/**
 * Folds a message into the group shown. A whole group replaces it, but for
 * any build whose list shown is newer - a change can overtake the snapshot
 * sent on connect. A build's list replaces its own if it's newer, and is
 * dropped for a build not (or no longer) in the group.
 */
export function foldGroupMessage(group: LiveGroupList | null, message: GroupMessage): LiveGroupList | null {
  if (message.kind === 'group') {
    if (group && message.version < group.version) {
      return group;
    }
    const shown = new Map(group?.members.map(member => [member.buildId, member.list]) ?? []);
    const next: LiveGroupList = { name: message.name, picks: message.picks, order: message.order, members: message.members, version: message.version };
    return { ...next, members: next.members.map(member => ({ ...member, list: newer(member.list, shown.get(member.buildId)) })) };
  }
  if (!group || !group.members.some(member => member.buildId === message.buildId)) {
    return group;
  }
  return {
    ...group,
    members: group.members.map(member => member.buildId === message.buildId ? { ...member, list: newer(member.list, message.list) } : member)
  };
}

/**
 * A group run's live list, over the Worker's WebSocket
 * (GET /api/groups/:shortId/live?t=; see liveSocket): the whole group on
 * connect, then each build's list as its owner changes it, and the whole
 * group again when who's in it or the route changes.
 */
@Injectable({ providedIn: 'root' })
export class LiveGroupListService {
  private readonly timing = inject(LIVE_TIMING);
  private readonly openSocket = inject(LIVE_SOCKET_FACTORY);

  /** The group as it changes. Closing the subscription closes the socket. */
  watch(shortId: string, token: string): Observable<LiveGroupState> {
    const url = `${environment.apiBaseUrl.replace(/^http/, 'ws')}/api/groups/${encodeURIComponent(shortId)}/live`
      + `?t=${encodeURIComponent(token)}`;
    const initial: LiveGroupState = { group: null, connection: 'connecting', gone: false };
    return liveSocket<GroupMessage>(url, this.timing, this.openSocket).pipe(
      scan((state: LiveGroupState, event: LiveSocketEvent<GroupMessage>): LiveGroupState => {
        switch (event.type) {
          case 'connection':
            return { ...state, connection: event.connection };
          case 'gone':
            return { ...state, gone: true };
          default: {
            const group = foldGroupMessage(state.group, event.message);
            return group === state.group ? state : { ...state, group };
          }
        }
      }, initial),
      startWith(initial),
      distinctUntilChanged()
    );
  }
}
