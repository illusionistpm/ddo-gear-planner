import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { BehaviorSubject } from 'rxjs';

import { environment } from '../../../environments/environment';
import { BuildProgressService, OwnBuildProgress } from '../../build/build-progress.service';
import { CurrentBuildService, CurrentBuildState } from '../../build/current-build.service';
import { AuthService } from '../../shared/auth.service';
import { SHOPPING_SYNC_TIMING, ServerShoppingProgressStore, ShoppingSyncTiming } from './server-shopping-progress-store';
import { addToOutbox, readOutbox, SHOPPING_OUTBOX_STORAGE_KEY } from './shopping-progress-outbox';
import {
  patchScopeProgress, readScopeOrder, readScopePicks, readScopeProgress, setScopeOrder, SHOPPING_PROGRESS_STORAGE_KEY
} from './shopping-progress-storage';
import { ShoppingSyncState } from './shopping-progress-store';

const UNSAVED: CurrentBuildState = { savedBuildId: null, shortId: null, name: null, isDirty: false, ownership: 'other' };
const OWNED: CurrentBuildState = { savedBuildId: 'b1', shortId: 's1', name: 'Mine', isDirty: false, ownership: 'owned' };
const URL_B1 = `${environment.apiBaseUrl}/api/builds/b1/progress`;

function doc(overrides: Partial<OwnBuildProgress> = {}): OwnBuildProgress {
  return { entries: {}, picks: {}, needed: null, route: {}, order: null, updatedAt: '2026-11-02T12:00:00.000Z', ...overrides };
}

