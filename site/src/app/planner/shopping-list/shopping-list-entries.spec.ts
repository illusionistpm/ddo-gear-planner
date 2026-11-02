import { Craftable } from '../../gear/craftable';
import { CraftableOption } from '../../gear/craftable-option';
import { Item, ItemInit } from '../../gear/item';
import { CANNITH_CRAFTING_SOURCE, deriveShoppingEntries, ShoppingSourceLookup } from './shopping-list-entries';

const sources: ShoppingSourceLookup = {
  isRaid: quest => quest === 'The Raid',
  packOf: quest => ({ 'The Snitch': 'Sharn Pack', 'Augment Vendor': null, 'The Raid': 'Raid Pack' } as
    Record<string, string | null>)[quest] ?? null,
};

const page = (title: string) => `https://ddowiki.com/page/${title}`;
const search = (name: string) => `https://ddowiki.com/page/Special:Search?go=Go&search=${name}`;

function item(init: Partial<ItemInit> & { name: string }): Item {
  return new Item({ slot: 'Ring1', ml: 30, quests: ['The Snitch'], ...init } as ItemInit);
}

function slots(entries: Record<string, Item | null>): Map<string, Item | null> {
  return new Map(Object.entries(entries));
}

function chosen(name: string, options: CraftableOption[], selection: string): Craftable {
  const craftable = new Craftable(name, options);
  craftable.selectByParamDescription(selection);
  return craftable;
}

