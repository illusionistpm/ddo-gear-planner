import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, firstValueFrom, of, Subject, throwError } from 'rxjs';

import { BuildProgressService } from '../../build/build-progress.service';
import { GroupsService } from '../../build/groups.service';
import type { LiveBuildList } from '../../build/live-build-list.service';
import { LiveGroupList, LiveGroupListService, LiveGroupState } from '../../build/live-group-list.service';
import { AuthService } from '../../shared/auth.service';
import { UserGearService, UserItemLocation } from '../user-gear.service';
import { FriendShoppingListService } from './friend-shopping-list.service';
import { GROUP_RUN_TIMING, GroupRunService, GroupRunView } from './group-run.service';
import type { ShoppingEntry, ShoppingRow } from './shopping-list-types';

function entry(key: string, label: string): ShoppingEntry {
  return {
    key, kind: 'gear', identity: `gear|${label}`, label, system: null, ml: 1,
    sources: [{ quest: 'The Snitch', pack: 'Sharn', raid: false, wikiUrl: 'wiki/The Snitch' }],
    sourceInherited: false, rare: false, artifact: false, wikiUrl: null, troveName: label, parentKey: null, details: []
  };
}

// Kira (yours) needs two rings and a cloak; Vex (a friend's) one ring.
const ENTRIES: Record<string, ShoppingEntry[]> = {
  'z1.kira': [entry('g|Ring1|Ring', 'Ring'), entry('g|Ring2|Ring', 'Ring'), entry('g|Back|Cloak', 'Cloak')],
  'z1.vex': [entry('g|Ring1|Ring', 'Ring')]
};

function list(blob: string, needed: string[] | null, version = '2026-11-05T10:00:00.000Z'): LiveBuildList {
  return { name: blob, blob, needed, route: { 'gear|Ring': ['The Snitch'] }, order: null, version };
}

function group(kira: LiveBuildList, vex: LiveBuildList = list('z1.vex', null)): LiveGroupList {
  return {
    name: 'Reaper night', picks: {}, order: null, version: '2026-11-05T09:00:00.000Z',
    members: [{ buildId: 'b-kira', characterName: 'Kira', list: kira }, { buildId: 'b-vex', characterName: 'Vex', list: vex }]
  };
}

