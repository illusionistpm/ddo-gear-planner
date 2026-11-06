import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';

import { BuildUrlCodecService } from '../../build/build-url-codec.service';
import { LiveBuildList, LiveBuildListService, LiveBuildState } from '../../build/live-build-list.service';
import { QuestService } from '../../gear/quest.service';
import { EquippedService } from '../equipped.service';
import { FriendView, FriendShoppingListService } from './friend-shopping-list.service';
describe('FriendShoppingListService', () => {
  let live: BehaviorSubject<LiveBuildState>;
  let watchLive: ReturnType<typeof vi.fn>;
  let service: FriendShoppingListService;
  let latest: FriendView;
  let blob: string;

  beforeEach(() => {
    live = new BehaviorSubject<LiveBuildState>({ list: null, connection: 'connecting', gone: false });
    watchLive = vi.fn(() => live);
    TestBed.configureTestingModule({
      providers: [
        { provide: LiveBuildListService, useValue: { watch: watchLive } },
        // A pack per item's quest, so the list has two packs to arrange.
        { provide: QuestService, useValue: { isRaid: () => false, getPack: (quest: string) => `Pack of ${quest}` } }
      ]
    });
    service = TestBed.inject(FriendShoppingListService);
    blob = TestBed.inject(BuildUrlCodecService).encode({ Helm: 'Epic Deific Diadem', Boots: "Admiral's Gumshoes", Armor: 'Deep Arcanum' });
  });

  function shared(overrides: Partial<LiveBuildList> = {}): LiveBuildList {
    return { name: 'Theirs', blob, needed: null, route: {}, order: null, version: 'v1', ...overrides };
  }

  function arrive(list: LiveBuildList, connection: LiveBuildState['connection'] = 'live'): void {
    live.next({ list, connection, gone: false });
  }

  function watch(): void {
    service.watch('s1').subscribe(view => latest = view);
  }

  const ready = () => latest.build as Extract<FriendView['build'], { status: 'ready' }>;

  it('reads the build from the live list, without loading it into the planner', () => {
    watch();
    expect(watchLive).toHaveBeenCalledWith('s1');
    expect(latest).toEqual({ build: { status: 'loading' }, list: null });

    arrive(shared());

    expect(ready().name).toBe('Theirs');
    expect(ready().entries.find(e => e.kind === 'gear')?.label).toBe('Epic Deific Diadem');
    expect(TestBed.inject(EquippedService).getSlotsSnapshot().get('Helm')).toBeNull();
  });

  it('lists what the owner last published, routed as the owner\'s list is', () => {
    watch();
    arrive(shared());
    // Something that comes from more than one quest, sent to its second.
    const thing = ready().entries.find(e => e.sources.length > 1)!;
    expect(thing).toBeDefined();
    const quest = thing.sources[1].quest;

    arrive(shared({ needed: [thing.key], route: { [thing.identity]: [quest] }, version: 'v2' }));

    expect(latest.list).toMatchObject({ needed: 1, notShared: false, connection: 'live' });
    expect(latest.list!.view.sections.flatMap(section => section.groups.map(group => group.label))).toEqual([quest]);
  });

  it('lists everything the build needs when the owner has shared nothing', () => {
    watch();
    arrive(shared());

    expect(latest.list).toMatchObject({ needed: ready().entries.length, notShared: true });
  });

  it('lists packs and quests in the order the owner arranged them', () => {
    watch();
    arrive(shared());
    const packs = latest.list!.view.sections.map(section => section.label);
    expect(packs.length).toBeGreaterThan(1);

    arrive(shared({ order: { packs: [...packs].reverse(), quests: [] }, version: 'v2' }));

    expect(latest.list!.view.sections.map(section => section.label)).toEqual([...packs].reverse());
  });

  it('works out the entries again only when the owner saves new gear', () => {
    watch();
    arrive(shared());
    const first = ready().entries;

    arrive(shared({ needed: [], version: 'v2' }));
    expect(ready().entries).toBe(first);

    arrive(shared({ blob: TestBed.inject(BuildUrlCodecService).encode({ Helm: 'Epic Deific Diadem' }), version: 'v3' }));
    expect(ready().entries).not.toBe(first);
    expect(ready().entries.filter(e => e.kind === 'gear').map(e => e.label)).toEqual(['Epic Deific Diadem']);
  });

  it('says how live it is, keeping the list through a dropped connection', () => {
    watch();
    arrive(shared());

    arrive(shared(), 'reconnecting');
    expect(latest.list?.connection).toBe('reconnecting');

    arrive(shared(), 'offline');
    expect(latest.build.status).toBe('ready');
    expect(latest.list?.connection).toBe('offline');
  });

  it("says when there's no such build, when its link is too old to read, and when it was never reached", () => {
    watch();

    live.next({ list: null, connection: 'offline', gone: false });
    expect(latest.build).toEqual({ status: 'error', error: 'network' });

    arrive(shared({ blob: 'not a blob' }));
    expect(latest.build).toEqual({ status: 'error', error: 'invalid-link' });

    live.next({ list: null, connection: 'live', gone: true });
    expect(latest).toEqual({ build: { status: 'error', error: 'not-found' }, list: null });
  });
});
