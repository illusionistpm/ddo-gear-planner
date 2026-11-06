import { TestBed } from '@angular/core/testing';

import { LIVE_SOCKET_FACTORY, LIVE_TIMING } from './live-socket';
import type { LiveBuildList } from './live-build-list.service';
import { foldGroupMessage, LiveGroupList, LiveGroupListService, LiveGroupState } from './live-group-list.service';

function list(name: string, version: string): LiveBuildList {
  return { name, blob: `z1.${name}`, needed: [], route: {}, order: null, version };
}

function group(version: string, lists: Record<string, LiveBuildList>): LiveGroupList {
  return {
    name: 'Reaper night', picks: {}, order: null, version,
    members: Object.entries(lists).map(([buildId, memberList]) => ({ buildId, characterName: buildId.toUpperCase(), list: memberList }))
  };
}

describe('foldGroupMessage', () => {
  const shown = group('2026-11-05T10:00:00Z', { a: list('a', '2026-11-05T10:00:00Z'), b: list('b', '2026-11-05T10:00:00Z') });

  it('takes a whole group, keeping any build\'s list shown that is newer than the one it carries', () => {
    const newerA = foldGroupMessage(shown, { kind: 'member', buildId: 'a', list: list('a', '2026-11-05T12:00:00Z') });
    const snapshot = group('2026-11-05T11:00:00Z', { a: list('a', '2026-11-05T10:00:00Z'), c: list('c', '2026-11-05T11:00:00Z') });

    const folded = foldGroupMessage(newerA, { kind: 'group', ...snapshot });

    expect(folded?.version).toBe('2026-11-05T11:00:00Z');
    expect(folded?.members.map(member => [member.buildId, member.list.version])).toEqual([
      ['a', '2026-11-05T12:00:00Z'], ['c', '2026-11-05T11:00:00Z']
    ]);
  });

  it('drops a whole group older than the one shown', () => {
    expect(foldGroupMessage(shown, { kind: 'group', ...group('2026-11-05T09:00:00Z', {}) })).toBe(shown);
  });

  it('takes a build\'s newer list, and drops an older one, or one for a build not in the group', () => {
    const newer = list('b', '2026-11-05T11:00:00Z');

    expect(foldGroupMessage(shown, { kind: 'member', buildId: 'b', list: newer })?.members[1].list).toBe(newer);
    expect(foldGroupMessage(shown, { kind: 'member', buildId: 'b', list: list('b', '2026-11-05T09:00:00Z') })?.members[1].list)
      .toBe(shown.members[1].list);
    expect(foldGroupMessage(shown, { kind: 'member', buildId: 'z', list: newer })).toBe(shown);
    expect(foldGroupMessage(null, { kind: 'member', buildId: 'b', list: newer })).toBeNull();
  });
});

/** Just enough of a WebSocket for liveSocket. */
class FakeSocket {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  constructor(readonly url: string) {}
  send(): void { /* Nothing to do. */ }
  close(): void {
    this.readyState = 3;
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  message(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

describe('LiveGroupListService', () => {
  let sockets: FakeSocket[];
  let states: LiveGroupState[];

  beforeEach(() => {
    sockets = [];
    states = [];
    TestBed.configureTestingModule({
      providers: [
        { provide: LIVE_TIMING, useValue: { pingMs: 60000, jitterMs: 0, backoffMs: [] } },
        { provide: LIVE_SOCKET_FACTORY, useValue: (url: string) => {
          const socket = new FakeSocket(url);
          sockets.push(socket);
          return socket as unknown as WebSocket;
        } }
      ]
    });
  });

  it('opens the group\'s socket with its invite token, and folds what arrives into the group shown', () => {
    const subscription = TestBed.inject(LiveGroupListService).watch('grp 1', 't/k').subscribe(state => states.push(state));

    expect(sockets[0].url).toMatch(/\/api\/groups\/grp%201\/live\?t=t%2Fk$/);
    sockets[0].open();
    const snapshot = group('2026-11-05T10:00:00Z', { a: list('a', '2026-11-05T10:00:00Z') });
    sockets[0].message({ kind: 'group', ...snapshot });
    sockets[0].message({ kind: 'member', buildId: 'a', list: list('a', '2026-11-05T11:00:00Z') });

    expect(states.map(state => state.connection)).toEqual(['connecting', 'live', 'live', 'live']);
    expect(states.at(-1)?.group?.members[0].list.version).toBe('2026-11-05T11:00:00Z');
    subscription.unsubscribe();
  });

  it('says gone when the room does', () => {
    const subscription = TestBed.inject(LiveGroupListService).watch('grp1', 'wrong').subscribe(state => states.push(state));
    sockets[0].open();

    sockets[0].message({ kind: 'gone' });

    expect(states.at(-1)?.gone).toBe(true);
    subscription.unsubscribe();
  });
});
