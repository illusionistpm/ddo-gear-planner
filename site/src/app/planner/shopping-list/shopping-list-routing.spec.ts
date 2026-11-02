import { NO_PACK_KEY } from '../../gear/pack-filter';
import type { ShoppingSource } from './shopping-list-types';
import { comparePacks, routeSources, ShoppingRouteOptions } from './shopping-list-routing';

function from(quest: string, pack: string | null = 'Pack'): ShoppingSource {
  return { quest, pack, raid: false, wikiUrl: `wiki/${quest}` };
}

function route(things: Record<string, ShoppingSource[]>, options: Partial<ShoppingRouteOptions> = {}): Record<string, string[]> {
  const routed = routeSources(new Map(Object.entries(things)), { hiddenPacks: new Set(), picks: {}, ...options });
  return Object.fromEntries(Array.from(routed, ([identity, sources]) => [identity, sources.map(source => source.quest)]));
}

describe('routeSources', () => {
  it('keeps the one source of something from one place, and none for something from nowhere known', () => {
    expect(route({ ring: [from('A')], diamond: [] })).toEqual({ ring: ['A'], diamond: [] });
  });

  it('sends something to a quest you are going to anyway', () => {
    expect(route({ ring: [from('B')], gem: [from('A'), from('B'), from('C')] })).toEqual({ ring: ['B'], gem: ['B'] });
  });

  it('otherwise sends things to the quest that has the most of them, then by name', () => {
    expect(route({
      one: [from('A'), from('B')],
      two: [from('B'), from('C')],
      three: [from('D'), from('B')],
      four: [from('E'), from('D')],
    })).toEqual({ one: ['B'], two: ['B'], three: ['B'], four: ['D'] });
    expect(route({ gem: [from('Zoo'), from('Abbot')] })).toEqual({ gem: ['Abbot'] });
  });

  it('goes to events, then quests in no pack, then the store, only when nothing better has it', () => {
    const store = from('DDO Store', 'DDO Store');
    const free = from('Free Quest', null);
    const party = from('Party', 'Events');
    expect(route({
      fromAll: [store, free, party, from('Pack Quest')],
      noPack: [store, free, party],
      notEvent: [store, free],
      storeOnly: [store],
      // You're going to the free quest for the ring, but the gem drops in a pack too.
      ring: [from('Other Free', null)],
      gem: [from('Other Free', null), from('Pack Quest 2')],
    })).toEqual({
      fromAll: ['Pack Quest'], noPack: ['Party'], notEvent: ['Free Quest'], storeOnly: ['DDO Store'],
      ring: ['Other Free'], gem: ['Pack Quest 2'],
    });
  });

  it('leaves out packs the pack filter hides, unless that leaves nowhere', () => {
    const hidden = { hiddenPacks: new Set(['Hidden', NO_PACK_KEY]) };
    expect(route({
      gem: [from('A', 'Hidden'), from('B', 'Shown')],
      free: [from('C', null), from('D', 'Shown')],
      onlyHidden: [from('E', 'Hidden'), from('F', 'Hidden')],
    }, hidden)).toEqual({ gem: ['B'], free: ['D'], onlyHidden: ['E'] });
  });

  it('takes the user\'s picks over the route, and routes the rest around them', () => {
    expect(route({
      gem: [from('A'), from('B'), from('C')],
      other: [from('B'), from('C')],
    }, { picks: { gem: ['C', 'A'] } })).toEqual({ gem: ['A', 'C'], other: ['C'] });
  });

  it('ignores a pick of somewhere the thing no longer comes from', () => {
    expect(route({ gem: [from('A'), from('B')] }, { picks: { gem: ['Gone'] } })).toEqual({ gem: ['A'] });
  });

  it('names each quest once', () => {
    expect(route({ gem: [from('A'), from('A')] })).toEqual({ gem: ['A'] });
  });
});

describe('comparePacks', () => {
  it('puts the packs by name first, then events, quests in no pack, and the store', () => {
    expect(['DDO Store', '', 'Events', 'Sharn', 'Amrath'].sort(comparePacks))
      .toEqual(['Amrath', 'Sharn', 'Events', '', 'DDO Store']);
  });
});
