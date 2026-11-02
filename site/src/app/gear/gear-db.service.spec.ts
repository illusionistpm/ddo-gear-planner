import { TestBed } from '@angular/core/testing';

import { canonicalizeCraftingSystemName, canonicalizeGeneratedCraftedItemName, GearDbService, } from './gear-db.service';
import { Item, ItemInit } from './item';
import { ItemFilters } from './item-filters';
import { FiltersService } from '../planner/filters.service';
import { AffixService } from '../affixes/affix.service';
import { Affix } from '../affixes/affix';
import { NO_PACK_KEY } from './pack-filter';

describe('GearDbService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: GearDbService = TestBed.inject(GearDbService);
    expect(service).toBeTruthy();
  });

  it('maps legacy Cannith Crafting system names to Essence Crafting names', () => {
    expect(canonicalizeCraftingSystemName('Cannith: Ring - Prefix')).toBe('Essence Crafting: Ring - Prefix');
    expect(canonicalizeCraftingSystemName('Essence Crafting: Ring - Prefix')).toBe('Essence Crafting: Ring - Prefix');
  });

  it('maps legacy generated Cannith crafted item names to Essence Crafting names', () => {
    expect(canonicalizeGeneratedCraftedItemName('Cannith Melee')).toBe('Essence Crafting Melee');
    expect(canonicalizeGeneratedCraftedItemName('Cannith Boots of Propulsion')).toBe('Essence Crafting Boots of Propulsion');
  });

  it('finds generated Essence Crafting blanks from URL item names', () => {
    const service: GearDbService = TestBed.inject(GearDbService);

    expect(service.findGearBySlot('Weapon', 'Essence Crafting Melee')?.name).toBe('Essence Crafting Melee');
    expect(service.findGearBySlot('Weapon', 'Cannith Melee')?.name).toBe('Essence Crafting Melee');
  });

  it('adds non-named weapon augment slot choices to generated Essence Crafting blanks', () => {
    const service: GearDbService = TestBed.inject(GearDbService);
    const item = service.findGearBySlot('Weapon', 'Essence Crafting Melee');
    const slotOne = item?.getCraftingByName('Augment Slot 1');

    expect(slotOne).toBeTruthy();
    expect(slotOne?.craftingSystemOptions).toContain('Red Augment Slot');
    expect(slotOne?.craftingSystemOptions).toContain('Colorless Augment Slot');
    expect(slotOne?.craftingSystemOptions).not.toContain('Blue Augment Slot');
    expect(slotOne?.craftingSystemOptions).not.toContain('Yellow Augment Slot');
  });

  // Copying options per item made the full item list 2.5 million options (~550MB, ~2s to
  // build). They are immutable, so every item that offers a system shares its options.
  it('shares crafting options between items instead of copying them per item', () => {
    const service: GearDbService = TestBed.inject(GearDbService);
    const colorless = (slot: string, name: string) => service.findGearBySlot(slot, name)
      ?.getCraftingByName('Augment Slot 1')?.getOptionsByCraftingSystem().get('Colorless Augment Slot');
    const melee = colorless('Weapon', 'Essence Crafting Melee');
    const trinket = colorless('Trinket', 'Essence Crafting Trinket');

    expect(melee?.length).toBeGreaterThan(1);
    expect(trinket?.[1]).toBe(melee?.[1]);

    const ring1 = service.getGearBySlot('Ring1').find(item => item.crafting.some(c => c.options.length > 1))!;
    const ring2 = service.findGearBySlot('Ring2', ring1.name)!;
    const craftable = ring1.crafting.find(c => c.options.length > 1)!;
    expect(ring2.getCraftingByName(craftable.name)?.options[1]).toBe(craftable.options[1]);
  });

  it('adds non-named accessory augment slot choices to generated Essence Crafting blanks', () => {
    const service: GearDbService = TestBed.inject(GearDbService);
    const item = service.findGearBySlot('Trinket', 'Essence Crafting Trinket');
    const slotOne = item?.getCraftingByName('Augment Slot 1');
    const slotTwo = item?.getCraftingByName('Augment Slot 2');

    expect(slotOne).toBeTruthy();
    expect(slotOne?.craftingSystemOptions).toContain('Yellow Augment Slot');
    expect(slotOne?.craftingSystemOptions).toContain('Green Augment Slot');
    expect(slotOne?.craftingSystemOptions).toContain('Blue Augment Slot');
    expect(slotOne?.craftingSystemOptions).toContain('Colorless Augment Slot');
    expect(slotOne?.craftingSystemOptions).not.toContain('Red Augment Slot');
    expect(slotTwo?.craftingSystemOptions).toEqual([
      'Colorless Augment Slot',
      'Blue Augment Slot',
      'Yellow Augment Slot',
    ]);
  });

  it('loads regular augment options after selecting a generated Essence Crafting augment slot system', () => {
    const service: GearDbService = TestBed.inject(GearDbService);
    const item = service.findGearBySlot('Weapon', 'Essence Crafting Melee');
    const slotOne = item?.getCraftingByName('Augment Slot 1');

    slotOne?.selectCraftingSystem('Red Augment Slot');
    const redOption = slotOne?.options.find(option => option.affixes.length > 0);

    expect(redOption).toBeTruthy();
    expect(redOption?.describe()).not.toMatch(/^Red: /);
  });

  it('returns a fresh item copy when finding gear by slot', () => {
    const service: GearDbService = TestBed.inject(GearDbService);
    const item = new Item({
      name: 'Craftable Test Item',
      slot: 'Trinket',
      type: '',
      ml: 18,
      affixes: [],
      sets: [],
      url: '/page/Craftable_Test_Item',
      crafting: [
        {
          name: 'Test Crafting',
          options: [
            { name: 'First Option' },
          ],
        },
      ],
      quests: [],
      artifact: false,
    });

    service['gear'] = new Map<string, Array<Item>>([
      ['Trinket', [item]],
    ]);

    const firstLookup = service.findGearBySlot('Trinket', 'Craftable Test Item');
    firstLookup?.getCraftingByName('Test Crafting')?.selectByParamDescription('First Option');

    const secondLookup = service.findGearBySlot('Trinket', 'Craftable Test Item');

    expect(firstLookup).not.toBe(item);
    expect(secondLookup).not.toBe(item);
    expect(secondLookup).not.toBe(firstLookup);
    expect(secondLookup?.getCraftingByName('Test Crafting')?.selected.getParamDescription()).toBe('');
  });

  it('offers a Seal upgrade as an option carrying what the upgrade adds', () => {
    const service: GearDbService = TestBed.inject(GearDbService);
    const quiver = service.findGearBySlot('Quiver', 'Quiver of Alacrity');
    const upgrade = quiver?.getCraftingByName('Upgradeable Item');

    expect(quiver?.affixes.map(affix => affix.name)).not.toContain('Upgradeable Item');
    expect(upgrade?.selected.affixes).toEqual([]);
    expect(upgrade?.options.map(option => option.affixes.map(affix => [affix.name, affix.type, Number(affix.value)])))
      .toEqual([[], [['Speed', 'Enhancement', 30]]]);
  });

  it('gives an augment upgrade one slot that can become any colour the item lists for it', () => {
    const service: GearDbService = TestBed.inject(GearDbService);
    const diadem = service.findGearBySlot('Helm', 'Epic Deific Diadem');
    const shield = service.findGearBySlot('Offhand', 'Emerald Twilight');
    const systemsOf = (item: Item | undefined) => item?.crafting.map(craftable => [craftable.name, craftable.craftingSystemOptions]);

    expect(systemsOf(diadem)).toEqual([
      ['Upgradeable - Primary Augment', ['Yellow Augment Slot', 'Blue Augment Slot']],
      ['Upgradeable - Secondary Augment', ['Green Augment Slot']],
    ]);
    expect(systemsOf(shield)).toEqual([
      ['Upgradeable - Primary Augment', ['Yellow Augment Slot', 'Blue Augment Slot', 'Red Augment Slot']],
      ['Upgradeable - Secondary Augment', ['Green Augment Slot', 'Orange Augment Slot', 'Purple Augment Slot']],
    ]);
    expect(diadem?.affixes.map(affix => affix.name)).not.toContain('Upgradeable - Primary Augment');
  });

  it('offers a colour\'s augments once that colour is picked for an augment upgrade', () => {
    const service: GearDbService = TestBed.inject(GearDbService);
    const primary = service.findGearBySlot('Helm', 'Epic Deific Diadem')?.getCraftingByName('Upgradeable - Primary Augment');

    expect(primary?.options.length).toBe(1);
    primary?.selectCraftingSystem('Blue Augment Slot');

    expect(primary?.options.map(option => option.getParamDescription())).toContain('Golem\'s Heart');
  });

  describe('crafting options with minimum levels', () => {
    function makeLeveledCraftingItem() {
      return new Item({
        name: 'Leveled Crafting Item',
        slot: 'Trinket',
        type: '',
        ml: 18,
        affixes: [],
        sets: [],
        url: '/page/Leveled_Crafting_Item',
        crafting: [
          {
            name: 'Leveled Crafting',
            options: [
              { ml: 5, affixes: [{ name: 'Low Level Affix', type: 'Enhancement', value: 1 }] },
              { ml: 30, affixes: [{ name: 'High Level Affix', type: 'Enhancement', value: 1 }] },
            ],
          },
        ],
        quests: [],
        artifact: false,
      });
    }

    it('offers affixes up to the maximum level, however far below the minimum', () => {
      const service: GearDbService = TestBed.inject(GearDbService);
      service['allGear'] = new Map<string, Array<Item>>([
        ['Trinket', [makeLeveledCraftingItem()]],
      ]);
      const filters = new ItemFilters();
      filters.levelRange = [15, 20];

      service.applyItemFilters(filters);

      expect(service.getAllAffixes()).toContain('Low Level Affix');
      expect(service.getAllAffixes()).not.toContain('High Level Affix');
    });

    it('counts an item as a source only through options up to the maximum level', () => {
      const service: GearDbService = TestBed.inject(GearDbService);
      service['gear'] = new Map<string, Array<Item>>([
        ['Trinket', [makeLeveledCraftingItem()]],
      ]);
      service['currentItemFilters'].levelRange = [15, 20];
      service['itemAffixTypeIndex'] = null;

      expect(service.findGearWithAffixAndType('Low Level Affix', 'Enhancement').map(item => item.name))
        .toEqual(['Leveled Crafting Item']);
      expect(service.findGearWithAffixAndType('High Level Affix', 'Enhancement')).toEqual([]);
    });
  });

  it('matches sets only when their gear levels overlap the requested level range', () => {
    const service: GearDbService = TestBed.inject(GearDbService);
    const heroicItem = new Item({
      name: 'Heroic Set Item',
      slot: 'Trinket',
      type: '',
      ml: 8,
      affixes: [],
      sets: ['Example Set'],
      url: '/page/Heroic_Set_Item',
      crafting: [],
      quests: [],
      artifact: false,
    });
    const legendaryItem = new Item({
      name: 'Legendary Set Item',
      slot: 'Trinket',
      type: '',
      ml: 30,
      affixes: [],
      sets: ['Legendary Example Set'],
      url: '/page/Legendary_Set_Item',
      crafting: [],
      quests: [],
      artifact: false,
    });

    service['setLevels'] = service['_buildSetLevels'](new Map<string, Array<Item>>([
      ['Trinket', [heroicItem, legendaryItem]],
    ]));

    expect(service['_isSetInLevelRange']('Example Set', 8, 12)).toBe(true);
    expect(service['_isSetInLevelRange']('Legendary Example Set', 8, 12)).toBe(false);
    expect(service['_isSetInLevelRange']('Unknown Set', 8, 12)).toBe(false);
  });

  it('indexes set levels from crafting options', () => {
    const service: GearDbService = TestBed.inject(GearDbService);
    const item = new Item({
      name: 'Set Crafted Item',
      slot: 'Trinket',
      type: '',
      ml: 18,
      affixes: [],
      sets: [],
      url: '/page/Set_Crafted_Item',
      crafting: [
        {
          name: 'Set Crafting',
          options: [
            { set: 'Parent Level Set' },
            { set: 'Option Level Set', ml: 30 },
            { set: 'Low Option Level Set', ml: 5 },
          ],
        },
      ],
      quests: [],
      artifact: false,
    });

    service['setLevels'] = service['_buildSetLevels'](new Map<string, Array<Item>>([
      ['Trinket', [item]],
    ]));

    expect(service['_isSetInLevelRange']('Parent Level Set', 15, 18)).toBe(true);
    expect(service['_isSetInLevelRange']('Option Level Set', 15, 18)).toBe(false);
    // Below the minimum, the option still slots into the item, which is in range.
    expect(service['_isSetInLevelRange']('Low Option Level Set', 15, 18)).toBe(true);
  });

  it('finds gear that can craft a requested set and preselects that set', () => {
    const service: GearDbService = TestBed.inject(GearDbService);
    const item = new Item({
      name: 'Set Crafted Item',
      slot: 'Trinket',
      type: '',
      ml: 18,
      affixes: [],
      sets: [],
      url: '/page/Set_Crafted_Item',
      crafting: [
        {
          name: 'Set Crafting',
          options: [
            { set: 'Other Set' },
            { set: 'Matching Set' },
          ],
        },
      ],
      quests: [],
      artifact: false,
    });

    service['gear'] = new Map<string, Array<Item>>([
      ['Trinket', [item]],
    ]);
    service['currentItemFilters'].levelRange = [15, 18];

    const results = service.findGearInSet('Matching Set');

    expect(results.length).toBe(1);
    expect(results[0]).not.toBe(item);
    expect(results[0].getSets()).toEqual(['Matching Set']);
    expect(item.getSets()).toEqual([]);
  });

  it('filters rare items only when showRareItems is disabled', () => {
    const service: GearDbService = TestBed.inject(GearDbService);
    const normalItem = new Item({
      name: 'Normal Item',
      slot: 'Trinket',
      type: '',
      ml: 10,
      affixes: [],
      sets: [],
      url: '/page/Normal_Item',
      crafting: [],
      quests: [],
      artifact: false,
    });
    const rareItem = new Item({
      name: 'Rare Item',
      slot: 'Trinket',
      type: '',
      ml: 10,
      affixes: [],
      sets: [],
      url: '/page/Rare_Item',
      rare: true,
      crafting: [],
      quests: [],
      artifact: false,
    });
    const filters = new ItemFilters();
    filters.showRareItems = false;
    service['allGear'] = new Map<string, Array<Item>>([
      ['Trinket', [normalItem, rareItem]],
    ]);

    const filtered = service.applyItemFilters(filters);

    expect(filtered.get('Trinket')?.map(item => item.name)).toContain('Normal Item');
    expect(filtered.get('Trinket')?.map(item => item.name)).not.toContain('Rare Item');
  });

  it('lists every item name across slots, ignoring filters', () => {
    const service: GearDbService = TestBed.inject(GearDbService);
    const makeItem = (name: string, slot: string) => new Item({
      name, slot, type: '', ml: 10, affixes: [], sets: [], url: '/page/' + name,
      crafting: [], quests: [], artifact: false,
    });
    service['allGear'] = new Map<string, Array<Item>>([
      ['Trinket', [makeItem('Trinket A', 'Trinket'), makeItem('Trinket B', 'Trinket')]],
      ['Belt', [makeItem('Belt A', 'Belt')]],
    ]);

    expect(service.getAllItemNames().sort()).toEqual(['Belt A', 'Trinket A', 'Trinket B']);
  });

  it('filters items from hidden packs while default hidden pack set shows everything', () => {
    const service: GearDbService = TestBed.inject(GearDbService);
    const packItem = new Item({
      name: 'Pack Item',
      slot: 'Trinket',
      type: '',
      ml: 10,
      affixes: [],
      sets: [],
      url: '/page/Pack_Item',
      crafting: [],
      quests: ['Vecna Unleashed (quest)'],
      artifact: false,
    });
    const noPackItem = new Item({
      name: 'No Pack Item',
      slot: 'Trinket',
      type: '',
      ml: 10,
      affixes: [],
      sets: [],
      url: '/page/No_Pack_Item',
      crafting: [],
      quests: [],
      artifact: false,
    });
    service['allGear'] = new Map<string, Array<Item>>([
      ['Trinket', [packItem, noPackItem]],
    ]);

    expect(service.applyItemFilters(new ItemFilters()).get('Trinket')?.map(item => item.name))
      .toEqual(expect.arrayContaining(['Pack Item', 'No Pack Item']));

    const filters = new ItemFilters();
    filters.hiddenPacks = new Set(['Vecna Unleashed', NO_PACK_KEY]);

    expect(service.applyItemFilters(filters).get('Trinket')?.map(item => item.name)).toEqual([]);
  });

  it('keeps Sharn rare-drop artifacts when raid items are hidden', () => {
    const service: GearDbService = TestBed.inject(GearDbService);
    const raidItem = new Item({
      name: 'Regular Sharn Raid Item',
      slot: 'Trinket',
      type: '',
      ml: 29,
      affixes: [],
      sets: [],
      url: '/page/Regular_Sharn_Raid_Item',
      crafting: [],
      quests: ['Too Hot to Handle'],
      artifact: false,
    });
    const sharnArtifact = new Item({
      name: 'Sigil of Regalport',
      slot: 'Trinket',
      type: '',
      ml: 29,
      affixes: [],
      sets: [],
      url: '/page/Sigil_of_Regalport',
      rare: true,
      crafting: [],
      quests: ['Sharn quests'],
      artifact: false,
    });
    const filters = new ItemFilters();
    filters.showRaidItems = false;
    service['allGear'] = new Map<string, Array<Item>>([
      ['Trinket', [raidItem, sharnArtifact]],
    ]);

    const filteredNames = service.applyItemFilters(filters).get('Trinket')?.map(item => item.name);

    expect(filteredNames).toContain('Sigil of Regalport');
    expect(filteredNames).not.toContain('Regular Sharn Raid Item');
  });

  it('flags bonus types that only reach a per-element affix via a universal companion affix', () => {
    const service: GearDbService = TestBed.inject(GearDbService);

    // "Implement" spell power exists only as Universal Spell Power, so on Cold
    // Spell Power it is purely an artifact of ungrouping the companion affix.
    expect(service.isBonusTypeOnlyFromUniversalCompanion('Cold Spell Power', 'Implement')).toBe(true);

    // Bonus types real Cold Spell Power gear carries are not flagged.
    expect(service.isBonusTypeOnlyFromUniversalCompanion('Cold Spell Power', 'Equipment')).toBe(false);

    // "Exceptional" is on both Universal and per-element Negative Spell Power, so
    // it is not companion-only for Negative Spell Power.
    expect(service.isBonusTypeOnlyFromUniversalCompanion('Negative Spell Power', 'Exceptional')).toBe(false);

    // The universal companion affix itself is never treated as companion-only.
    expect(service.isBonusTypeOnlyFromUniversalCompanion('Universal Spell Power', 'Implement')).toBe(false);
  });

  it('ungroups a group defined only by fixed components into the affix map', () => {
    // Shipped data always defines member names too; this guards a
    // components-only group added later.
    const service: GearDbService = TestBed.inject(GearDbService);
    const affixSvc = TestBed.inject(AffixService);
    affixSvc.affixGroupComponents.set('Test Components', [{ name: 'Perform', type: 'Enhancement', value: 2 }]);
    const map = new Map<string, Map<string, number>>();

    (service as any)._addAffixesToMap(map, [new Affix({ name: 'Test Components', type: 'Bool', value: 1 })]);

    expect(Array.from(map.keys())).toEqual(['Test Components', 'Perform']);
  });

  // Pins pack filtering of single-source items from real game data, so the
  // move from an item's own pack to packs derived from its sources keeps it.
  describe('pack filtering of single-source items (real data)', () => {
    const trinketNames = (service: GearDbService, hiddenPacks: string[]) => {
      const filters = new ItemFilters();
      filters.hiddenPacks = new Set(hiddenPacks);
      return service.applyItemFilters(filters).get('Trinket')?.map(item => item.name) ?? [];
    };

    it("hides an item from a quest only when that quest's pack is hidden", () => {
      const service: GearDbService = TestBed.inject(GearDbService);

      expect(trinketNames(service, [])).toContain('Library Card');
      expect(trinketNames(service, ['Vecna Unleashed'])).not.toContain('Library Card');
      expect(trinketNames(service, ['The Isle of Dread'])).toContain('Library Card');
    });

    it('hides an item with no source only when free quests are hidden', () => {
      const service: GearDbService = TestBed.inject(GearDbService);

      expect(trinketNames(service, ['Vecna Unleashed'])).toContain('Epic Dusk Heart');
      expect(trinketNames(service, [NO_PACK_KEY])).not.toContain('Epic Dusk Heart');
    });
  });

  describe('pack filtering of multi-source items and augments', () => {
    const lunarGemSources = ['Book Burning', 'Toil and Trouble', 'A Light in the Attic', 'Thrall of Duty', 'Flocked Together', 'Stealing from Sorcere'];
    const lunarGemPacks = ['Magic of Myth Drannor', 'Tavern Tales', 'The Chill of Ravenloft', "The Dragons' Hand", 'Terror of Demogorgon'];

    const trinket = (name: string, quests: string[], crafting: ItemInit['crafting'] = []) => new Item({
      name, slot: 'Trinket', type: '', ml: 10, affixes: [], sets: [], url: '/page/' + name, crafting, quests, artifact: false,
    });

    // Leaves out the generated Essence Crafting blank, shown while free quests are.
    const filteredNames = (service: GearDbService, filters: ItemFilters) =>
      (service.applyItemFilters(filters).get('Trinket') ?? [])
        .filter(item => !item.isGeneratedEssenceCraftingBlank())
        .map(item => item.name);

    const hiding = (...packs: string[]) => {
      const filters = new ItemFilters();
      filters.hiddenPacks = new Set(packs);
      return filters;
    };

    it('keeps an item while any of its packs is shown', () => {
      const service: GearDbService = TestBed.inject(GearDbService);
      service['allGear'] = new Map([['Trinket', [trinket('Two Packs', ['Book Burning', 'Toil and Trouble'])]]]);

      expect(filteredNames(service, hiding('Tavern Tales'))).toEqual(['Two Packs']);
      expect(filteredNames(service, hiding('Tavern Tales', 'Magic of Myth Drannor'))).toEqual([]);
    });

    it('counts a free source as the free quests entry', () => {
      const service: GearDbService = TestBed.inject(GearDbService);
      service['allGear'] = new Map([['Trinket', [trinket('Pack Or Free', ['Book Burning', 'Not A Mapped Source'])]]]);

      expect(filteredNames(service, hiding('Magic of Myth Drannor'))).toEqual(['Pack Or Free']);
      expect(filteredNames(service, hiding('Magic of Myth Drannor', NO_PACK_KEY))).toEqual([]);
    });

    it('hides raid items only when every source is a raid', () => {
      const service: GearDbService = TestBed.inject(GearDbService);
      service['allGear'] = new Map([['Trinket', [
        trinket('Raid Only', ['Too Hot to Handle']),
        trinket('Raid Or Quest', ['Too Hot to Handle', 'Book Burning']),
      ]]]);
      const filters = new ItemFilters();
      filters.showRaidItems = false;

      expect(filteredNames(service, filters)).toEqual(['Raid Or Quest']);
    });

    it('offers the Lunar Gem until every one of its packs is hidden', () => {
      const service: GearDbService = TestBed.inject(GearDbService);
      const filters = TestBed.inject(FiltersService);
      const lunarGems = () => service.findAugmentsWithAffixAndType('Magical Sheltering', 'Profane')
        .flatMap(craftable => craftable.options.map(option => option.name))
        .filter(name => name.startsWith('Lunar Gem of Magical Protection'));

      expect(lunarGems()).toContain('Lunar Gem of Magical Protection (Heroic)');

      // The Epic one drops only in Toil and Trouble (Tavern Tales).
      filters.setHiddenPacks(new Set(['Terror of Demogorgon', 'Tavern Tales']));
      expect(lunarGems()).toContain('Lunar Gem of Magical Protection (Heroic)');
      expect(lunarGems()).not.toContain('Lunar Gem of Magical Protection (Epic)');

      filters.setHiddenPacks(new Set(lunarGemPacks));
      expect(lunarGems()).toEqual([]);
    });

    it('keeps the sources on the trimmed augment copies it returns', () => {
      const service: GearDbService = TestBed.inject(GearDbService);
      const heroic = service.findAugmentsWithAffixAndType('Magical Sheltering', 'Profane')
        .flatMap(craftable => craftable.options)
        .find(option => option.name === 'Lunar Gem of Magical Protection (Heroic)');

      expect(heroic?.quests).toEqual(lunarGemSources);
    });

    it('leaves a hidden-pack augment out of affix availability, but not one with no source', () => {
      const service: GearDbService = TestBed.inject(GearDbService);
      const gear = new Map([['Trinket', [trinket('Host', [], [{
        name: 'Test Augment Slot',
        options: [
          { name: 'Pack Augment', affixes: [{ name: 'Pack Only Affix', type: 'Profane', value: 5 }], quests: ['Book Burning'] },
          { name: 'Hostless Augment', affixes: [{ name: 'Sourceless Affix', type: 'Profane', value: 5 }] },
        ],
      }])]]]);
      const affixes = (hiddenPacks: string[]) =>
        service['_buildAffixToBonusTypes'](gear, 1, 30, new Set(hiddenPacks)) as Map<string, Map<string, number>>;

      expect(affixes([]).has('Pack Only Affix')).toBe(true);
      expect(affixes(['Magic of Myth Drannor']).has('Pack Only Affix')).toBe(false);
      expect(affixes(['Magic of Myth Drannor', NO_PACK_KEY]).has('Sourceless Affix')).toBe(true);
    });
  });

});
