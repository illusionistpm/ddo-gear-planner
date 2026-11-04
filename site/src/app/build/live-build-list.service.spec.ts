import { TestBed } from '@angular/core/testing';
import { Subscription } from 'rxjs';

import { environment } from '../../environments/environment';
import { LIVE_SOCKET_FACTORY, LIVE_TIMING, LiveBuildList, LiveBuildListService, LiveBuildState } from './live-build-list.service';

/** Just enough of a WebSocket for the service to drive. */
class FakeSocket {
  readyState = 0;
  sent: string[] = [];
  closedWith: number | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;

  constructor(readonly url: string) {}

  send(text: string): void {
    this.sent.push(text);
  }
  close(code: number): void {
    this.closedWith = code;
    this.readyState = 3;
  }

  // The server's side.
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(message: unknown): void {
    this.onmessage?.({ data: typeof message === 'string' ? message : JSON.stringify(message) });
  }
  drop(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

function list(overrides: Partial<LiveBuildList> = {}): LiveBuildList {
  return { name: 'Theirs', blob: 'z1.abc', needed: ['k'], route: {}, order: null, version: '2026-11-02T12:00:00.000Z', ...overrides };
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('LiveBuildListService', () => {
  let sockets: FakeSocket[];
  let states: LiveBuildState[];
  let subscription: Subscription;
  let visibility: DocumentVisibilityState;

  const latest = () => states.at(-1)!;
  const socket = () => sockets.at(-1)!;

  beforeEach(() => {
    sockets = [];
    states = [];
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    TestBed.configureTestingModule({
      providers: [
        { provide: LIVE_SOCKET_FACTORY, useValue: (url: string) => {
          const created = new FakeSocket(url);
          sockets.push(created);
          return created as unknown as WebSocket;
        } },
        { provide: LIVE_TIMING, useValue: { pingMs: 5, jitterMs: 1, backoffMs: [5, 5] } }
      ]
    });
  });

  afterEach(() => {
    subscription?.unsubscribe();
  });

  function watch(shortId = 'ab/c'): void {
    subscription = TestBed.inject(LiveBuildListService).watch(shortId).subscribe(state => states.push(state));
  }

  it('connects to the build\'s live route, over wss', () => {
    watch();

    expect(socket().url).toBe(`${environment.apiBaseUrl.replace(/^https/, 'wss')}/api/build/ab%2Fc/live`);
    expect(latest()).toEqual({ list: null, connection: 'connecting', gone: false });
  });

  it('shows each list as it arrives, live', () => {
    watch();
    socket().open();
    socket().receive({ kind: 'list', ...list() });
    expect(latest()).toMatchObject({ list: list(), connection: 'live', gone: false });

    socket().receive({ kind: 'list', ...list({ needed: [], version: '2026-11-02T12:00:05.000Z' }) });
    expect(latest().list?.needed).toEqual([]);
  });

  it('keeps the later of two lists that arrive out of order', () => {
    watch();
    socket().open();
    socket().receive({ kind: 'list', ...list({ needed: [], version: '2026-11-02T12:00:05.000Z' }) });
    socket().receive({ kind: 'list', ...list({ needed: ['old'], version: '2026-11-02T12:00:00.000Z' }) });

    expect(latest().list?.needed).toEqual([]);
  });

  it('ignores the keepalive\'s answer and anything it can\'t read', () => {
    watch();
    socket().open();
    const before = states.length;

    socket().receive('pong');
    socket().receive('not json');

    expect(states.length).toBe(before);
  });

  it('pings while the page is visible, and not while it\'s hidden', async () => {
    watch();
    socket().open();
    await wait(20);
    expect(socket().sent.filter(text => text === 'ping').length).toBeGreaterThan(0);

    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    const pings = socket().sent.length;
    await wait(20);
    expect(socket().sent.length).toBe(pings);
  });

  it('reconnects when the connection drops, keeping the list it had meanwhile, and catches up', async () => {
    watch();
    socket().open();
    socket().receive({ kind: 'list', ...list() });

    socket().drop();
    expect(latest()).toMatchObject({ list: list(), connection: 'reconnecting' });

    await wait(10);
    expect(sockets).toHaveLength(2);
    socket().open();
    socket().receive({ kind: 'list', ...list({ needed: [], version: '2026-11-02T12:00:09.000Z' }) });
    expect(latest()).toMatchObject({ list: { needed: [] }, connection: 'live' });
  });

  it('gives up after a few tries, and tries again when the page is focused', async () => {
    watch();
    socket().drop();
    await wait(10);
    socket().drop();
    await wait(10);
    socket().drop();
    await wait(10);
    socket().drop();
    expect(latest().connection).toBe('offline');
    await wait(20);
    expect(sockets).toHaveLength(4);

    window.dispatchEvent(new Event('focus'));
    expect(sockets).toHaveLength(5);
    expect(latest().connection).toBe('reconnecting');
  });

  it('lets a hidden page\'s connection go, reconnecting once it\'s shown again', async () => {
    watch();
    socket().open();
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));

    socket().drop();
    await wait(20);
    expect(sockets).toHaveLength(1);

    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(sockets).toHaveLength(2);
  });

  it('stops, closing the socket itself, when the build is gone', async () => {
    watch();
    socket().open();
    socket().receive({ kind: 'list', ...list() });

    socket().receive({ kind: 'gone' });

    expect(latest()).toMatchObject({ gone: true });
    expect(sockets[0].closedWith).toBe(1000);
    window.dispatchEvent(new Event('focus'));
    await wait(20);
    expect(sockets).toHaveLength(1);
  });

  it('stops when the room closes with the gone code', () => {
    watch();
    socket().open();

    socket().drop(4404);

    expect(latest()).toMatchObject({ gone: true });
  });

  it('closes the socket when the page goes, and when unsubscribed', () => {
    watch();
    socket().open();
    window.dispatchEvent(new Event('pagehide'));
    expect(sockets[0].closedWith).toBe(1000);

    subscription.unsubscribe();
    watch();
    socket().open();
    subscription.unsubscribe();
    expect(sockets[1].closedWith).toBe(1000);
  });
});
