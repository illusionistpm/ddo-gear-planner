import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';

import { BuildProgressService, PublicBuildProgress } from '../../build/build-progress.service';
import { BuildUrlCodecService } from '../../build/build-url-codec.service';
import { BuildsService } from '../../build/builds.service';
import { EquippedService } from '../equipped.service';
import { FRIEND_REFRESH_INTERVAL_MS, FriendBuild, FriendShoppingList, FriendShoppingListService } from './friend-shopping-list.service';
import type { ShoppingEntry, ShoppingSource } from './shopping-list-types';

function from(quest: string): ShoppingSource {
  return { quest, pack: null, raid: false, wikiUrl: `wiki/${quest}` };
}

function entry(init: Partial<ShoppingEntry> & { key: string }): ShoppingEntry {
  return {
    kind: 'gear', identity: init.key, label: init.key, system: null, ml: 0, sources: [], sourceInherited: false,
    rare: false, artifact: false, wikiUrl: null, troveName: null, parentKey: null, details: [], ...init,
  };
}

// The ring drops in Quest A, so the list's own route gets the ruby there too.
const ring = entry({ key: 'g|Ring1|Ring', identity: 'gear|Ring', label: 'Ring', sources: [from('Quest A')] });
const ruby = entry({ key: 'a|Ring1|Red#0|Ruby', kind: 'augment', identity: 'augment|Ruby', label: 'Ruby',
  sources: [from('Quest A'), from('Quest B')], parentKey: ring.key });
const boots = entry({ key: 'g|Feet|Boots', identity: 'gear|Boots', label: 'Boots', sources: [from('Quest C')] });

describe('FriendShoppingListService', () => {
  let getPublic: ReturnType<typeof vi.fn>;
  let getByShortId: ReturnType<typeof vi.fn>;
  let service: FriendShoppingListService;
  let latest: FriendShoppingList;

  beforeEach(() => {
    getPublic = vi.fn();
    getByShortId = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: BuildProgressService, useValue: { getPublic } },
        { provide: BuildsService, useValue: { getByShortId } }
      ]
    });
    service = TestBed.inject(FriendShoppingListService);
  });

  function watch(): void {
    service.list('s1', [ring, ruby, boots]).subscribe(list => latest = list);
  }

  describe('reading the build', () => {
    const states = (shortId: string) => {
      const seen: FriendBuild[] = [];
      service.build(shortId).subscribe(build => seen.push(build));
      return seen;
    };

    it('lists what its gear needs, without loading it into the planner', () => {
      const blob = TestBed.inject(BuildUrlCodecService).encode({ Helm: 'Epic Deific Diadem' });
      getByShortId.mockReturnValue(of({ name: 'Theirs', blob }));

      const [loading, ready] = states('s1');

      expect(getByShortId).toHaveBeenCalledWith('s1');
      expect(loading).toEqual({ status: 'loading' });
      expect(ready.status).toBe('ready');
      const { name, entries } = ready as Extract<FriendBuild, { status: 'ready' }>;
      expect(name).toBe('Theirs');
      expect(entries.find(entry => entry.kind === 'gear')?.label).toBe('Epic Deific Diadem');
      expect(TestBed.inject(EquippedService).getSlotsSnapshot().get('Helm')).toBeNull();
    });

    it("says when there's no such build, when its link is too old to read, and when it couldn't be fetched", () => {
      getByShortId.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
      expect(states('gone').at(-1)).toEqual({ status: 'error', error: 'not-found' });

      getByShortId.mockReturnValue(of({ name: 'Old', blob: 'not a blob' }));
      expect(states('old').at(-1)).toEqual({ status: 'error', error: 'invalid-link' });

      getByShortId.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
      expect(states('offline').at(-1)).toEqual({ status: 'error', error: 'network' });
    });
  });

  /** Each quest card with what's listed there. */
  const listed = () => latest.view!.sections.flatMap(section => section.groups)
    .map(group => [group.label, group.rows.flatMap(row => [row.entry.label, ...row.children.map(child => child.entry.label)])]);

  it('lists what the owner last published for the build, routed as the owner\'s list is', () => {
    const published: PublicBuildProgress = { needed: [ruby.key], route: { 'augment|Ruby': ['Quest B'] }, updatedAt: 'now' };
    getPublic.mockReturnValue(of(published));

    watch();

    expect(getPublic).toHaveBeenCalledWith('s1');
    expect(listed()).toEqual([['Quest B', ['Ruby']]]);
    expect(latest).toMatchObject({ needed: 1, notShared: false, failed: false });
  });

  it('lists packs and quests in the order the owner arranged them', () => {
    const packed = (quest: string, pack: string) => ({ quest, pack, raid: false, wikiUrl: `wiki/${quest}` });
    const inA = entry({ key: 'g|A', identity: 'gear|A', label: 'A', sources: [packed('Quest A', 'Pack A')] });
    const inB = entry({ key: 'g|B', identity: 'gear|B', label: 'B', sources: [packed('Quest B', 'Pack B')] });
    getPublic.mockReturnValue(of({ needed: null, route: {}, order: { packs: ['Pack B', 'Pack A'], quests: [] }, updatedAt: 'now' }));

    service.list('s1', [inA, inB]).subscribe(list => latest = list);

    expect(latest.view!.sections.map(section => section.label)).toEqual(['Pack B', 'Pack A']);
  });

  it('says it\'s loading until the owner\'s list arrives', () => {
    const response = new Subject<PublicBuildProgress>();
    getPublic.mockReturnValue(response);

    watch();
    expect(latest).toMatchObject({ view: null, failed: false });

    response.next({ needed: [], route: {}, updatedAt: 'now' });
    expect(latest.view?.sections).toEqual([]);
    expect(latest.needed).toBe(0);
  });

  it('lists everything the build needs when the owner has shared nothing', () => {
    getPublic.mockReturnValue(of({ needed: null, route: {}, updatedAt: null }));
    watch();
    expect(latest).toMatchObject({ needed: 3, notShared: true });
  });

  it('fetches again on Refresh, but not within 30 s of the last fetch', () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    getPublic.mockReturnValue(of({ needed: [boots.key], route: {}, updatedAt: 'now' }));
    watch();

    now += FRIEND_REFRESH_INTERVAL_MS - 1;
    expect(service.refresh()).toBe(false);
    expect(getPublic).toHaveBeenCalledTimes(1);

    getPublic.mockReturnValue(of({ needed: [], route: {}, updatedAt: 'later' }));
    now += 1;
    expect(service.refresh()).toBe(true);
    expect(getPublic).toHaveBeenCalledTimes(2);
    expect(latest.needed).toBe(0);
  });

  it('keeps the last list when a Refresh fails, saying so, and lets Refresh try again at once', () => {
    getPublic.mockReturnValue(of({ needed: [boots.key], route: {}, updatedAt: 'now' }));
    watch();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + FRIEND_REFRESH_INTERVAL_MS);

    getPublic.mockReturnValue(throwError(() => new Error('offline')));
    service.refresh();
    expect(listed()).toEqual([['Quest C', ['Boots']]]);
    expect(latest.failed).toBe(true);

    getPublic.mockReturnValue(of({ needed: [], route: {}, updatedAt: 'later' }));
    expect(service.refresh()).toBe(true);
    expect(latest).toMatchObject({ needed: 0, failed: false });
  });

  it('says when the owner\'s list couldn\'t be fetched at all', () => {
    getPublic.mockReturnValue(throwError(() => new Error('offline')));

    watch();

    expect(latest).toMatchObject({ view: null, failed: true });
  });
});
