import type { ShoppingEntry, ShoppingSource } from './shopping-list-types';
import { formatShoppingListText } from './shopping-list-text';
import { buildShoppingListView } from './shopping-list-view-model';

function from(quest: string, pack: string | null = null, raid = false): ShoppingSource {
  return { quest, pack, raid };
}

function entry(init: Partial<ShoppingEntry> & { key: string }): ShoppingEntry {
  return {
    kind: 'gear', slot: 'Ring1', identity: init.key, label: init.key, system: null, itemName: init.key, ml: 0,
    sources: [], sourceInherited: false, raid: false, rare: false, artifact: false,
    wikiUrl: null, troveName: null, parentKey: null, details: [],
    ...init,
  };
}

const sword = entry({ key: 'g|Weapon|Sword', slot: 'Weapon', identity: 'gear|Sword', label: 'Sword', ml: 32,
  sources: [from('The Raid', 'Raid Pack', true)], raid: true, details: ['Strength +5 Enhancement'] });
const step = entry({ key: 's|Weapon|Sword|Lost Purpose#0|Set', kind: 'step', slot: 'Weapon', identity: 'step|lp',
  label: 'Armaments of the Archons', system: 'Lost Purpose', sources: sword.sources, sourceInherited: true,
  parentKey: sword.key });
const ring1 = entry({ key: 'g|Ring1|Ring', identity: 'gear|Ring', label: 'Ring', ml: 30, sources: [from('The Snitch')] });
const ring2 = entry({ key: 'g|Ring2|Ring', slot: 'Ring2', identity: 'gear|Ring', label: 'Ring', ml: 30,
  sources: [from('The Snitch')] });
const augment = entry({ key: 'a|Weapon|Red#0|Ruby', kind: 'augment', slot: 'Weapon', identity: 'augment|Ruby',
  label: 'Ruby of Frost', parentKey: sword.key });
const entries = [sword, step, augment, ring1, ring2];

function text(progress: Record<string, 0 | 1>, name: string | null = 'Tank') {
  return formatShoppingListText(
    buildShoppingListView(entries, progress, null, { groupMode: 'source', filter: 'needed' }), name);
}

describe('formatShoppingListText', () => {
  it('lists what is still needed by pack and quest, with counts, crafting and rolls', () => {
    expect(text({ [ring1.key]: 1 })).toBe([
      'Still needed for Tank (4):',
      '',
      '== Raid Pack ==',
      'The Raid (raid)',
      '- Sword (ML 32, roll: Strength +5 Enhancement)',
      '  - Lost Purpose: Armaments of the Archons',
      '',
      '== Other sources ==',
      'The Snitch',
      '- Ring (ML 30)',
      '',
      'Unknown source',
      '- Ruby of Frost (augment, for Sword (Weapon))',
    ].join('\n'));
  });

  it('counts copies still missing and keeps an item that only needs its crafting', () => {
    expect(text({ [sword.key]: 1, [augment.key]: 1 }, null)).toBe([
      'Still needed for my build (3):',
      '',
      '== Raid Pack ==',
      'The Raid (raid)',
      '- Sword (have it, roll: Strength +5 Enhancement)',
      '  - Lost Purpose: Armaments of the Archons',
      '',
      '== Other sources ==',
      'The Snitch',
      '- Ring x2 (ML 30)',
    ].join('\n'));
  });

  it('says where else something comes from, naming up to two quests', () => {
    const twice = entry({ ...augment, sources: [from('The Raid', 'Raid Pack', true), from('Vendor')] });
    const everywhere = entry({ ...augment, key: 'a|Weapon|Red#1|Ruby', sources: ['A', 'B', 'C', 'D'].map(quest => from(quest)) });
    const listed = (list: ShoppingEntry[]) => formatShoppingListText(
      buildShoppingListView(list, {}, null, { groupMode: 'source', filter: 'needed' }), 'Tank').split('\n');

    expect(listed([sword, twice])).toContain('- Ruby of Frost (augment, for Sword (Weapon), also from Vendor)');
    expect(listed([sword, twice])).toContain('- Ruby of Frost (augment, for Sword (Weapon), also from The Raid)');
    expect(listed([sword, everywhere])).toContain('- Ruby of Frost (augment, for Sword (Weapon), also from 3 other quests)');
  });

  it('says when there is nothing left to get', () => {
    const all = Object.fromEntries(entries.map(candidate => [candidate.key, 1 as const]));
    expect(text(all)).toBe('Nothing left to get for Tank.');
  });
});