describe('deriveShoppingEntries', () => {
  it('lists each equipped item with its sources, in display order, skipping empty slots', () => {
    const entries = deriveShoppingEntries(slots({
      Ring1: item({ name: 'Ring of Things' }),
      Weapon: item({ name: 'Big Sword', slot: 'Weapon', quests: ['The Raid'], url: '/page/Item:Big_Sword' }),
      Helm: null,
    }), sources);

    expect(entries.map(entry => entry.key)).toEqual(['g|Weapon|Big Sword', 'g|Ring1|Ring of Things']);
    expect(entries[0]).toEqual(expect.objectContaining({
      kind: 'gear', label: 'Big Sword', sources: [{ quest: 'The Raid', pack: 'Raid Pack', raid: true, wikiUrl: page('The_Raid') }], raid: true,
      wikiUrl: 'http://ddowiki.com/page/Item:Big_Sword', troveName: 'Big Sword', parentKey: null,
    }));
    expect(entries[1]).toEqual(expect.objectContaining({
      sources: [{ quest: 'The Snitch', pack: 'Sharn Pack', raid: false, wikiUrl: page('The_Snitch') }], raid: false,
      wikiUrl: null,
    }));
  });

  it('lists every quest an item comes from, each with its own pack', () => {
    const [entry] = deriveShoppingEntries(slots({
      Ring1: item({ name: 'Common Ring', quests: ['The Snitch', 'The Raid', 'Augment Vendor'], pack: 'Own Pack' }),
    }), sources);

    // The item's own pack can't say which of several quests it belongs to.
    expect(entry.sources.map(({ quest, pack, raid }) => ({ quest, pack, raid }))).toEqual([
      { quest: 'The Snitch', pack: 'Sharn Pack', raid: false },
      { quest: 'The Raid', pack: 'Raid Pack', raid: true },
      { quest: 'Augment Vendor', pack: null, raid: false },
    ]);
    expect(entry.raid).toBe(true);
  });

  it('links a quest quests.json knows to its wiki page, and searches the wiki for any other source', () => {
    const [entry] = deriveShoppingEntries(slots({
      Ring1: item({ name: 'Common Ring', quests: ['The Snitch', 'The Raid', "Augment Vendor's Stall"] }),
    }), sources);

    // Known by its pack, or as a raid; the rest may have no page by that name.
    expect(entry.sources.map(source => source.wikiUrl)).toEqual([
      page('The_Snitch'), page('The_Raid'), search("Augment%20Vendor's%20Stall"),
    ]);
  });

  it('falls back to the item\'s own pack when quests.json doesn\'t place its one quest', () => {
    const [placed] = deriveShoppingEntries(slots({ Ring1: item({ name: 'Placed', pack: 'Own Pack' }) }), sources);
    const [unplaced] = deriveShoppingEntries(slots({
      Ring1: item({ name: 'Unplaced', quests: ['Augment Vendor'], pack: 'Own Pack' }),
    }), sources);

    expect(placed.sources[0].pack).toBe('Sharn Pack');
    expect(unplaced.sources[0].pack).toBe('Own Pack');
  });

  it('gives the same item in two slots separate keys and one identity', () => {
    const ring = item({ name: 'Ring of Things' });
    const entries = deriveShoppingEntries(slots({ Ring1: ring, Ring2: new Item(ring) }), sources);

    expect(entries.map(entry => entry.key)).toEqual(['g|Ring1|Ring of Things', 'g|Ring2|Ring of Things']);
    expect(new Set(entries.map(entry => entry.identity)).size).toBe(1);
  });

  it('makes augments their own entries, keyed without the item and sourced on their own', () => {
    const sapphire = new CraftableOption({ name: 'Sapphire of Things', ml: 20, quests: ['Augment Vendor'] });
    const diamond = new CraftableOption({ name: 'Diamond of Balance' });
    const entries = deriveShoppingEntries(slots({
      Ring1: item({
        name: 'Ring of Things',
        crafting: [
          chosen('Colorless Augment Slot', [sapphire, diamond], 'Sapphire of Things'),
          chosen('Colorless Augment Slot', [sapphire, diamond], 'Diamond of Balance'),
          chosen('Colorless Augment Slot', [sapphire, diamond], ''),
        ],
      }),
    }), sources);

    expect(entries.map(entry => entry.key)).toEqual([
      'g|Ring1|Ring of Things',
      'a|Ring1|Colorless Augment Slot#0|Sapphire of Things',
      'a|Ring1|Colorless Augment Slot#1|Diamond of Balance',
    ]);
    expect(entries[1]).toEqual(expect.objectContaining({
      kind: 'augment', label: 'Sapphire of Things', ml: 20, sourceInherited: false,
      sources: [{ quest: 'Augment Vendor', pack: null, raid: false, wikiUrl: search('Augment%20Vendor') }],
      identity: 'augment|Sapphire of Things', troveName: 'Sapphire of Things', parentKey: 'g|Ring1|Ring of Things',
      wikiUrl: 'https://ddowiki.com/page/Item:Sapphire_of_Things',
    }));
    // No source in the data: unknown, not the item's quest.
    expect(entries[2]).toEqual(expect.objectContaining({ sources: [], sourceInherited: false }));
  });

  it('reads an augment chosen in a slot that picks its colour first', () => {
    const slot = new Craftable('Augment Slot 1', []);
    slot.setCraftingSystemOptions(new Map([['Blue Augment Slot', [new CraftableOption({ name: 'Sapphire' })]]]));
    slot.selectByParamDescription('Blue Augment Slot: Sapphire');

    const entries = deriveShoppingEntries(slots({ Ring1: item({ name: 'Blank Ring', crafting: [slot] }) }), sources);

    expect(entries[1].key).toBe('a|Ring1|Augment Slot 1#0|Blue Augment Slot: Sapphire');
    expect(entries[1].system).toBe('Blue Augment Slot');
  });

  it('links an augment to its page in the wiki\'s Item namespace', () => {
    const plus = new CraftableOption({ name: 'Sapphire of Healing Amplification +50' });
    const entries = deriveShoppingEntries(slots({
      Ring1: item({ name: 'Ring of Things', crafting: [chosen('Blue Augment Slot', [plus], plus.name)] }),
    }), sources);

    expect(entries[1].wikiUrl).toBe('https://ddowiki.com/page/Item:Sapphire_of_Healing_Amplification_%2B50');
  });

  it('keys upgrades and steps to their item, and lets unsourced steps inherit the item\'s source', () => {
    const shard = new CraftableOption({ name: 'Dolorous Shard', quests: ['The Raid'] });
    const purpose = new CraftableOption({ name: 'Lost Purpose: Things' });
    const tier = new CraftableOption({ affixes: [{ name: 'Fire', type: 'Enhancement', value: 1 }], quests: ['Altar'] });
    const entries = deriveShoppingEntries(slots({
      Ring1: item({
        name: 'Ring of Things',
        crafting: [
          chosen('Dolorous (Accessory)', [shard], 'Dolorous Shard'),
          chosen('Lost Purpose', [purpose], 'Lost Purpose: Things'),
          chosen('T1 (Equipment)', [tier], tier.getParamDescription()),
        ],
      }),
    }), sources);

    expect(entries.slice(1).map(entry => [entry.key, entry.kind, entry.sources[0].quest, entry.sourceInherited])).toEqual([
      ['u|Ring1|Ring of Things|Dolorous (Accessory)#0|Dolorous Shard', 'upgrade', 'The Raid', false],
      ['s|Ring1|Ring of Things|Lost Purpose#0|Lost Purpose: Things', 'step', 'The Snitch', true],
      ['s|Ring1|Ring of Things|T1 (Equipment)#0|Fire1', 'step', 'Altar', false],
    ]);
    expect(entries[1]).toEqual(expect.objectContaining({
      raid: true, troveName: 'Dolorous Shard',
      wikiUrl: 'https://ddowiki.com/page/Special:Search?go=Go&search=Dolorous%20Shard',
    }));
    expect(entries[2]).toEqual(expect.objectContaining({ troveName: null, wikiUrl: null }));
    expect(entries[2].sources).toBe(entries[0].sources);
  });

  it('shows random properties on the item rather than as things to get', () => {
    const roll = new CraftableOption({ affixes: [{ name: 'Strength', type: 'Enhancement', value: 5 }] });
    const entries = deriveShoppingEntries(slots({
      Ring1: item({ name: 'Ring of Things', crafting: [chosen('One of the following', [roll], 'Strength5')] }),
    }), sources);

    expect(entries.length).toBe(1);
    expect(entries[0].details).toEqual(['Strength +5 Enhancement']);
  });

  it('sources an essence-crafted blank to Cannith crafting, and can\'t find it in the trove', () => {
    const [entry] = deriveShoppingEntries(slots({
      Ring1: item({ name: 'Essence Crafting Ring', quests: [] }),
    }), sources);

    expect(entry.sources.map(source => source.quest)).toEqual([CANNITH_CRAFTING_SOURCE]);
    expect(entry.troveName).toBeNull();
  });

  it('leaves out a second augment slot the first one doesn\'t open', () => {
    const slotOne = new Craftable('Augment Slot 1', []);
    slotOne.setCraftingSystemOptions(new Map([['Colorless Augment Slot', [new CraftableOption({ name: 'Diamond' })]]]));
    slotOne.selectByParamDescription('Colorless Augment Slot: Diamond');
    const slotTwo = new Craftable('Augment Slot 2', []);
    slotTwo.setCraftingSystemOptions(new Map([['Colorless Augment Slot', [new CraftableOption({ name: 'Topaz' })]]]));
    slotTwo.selectByParamDescription('Colorless Augment Slot: Topaz');

    const entries = deriveShoppingEntries(slots({
      Ring1: item({ name: 'Blank Ring', crafting: [slotOne, slotTwo] }),
    }), sources);

    expect(entries.map(entry => entry.label)).toEqual(['Blank Ring', 'Diamond']);
  });
});