describe('ServerShoppingProgressStore', () => {
  let state: BehaviorSubject<CurrentBuildState>;
  let getAccessToken: ReturnType<typeof vi.fn>;
  let timing: ShoppingSyncTiming;
  let http: HttpTestingController;
  let syncStates: ShoppingSyncState[];

  beforeEach(() => {
    localStorage.removeItem(SHOPPING_PROGRESS_STORAGE_KEY);
    localStorage.removeItem(SHOPPING_OUTBOX_STORAGE_KEY);
    state = new BehaviorSubject(UNSAVED);
    getAccessToken = vi.fn().mockResolvedValue('token');
    timing = { debounceMs: 0, backoffMs: [0], refetchAfterMs: 60000 };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CurrentBuildService, useValue: { state$: state, get value() { return state.value; } } },
        { provide: AuthService, useValue: { getAccessToken } },
        { provide: SHOPPING_SYNC_TIMING, useFactory: () => timing }
      ]
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem(SHOPPING_PROGRESS_STORAGE_KEY);
    localStorage.removeItem(SHOPPING_OUTBOX_STORAGE_KEY);
  });

  function create(): ServerShoppingProgressStore {
    const store = TestBed.inject(ServerShoppingProgressStore);
    syncStates = [];
    store.syncState$.subscribe(syncState => syncStates.push(syncState));
    return store;
  }

  // Lets the token promise, the debounce and retry timers (all 0 ms here)
  // and the HTTP answer's callbacks run.
  async function settle(): Promise<void> {
    for (let i = 0; i < 6; i++) {
      await new Promise(resolve => setTimeout(resolve));
    }
  }

  async function expectRequest(method: 'GET' | 'PUT'): Promise<TestRequest> {
    await settle();
    const req = http.expectOne(URL_B1);
    expect(req.request.method).toBe(method);
    return req;
  }

  /** Opens the owned build and answers its first read. */
  async function openOwned(serverDoc: OwnBuildProgress = doc()): Promise<void> {
    state.next(OWNED);
    (await expectRequest('GET')).flush(serverDoc);
    await settle();
  }

  it('sends nothing for a build that isn\'t a saved build of yours', async () => {
    const store = create();

    store.applyPatch({ a: 1 });
    state.next({ ...UNSAVED, shortId: 's9', ownership: 'other' });
    store.applyPatch({ b: 1 });
    await settle();

    http.expectNone(() => true);
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(readScopeProgress('draft')).toEqual({ a: 1 });
    expect(syncStates).toEqual(['off']);
  });

  it('reads the server\'s copy when a saved build of yours opens, and makes it the local one', async () => {
    const store = create();
    patchScopeProgress('saved:b1', { stale: 1 });

    await openOwned(doc({ entries: { a: 1, b: 0 }, picks: { Ring: ['Quest A'] } }));

    expect(store.progress).toEqual({ a: 1, b: 0 });
    expect(store.picks).toEqual({ Ring: ['Quest A'] });
    expect(readScopeProgress('saved:b1')).toEqual({ a: 1, b: 0 });
    expect(syncStates.at(-1)).toBe('synced');
  });

  it('uploads this device\'s ticks when the server has none yet', async () => {
    create();
    patchScopeProgress('saved:b1', { a: 1 });

    state.next(OWNED);
    (await expectRequest('GET')).flush(doc({ updatedAt: null }));
    const put = await expectRequest('PUT');

    expect(put.request.body).toEqual({ patch: { a: 1 } });
    put.flush(doc({ entries: { a: 1 } }));
    await settle();
    expect(readOutbox('b1')).toBeNull();
  });

  it('shows a change at once, and sends a burst of changes as one write', async () => {
    const store = create();
    await openOwned();

    store.applyPatch({ a: 1 });
    store.setPick('Ring', ['Quest A']);
    store.applyPatch({ b: 0 });

    expect(store.progress).toEqual({ a: 1, b: 0 });
    expect(syncStates.at(-1)).toBe('saving');
    const put = await expectRequest('PUT');
    expect(put.request.body).toEqual({ patch: { a: 1, b: 0 }, picksPatch: { Ring: ['Quest A'] } });
    put.flush(doc({ entries: { a: 1, b: 0, fromElsewhere: 1 }, picks: { Ring: ['Quest A'] } }));
    await settle();

    expect(store.progress).toEqual({ a: 1, b: 0, fromElsewhere: 1 });
    expect(readOutbox('b1')).toBeNull();
    expect(syncStates.at(-1)).toBe('synced');
  });

  it('keeps one write out at a time, sending what changed meanwhile after it', async () => {
    const store = create();
    await openOwned();

    store.applyPatch({ a: 1 });
    const first = await expectRequest('PUT');
    store.applyPatch({ b: 1 });
    await settle();
    http.expectNone(() => true);

    first.flush(doc({ entries: { a: 1 } }));
    await settle();
    // Laid over the server's answer, so the change made meanwhile doesn't flicker away.
    expect(store.progress).toEqual({ a: 1, b: 1 });
    const second = await expectRequest('PUT');
    expect(second.request.body).toEqual({ patch: { b: 1 } });
    second.flush(doc({ entries: { a: 1, b: 1 } }));
    await settle();
  });

  describe('the route\'s order', () => {
    const order = { packs: ['Pack B', 'Pack A'], quests: ['Quest B'] };

    it('sends it when arranged, and null when put back in the default order', async () => {
      const store = create();
      await openOwned();

      store.setOrder(order);
      expect(store.order).toEqual(order);
      const put = await expectRequest('PUT');
      expect(put.request.body).toEqual({ order });
      put.flush(doc({ order }));
      await settle();

      store.setOrder(null);
      const cleared = await expectRequest('PUT');
      expect(cleared.request.body).toEqual({ order: null });
      cleared.flush(doc({ order: null }));
      await settle();
      expect(readOutbox('b1')).toBeNull();
    });

    it('takes the server\'s, as arranged on another device', async () => {
      const store = create();
      setScopeOrder('saved:b1', { packs: ['Stale'], quests: [] });

      await openOwned(doc({ order }));

      expect(store.order).toEqual(order);
    });

    it('keeps one still queued over the server\'s answer', async () => {
      const store = create();
      await openOwned(doc({ order }));

      store.setOrder(null);
      store.applyPatch({ a: 1 });
      const put = await expectRequest('PUT');
      store.setOrder(order);
      put.flush(doc({ entries: { a: 1 }, order: null }));
      await settle();

      expect(store.order).toEqual(order);
      const next = await expectRequest('PUT');
      expect(next.request.body).toEqual({ order });
      next.flush(doc({ entries: { a: 1 }, order }));
      await settle();
    });

    it('uploads this device\'s when the server has nothing yet', async () => {
      create();
      setScopeOrder('saved:b1', order);

      state.next(OWNED);
      (await expectRequest('GET')).flush(doc({ updatedAt: null }));
      const put = await expectRequest('PUT');

      expect(put.request.body).toEqual({ order });
      put.flush(doc({ order }));
      await settle();
    });

    it('holds it while the build has unsaved changes, sending ticks meanwhile, and sends it once they\'re undone', async () => {
      const store = create();
      await openOwned();
      state.next({ ...OWNED, isDirty: true });

      store.setOrder(order);
      store.applyPatch({ a: 1 });
      const put = await expectRequest('PUT');
      expect(put.request.body).toEqual({ patch: { a: 1 } });
      put.flush(doc({ entries: { a: 1 } }));
      await settle();
      http.expectNone(URL_B1);
      // Held, not stuck: nothing is on its way.
      expect(syncStates.at(-1)).toBe('synced');
      expect(store.order).toEqual(order);

      state.next(OWNED);
      const sent = await expectRequest('PUT');
      expect(sent.request.body).toEqual({ order });
      sent.flush(doc({ entries: { a: 1 }, order }));
      await settle();
      expect(readOutbox('b1')).toBeNull();
    });

    it('brings along one arranged before the build turned out to be yours, unless the server has one', async () => {
      create();
      setScopeOrder('build:s1', order);
      state.next({ ...OWNED, ownership: 'unknown', savedBuildId: null });
      state.next(OWNED);
      (await expectRequest('GET')).flush(doc());
      const put = await expectRequest('PUT');

      expect(put.request.body).toEqual({ order });
      put.flush(doc({ order }));
      await settle();
      expect(readScopeOrder('saved:b1')).toEqual(order);
    });
  });

  it('sends forgetting a pick, and Reset route, as nulls', async () => {
    const store = create();
    await openOwned(doc({ picks: { Ring: ['Quest A'], Neck: ['Quest B'] } }));

    store.clearPicks();
    const put = await expectRequest('PUT');

    expect(put.request.body).toEqual({ picksPatch: { Ring: null, Neck: null } });
    put.flush(doc());
    await settle();
  });

  it('retries a throttled write after the wait the server asks for', async () => {
    const store = create();
    await openOwned();

    store.applyPatch({ a: 1 });
    (await expectRequest('PUT')).flush({ retryAfterMs: 0 }, { status: 429, statusText: 'Too Many Requests' });
    const retry = await expectRequest('PUT');

    expect(retry.request.body).toEqual({ patch: { a: 1 } });
    retry.flush(doc({ entries: { a: 1 } }));
    await settle();
  });

  it('retries after a network failure, saying it\'s offline meanwhile', async () => {
    timing.backoffMs = [300];
    const store = create();
    await openOwned();

    store.applyPatch({ a: 1 });
    (await expectRequest('PUT')).error(new ProgressEvent('error'));
    await settle();
    expect(syncStates.at(-1)).toBe('offline');
    http.expectNone(() => true);

    await new Promise(resolve => setTimeout(resolve, 350));
    const retry = await expectRequest('PUT');
    retry.flush(doc({ entries: { a: 1 } }));
    await settle();
    expect(syncStates.at(-1)).toBe('synced');
  });

  it('stops retrying once the waits run out, until the window is focused again', async () => {
    const store = create();
    await openOwned();

    store.applyPatch({ a: 1 });
    (await expectRequest('PUT')).error(new ProgressEvent('error'));
    // One wait in this spec's timing, so one retry.
    (await expectRequest('PUT')).error(new ProgressEvent('error'));
    await settle();
    http.expectNone(() => true);
    expect(syncStates.at(-1)).toBe('offline');
    expect(readOutbox('b1')?.patch).toEqual({ a: 1 });

    window.dispatchEvent(new Event('focus'));
    const retry = await expectRequest('PUT');
    expect(retry.request.body).toEqual({ patch: { a: 1 } });
    retry.flush(doc({ entries: { a: 1 } }));
    await settle();
    expect(syncStates.at(-1)).toBe('synced');
  });

  it('stops when the server refuses the token, keeping the change queued for next time', async () => {
    const store = create();
    await openOwned();

    store.applyPatch({ a: 1 });
    (await expectRequest('PUT')).flush({ error: 'x' }, { status: 401, statusText: 'Unauthorized' });
    store.applyPatch({ b: 1 });
    await settle();
    window.dispatchEvent(new Event('focus'));
    await settle();

    http.expectNone(() => true);
    expect(store.progress).toEqual({ a: 1, b: 1 });
    expect(readOutbox('b1')?.patch).toEqual({ a: 1, b: 1 });
    expect(syncStates.at(-1)).toBe('local');
  });

  it('stops at the daily cap, keeping the change on this device and queued for next time', async () => {
    const store = create();
    await openOwned();

    store.applyPatch({ a: 1 });
    (await expectRequest('PUT')).flush({ dailyCapReached: true }, { status: 429, statusText: 'Too Many Requests' });
    store.applyPatch({ b: 1 });
    await settle();

    http.expectNone(() => true);
    expect(store.progress).toEqual({ a: 1, b: 1 });
    expect(readOutbox('b1')?.patch).toEqual({ a: 1, b: 1 });
    expect(syncStates.at(-1)).toBe('local');
  });

  it('stops for a build that turns out not to be yours, dropping its queue but keeping the ticks', async () => {
    const store = create();
    await openOwned();

    store.applyPatch({ a: 1 });
    (await expectRequest('PUT')).flush({ error: 'x' }, { status: 403, statusText: 'Forbidden' });
    await settle();

    expect(readOutbox('b1')).toBeNull();
    expect(store.progress).toEqual({ a: 1 });
    expect(syncStates.at(-1)).toBe('local');
  });

  it('sends nothing without a token, keeping changes on this device', async () => {
    getAccessToken.mockResolvedValue(null);
    const store = create();

    state.next(OWNED);
    store.applyPatch({ a: 1 });
    await settle();

    http.expectNone(() => true);
    expect(store.progress).toEqual({ a: 1 });
    expect(syncStates.at(-1)).toBe('local');
  });

  it('uploads a draft\'s ticks and picks when it\'s saved', async () => {
    const store = create();
    store.applyPatch({ a: 1 });
    store.setPick('Ring', ['Quest A']);

    state.next(OWNED);
    (await expectRequest('GET')).flush(doc({ updatedAt: null }));
    const put = await expectRequest('PUT');

    expect(put.request.body).toEqual({ patch: { a: 1 }, picksPatch: { Ring: ['Quest A'] } });
    put.flush(doc({ entries: { a: 1 }, picks: { Ring: ['Quest A'] } }));
    await settle();
    expect(readScopeProgress('draft')).toEqual({});
  });

  it('merges ticks made before the build turned out to be yours into the server\'s copy, the server winning', async () => {
    const store = create();
    state.next({ ...OWNED, savedBuildId: null, ownership: 'unknown' });
    store.applyPatch({ a: 0, b: 1 });
    store.setPick('Ring', ['Quest A']);
    await settle();
    http.expectNone(() => true);

    state.next(OWNED);
    (await expectRequest('GET')).flush(doc({ entries: { a: 1 } }));
    await settle();

    expect(store.progress).toEqual({ a: 1, b: 1 });
    const put = await expectRequest('PUT');
    expect(put.request.body).toEqual({ patch: { b: 1 }, picksPatch: { Ring: ['Quest A'] } });
    put.flush(doc({ entries: { a: 1, b: 1 }, picks: { Ring: ['Quest A'] } }));
    await settle();
  });

  it('sends changes queued on an earlier visit once the build opens', async () => {
    addToOutbox('b1', { patch: { a: 1 } });
    const store = create();

    await openOwned(doc({ entries: { z: 1 } }));

    expect(store.progress).toEqual({ z: 1, a: 1 });
    const put = await expectRequest('PUT');
    expect(put.request.body).toEqual({ patch: { a: 1 } });
    put.flush(doc({ entries: { z: 1, a: 1 } }));
    await settle();
  });

  it('reads the server again on focus only once the last read is stale', async () => {
    create();
    await openOwned();

    window.dispatchEvent(new Event('focus'));
    await settle();
    http.expectNone(() => true);

    timing.refetchAfterMs = 0;
    window.dispatchEvent(new Event('focus'));
    (await expectRequest('GET')).flush(doc({ entries: { fromPhone: 1 } }));
    await settle();
    expect(readScopeProgress('saved:b1')).toEqual({ fromPhone: 1 });
  });

  it('reads the server again when asked to catch up, however recent the last read', async () => {
    const store = create();
    await openOwned();

    store.catchUp();
    (await expectRequest('GET')).flush(doc({ entries: { fromListPage: 1 } }));
    await settle();

    expect(readScopeProgress('saved:b1')).toEqual({ fromListPage: 1 });
  });

  describe('saving the build', () => {
    const published = { needed: ['k1'], route: { Thing: ['Quest A'] } };
    const order = { packs: ['Pack B'], quests: [] };

    it('has nothing to send with a save until friends have been shown a list', async () => {
      const store = create();
      expect(store.progressForSave(published)).toBeNull();

      await openOwned();
      expect(store.progressForSave(published)).toBeNull();

      store.publish({ needed: [], route: {} });
      (await expectRequest('PUT')).flush(doc({ needed: [], route: {} }));
      await settle();
      store.setOrder(order);
      (await expectRequest('PUT')).flush(doc({ needed: [], route: {}, order }));
      await settle();

      expect(store.progressForSave(published)).toEqual({ ...published, order });
    });

    it('sends the list with the save for a build whose server copy has one', async () => {
      const store = create();
      await openOwned(doc({ needed: [], route: {} }));

      expect(store.progressForSave(published)).toEqual({ ...published, order: null });
    });

    it('forgets what was queued for friends once a save stores the list, keeping an order arranged meanwhile', async () => {
      const store = create();
      await openOwned(doc({ needed: [], route: {} }));
      state.next({ ...OWNED, isDirty: true });
      addToOutbox('b1', { published: { needed: ['stale'], route: {} } });
      const sent = store.progressForSave(published)!;
      store.setOrder(order);

      state.next(OWNED);
      store.savedWithBuild(sent, true);

      expect(readOutbox('b1')).toEqual({ patch: {}, picksPatch: {}, order });
      (await expectRequest('PUT')).flush(doc({ needed: published.needed, route: published.route, order }));
      await settle();
      // What the save sent isn't published again.
      store.publish(published);
      await settle();
      http.expectNone(URL_B1);
    });

    it('sends the list the usual way when the save couldn\'t store it', async () => {
      const store = create();
      await openOwned(doc({ needed: [], route: {} }));
      const sent = store.progressForSave(published)!;

      store.savedWithBuild(sent, false);

      const put = await expectRequest('PUT');
      expect(put.request.body).toEqual({ ...published, order: null });
      put.flush(doc({ ...published }));
      await settle();
    });
  });

  it('publishes what friends see only when it changes', async () => {
    const store = create();
    await openOwned(doc({ needed: ['k1'], route: { Thing: ['Quest A'] } }));

    store.publish({ needed: ['k1'], route: { Thing: ['Quest A'] } });
    await settle();
    http.expectNone(() => true);

    store.publish({ needed: [], route: {} });
    const put = await expectRequest('PUT');
    expect(put.request.body).toEqual({ needed: [], route: {} });
    put.flush(doc({ needed: [], route: {} }));
    await settle();

    store.publish({ needed: [], route: {} });
    await settle();
  });

  it('drops an answer for a build that is no longer current', async () => {
    create();
    state.next(OWNED);
    const get = await expectRequest('GET');

    state.next(UNSAVED);
    get.flush(doc({ entries: { a: 1 } }));
    await settle();

    expect(readScopeProgress('saved:b1')).toEqual({});
    expect(readScopePicks('saved:b1')).toEqual({});
    expect(syncStates.at(-1)).toBe('off');
  });

  it('sends nothing once destroyed', async () => {
    const store = create();
    await openOwned();

    store.applyPatch({ a: 1 });
    store.ngOnDestroy();
    await settle();

    http.expectNone(() => true);
  });

  describe('leaving the page', () => {
    function setVisibility(visibility: DocumentVisibilityState): void {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
      document.dispatchEvent(new Event('visibilitychange'));
    }

    afterEach(() => {
      delete (document as { visibilityState?: unknown }).visibilityState;
    });

    it('sends what\'s queued as soon as the page is hidden, without waiting out the quiet spell', async () => {
      timing.debounceMs = 60000;
      const store = create();
      await openOwned();

      store.applyPatch({ a: 1 });
      await settle();
      http.expectNone(() => true);

      setVisibility('hidden');
      const put = await expectRequest('PUT');
      expect(put.request.body).toEqual({ patch: { a: 1 } });
      put.flush(doc({ entries: { a: 1 } }));
      await settle();
    });

    it('waits as usual while the page stays visible', async () => {
      timing.debounceMs = 60000;
      const store = create();
      await openOwned();

      store.applyPatch({ a: 1 });
      setVisibility('visible');
      await settle();

      http.expectNone(() => true);
    });

    it('leaves what friends see to the tab in use while hidden, still sending ticks', async () => {
      const store = create();
      await openOwned(doc({ needed: ['k1'], route: {} }));

      // Another tab's tick redraws this hidden tab's list, which offers its own copy.
      setVisibility('hidden');
      store.publish({ needed: [], route: {} });
      await settle();
      http.expectNone(() => true);

      store.applyPatch({ a: 1 });
      const put = await expectRequest('PUT');
      expect(put.request.body).toEqual({ patch: { a: 1 } });
      put.flush(doc({ entries: { a: 1 }, needed: ['k1'], route: {} }));
      await settle();

      setVisibility('visible');
      store.publish({ needed: [], route: {} });
      const publish = await expectRequest('PUT');
      expect(publish.request.body).toEqual({ needed: [], route: {} });
      publish.flush(doc({ entries: { a: 1 }, needed: [], route: {} }));
      await settle();
    });

    it('tries a failed write again when the page is shown again', async () => {
      const store = create();
      await openOwned();
      store.applyPatch({ a: 1 });
      (await expectRequest('PUT')).error(new ProgressEvent('error'));
      (await expectRequest('PUT')).error(new ProgressEvent('error'));
      await settle();
      http.expectNone(() => true);

      setVisibility('visible');
      (await expectRequest('PUT')).flush(doc({ entries: { a: 1 } }));
      await settle();
      expect(syncStates.at(-1)).toBe('synced');
    });

    it('sends what\'s still queued with keepalive when the page goes away, and keeps it queued', async () => {
      timing.debounceMs = 60000;
      const keepalive = vi.spyOn(TestBed.inject(BuildProgressService), 'flushWithKeepalive').mockReturnValue(true);
      const store = create();
      await openOwned();

      store.applyPatch({ a: 1 });
      window.dispatchEvent(new Event('pagehide'));

      expect(keepalive).toHaveBeenCalledWith('b1', { patch: { a: 1 } }, 'token');
      expect(readOutbox('b1')?.patch).toEqual({ a: 1 });
    });

    it('sends nothing with keepalive without a token from an earlier request', async () => {
      const keepalive = vi.spyOn(TestBed.inject(BuildProgressService), 'flushWithKeepalive').mockReturnValue(true);
      getAccessToken.mockResolvedValue(null);
      addToOutbox('b1', { patch: { a: 1 } });
      create();
      state.next(OWNED);
      await settle();

      window.dispatchEvent(new Event('pagehide'));

      expect(keepalive).not.toHaveBeenCalled();
    });
  });
});