describe('GroupRunService', () => {
  let service: GroupRunService;
  let states: Subject<LiveGroupState>;
  let put: ReturnType<typeof vi.fn>;
  let putRoute: ReturnType<typeof vi.fn>;
  let latest: GroupRunView;
  let trove: Map<string, UserItemLocation[]>;
  let troveChanged: Subject<void>;

  beforeEach(() => {
    states = new Subject<LiveGroupState>();
    put = vi.fn(() => of({ updatedAt: '2026-11-05T11:00:00.000Z' }));
    putRoute = vi.fn(() => of({}));
    trove = new Map();
    troveChanged = new Subject<void>();
    TestBed.configureTestingModule({
      providers: [
        GroupRunService,
        { provide: GROUP_RUN_TIMING, useValue: { sendAfterMs: 0, retryAfterMs: [0] } },
        { provide: LiveGroupListService, useValue: { watch: vi.fn(() => states) } },
        { provide: GroupsService, useValue: { viewer: vi.fn(() => of({ isHost: true, yourBuildIds: ['b-kira'] })), putRoute } },
        { provide: BuildProgressService, useValue: { put } },
        { provide: FriendShoppingListService, useValue: { entriesOf: (blob: string) => ENTRIES[blob] ?? null } },
        { provide: AuthService, useValue: { isAuthenticated$: new BehaviorSubject(true) } },
        { provide: UserGearService, useValue: { getItemLocations: (name: string) => trove.get(name), userItemsChanged$: troveChanged } }
      ]
    });
    service = TestBed.inject(GroupRunService);
    service.view$.subscribe(view => latest = view);
    service.open('grp1', 'token');
  });

  const arrive = (next: LiveGroupList) => states.next({ group: next, connection: 'live', gone: false });
  const rows = (): ShoppingRow[] => latest.view!.sections.flatMap(section => section.groups.flatMap(card => card.rows));
  const row = (label: string) => rows().find(candidate => candidate.entry.label === label)!;
  const settle = () => new Promise(resolve => setTimeout(resolve, 5));

  it('shows everyone\'s rows together, each saying whose it is, with each character and how much they still need', () => {
    arrive(group(list('z1.kira', ['g|Ring1|Ring', 'g|Ring2|Ring', 'g|Back|Cloak'])));

    expect(latest.name).toBe('Reaper night');
    expect(latest.isHost).toBe(true);
    expect([...latest.yours]).toEqual(['b-kira']);
    expect(row('Ring').members.map(part => [part.member, part.quantity])).toEqual([['b-kira', 2], ['b-vex', 1]]);
    expect(latest.characters.map(character => [character.characterName, character.mine, character.needed, character.accent]))
      .toEqual([['Kira', true, 3, 0], ['Vex', false, 1, 1]]);
  });

  it('ticks your character\'s copy at once, then sends it as the build\'s owner would, with the needed list it leaves', async () => {
    arrive(group(list('z1.kira', ['g|Ring1|Ring', 'g|Ring2|Ring', 'g|Back|Cloak'])));

    service.toggleChip(row('Ring'), 'b-kira');

    expect(row('Ring').members[0].acquired).toBe(1);
    await settle();
    expect(put).toHaveBeenCalledWith('b-kira', {
      patch: { 'g|Ring1|Ring': 1 },
      needed: ['g|Ring2|Ring', 'g|Back|Cloak'],
      route: { 'gear|Ring': ['The Snitch'] }
    });
  });

  it('keeps showing the tick until the build\'s list comes back with it, then takes it from there', async () => {
    arrive(group(list('z1.kira', ['g|Ring1|Ring', 'g|Ring2|Ring', 'g|Back|Cloak'])));
    service.toggleChip(row('Ring'), 'b-kira');
    await settle();

    // An older list, from before the write, doesn't undo it.
    arrive(group(list('z1.kira', ['g|Ring1|Ring', 'g|Ring2|Ring', 'g|Back|Cloak'], '2026-11-05T10:30:00.000Z')));
    expect(row('Ring').members[0].acquired).toBe(1);

    arrive(group(list('z1.kira', ['g|Ring2|Ring', 'g|Back|Cloak'], '2026-11-05T11:00:00.000Z')));
    expect(row('Ring').members[0].acquired).toBe(1);
    // Kira's own list is now what says so: unticked there, it's unticked here.
    arrive(group(list('z1.kira', ['g|Ring1|Ring', 'g|Ring2|Ring', 'g|Back|Cloak'], '2026-11-05T12:00:00.000Z')));
    expect(row('Ring').members[0].acquired).toBe(0);
  });

  it('badges what you own in your trove, without ticking anyone\'s off, and again when it\'s imported', () => {
    arrive(group(list('z1.kira', null)));
    expect(row('Ring').ownedLocations).toBeNull();

    trove.set('Ring', [{ character: 'Khalarim', location: 'Bank', tab: '1' }]);
    troveChanged.next();

    expect(row('Ring').ownedLocations).toEqual([expect.objectContaining({ character: 'Khalarim' })]);
    expect(row('Ring').acquired).toBe(0);
    expect(row('Cloak').ownedLocations).toBeNull();
  });

  it('ticks nothing for a character that isn\'t yours', async () => {
    arrive(group(list('z1.kira', null)));

    service.toggleChip(row('Ring'), 'b-vex');

    expect(row('Ring').members[1].acquired).toBe(0);
    await settle();
    expect(put).not.toHaveBeenCalled();
  });

  it('ticks all of your copies from the row\'s box, leaving friends\' as they are', async () => {
    arrive(group(list('z1.kira', null)));

    service.toggleRow(row('Ring'));
    await settle();

    expect(row('Ring').members.map(part => part.acquired)).toEqual([2, 0]);
    expect(put).toHaveBeenCalledWith('b-kira', expect.objectContaining({
      patch: { 'g|Ring1|Ring': 1, 'g|Ring2|Ring': 1 }, needed: ['g|Back|Cloak']
    }));
  });

  it('gives up on ticks the server refuses, undoing them and saying whose', async () => {
    put.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    arrive(group(list('z1.kira', null)));

    service.toggleChip(row('Cloak'), 'b-kira');
    await settle();

    expect(row('Cloak').state).toBe('unchecked');
    expect(latest.unsaved).toEqual(['Kira']);
  });

  it('shows only your rows, or one character\'s, routed as the group\'s are', () => {
    arrive(group(list('z1.kira', null)));

    service.show('b-vex');
    expect(rows().map(candidate => candidate.entry.label)).toEqual(['Ring']);
    expect(row('Ring').members.map(part => part.member)).toEqual(['b-vex']);

    service.show('mine');
    expect(rows().map(candidate => candidate.entry.label).sort()).toEqual(['Cloak', 'Ring']);
  });

  it('sends the host\'s Arrange moves to the group\'s shared route', async () => {
    arrive({ ...group(list('z1.kira', null)), order: { packs: [], quests: ['Q2', 'Q1'] } });

    service.arrangePacks(['Sharn', '']);
    service.arrangeQuests(['Q1']);
    service.resetOrder();
    await service.pickSources(row('Ring'), ['The Snitch']);

    expect(putRoute.mock.calls.map(([, body]) => body)).toEqual([
      { order: { packs: ['Sharn', ''], quests: ['Q2', 'Q1'] } },
      // Each move builds on the one before, though the group hasn't come back with it yet.
      { order: { packs: ['Sharn', ''], quests: ['Q2', 'Q1'] } },
      { order: null },
      { picksPatch: { 'gear|Ring': ['The Snitch'] } }
    ]);
  });

  it('shows an Arrange move at once, until the group comes back with it', () => {
    const route = new Subject<object>();
    putRoute.mockReturnValue(route);
    arrive(group(list('z1.kira', null)));

    service.arrangePacks(['Sharn']);
    expect(latest.view!.arranged).toBe(true);

    // A tick arriving meanwhile, with the route as it was, doesn't undo the move.
    arrive(group(list('z1.kira', ['g|Ring1|Ring'])));
    expect(latest.view!.arranged).toBe(true);

    arrive({ ...group(list('z1.kira', null)), order: { packs: ['Sharn'], quests: [] } });
    route.next({});
    route.complete();
    // The group's order is now what says so: reset elsewhere, it's reset here.
    arrive(group(list('z1.kira', null)));
    expect(latest.view!.arranged).toBe(false);
  });

  it('puts the group\'s own order back when an Arrange move can\'t be saved', async () => {
    putRoute.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 429 })));
    arrive(group(list('z1.kira', null)));

    service.arrangePacks(['Sharn']);
    await settle();

    expect(latest.view!.arranged).toBe(false);
  });

  it('says the group is gone when it is', async () => {
    states.next({ group: null, connection: 'live', gone: true });

    expect((await firstValueFrom(service.view$)).gone).toBe(true);
  });
});
