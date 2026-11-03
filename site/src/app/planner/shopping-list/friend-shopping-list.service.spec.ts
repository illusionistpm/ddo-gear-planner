import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';

import { BuildProgressService, PublicBuildProgress } from '../../build/build-progress.service';
import { CurrentBuildService, CurrentBuildState } from '../../build/current-build.service';
import { snapshotLink } from '../../build/shopping-list-link';
import { FiltersService } from '../filters.service';
import { FRIEND_REFRESH_INTERVAL_MS, FriendShoppingList, FriendShoppingListService } from './friend-shopping-list.service';
import { ShoppingListService } from './shopping-list.service';
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

const SAVED: CurrentBuildState = { savedBuildId: null, shortId: 's1', name: 'Theirs', isDirty: false, ownership: 'other' };

describe('FriendShoppingListService', () => {
  let state: BehaviorSubject<CurrentBuildState>;
  let getPublic: ReturnType<typeof vi.fn>;
  let service: FriendShoppingListService;
  let latest: FriendShoppingList;

  beforeEach(() => {
    state = new BehaviorSubject(SAVED);
    getPublic = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: ShoppingListService, useValue: { entries$: new BehaviorSubject([ring, ruby, boots]) } },
        { provide: CurrentBuildService, useValue: { state$: state } },
        { provide: BuildProgressService, useValue: { getPublic } },
        { provide: FiltersService, useValue: { getItemFilters: () => of({ hiddenPacks: new Set() }) } }
      ]
    });
    service = TestBed.inject(FriendShoppingListService);
  });

  function watch(link: Parameters<FriendShoppingListService['listFor']>[0]): void {
    service.listFor(link).subscribe(list => latest = list);
  }

  /** Each quest card with what's listed there. */
  const listed = () => latest.view!.sections.flatMap(section => section.groups)
    .map(group => [group.label, group.rows.flatMap(row => [row.entry.label, ...row.children.map(child => child.entry.label)])]);

  it('lists what a snapshot link names, routed as the friend\'s own list would', () => {
    watch(snapshotLink([ruby.key, boots.key]));

    expect(listed()).toEqual([['Quest A', ['Ruby']], ['Quest C', ['Boots']]]);
    expect(latest).toMatchObject({ needed: 2, live: false, notShared: false, failed: false });
    expect(getPublic).not.toHaveBeenCalled();
  });

  it('lists what the owner last published for a live link, routed as the owner\'s list is', () => {
    const published: PublicBuildProgress = { needed: [ruby.key], route: { 'augment|Ruby': ['Quest B'] }, updatedAt: 'now' };
    getPublic.mockReturnValue(of(published));

    watch({ kind: 'live' });

    expect(getPublic).toHaveBeenCalledWith('s1');
    expect(listed()).toEqual([['Quest B', ['Ruby']]]);
    expect(latest).toMatchObject({ needed: 1, live: true, notShared: false, failed: false });
  });

  it('says it\'s loading until the owner\'s list arrives', () => {
    const response = new Subject<PublicBuildProgress>();
    getPublic.mockReturnValue(response);

    watch({ kind: 'live' });
    expect(latest).toMatchObject({ view: null, failed: false });

    response.next({ needed: [], route: {}, updatedAt: 'now' });
    expect(latest.view?.sections).toEqual([]);
    expect(latest.needed).toBe(0);
  });

  it('lists everything the build needs when the owner has shared nothing, or the build isn\'t saved', () => {
    getPublic.mockReturnValue(of({ needed: null, route: {}, updatedAt: null }));
    watch({ kind: 'live' });
    expect(latest).toMatchObject({ needed: 3, notShared: true });

    state.next({ ...SAVED, shortId: null });
    expect(getPublic).toHaveBeenCalledTimes(1);
    expect(latest).toMatchObject({ needed: 3, notShared: true });
  });

  it('fetches again on Refresh, but not within 30 s of the last fetch', () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    getPublic.mockReturnValue(of({ needed: [boots.key], route: {}, updatedAt: 'now' }));
    watch({ kind: 'live' });

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
    watch({ kind: 'live' });
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

    watch({ kind: 'live' });

    expect(latest).toMatchObject({ view: null, failed: true });
  });
});
