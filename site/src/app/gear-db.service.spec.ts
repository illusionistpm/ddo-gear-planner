import { TestBed } from '@angular/core/testing';

import {
  canonicalizeCraftingSystemName,
  canonicalizeGeneratedCraftedItemName,
  GearDbService,
} from './gear-db.service';
import { CraftableOption } from './craftable-option';
import { Item } from './item';
import { ItemFilters } from './item-filters';
import { FiltersService } from './filters.service';

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
          hiddenFromAffixSearch: false,
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

  it('matches craftable options with MLs inside the requested level range', () => {
    const service: GearDbService = TestBed.inject(GearDbService);

    expect(service['_isCraftableOptionInLevelRange'](new CraftableOption({ ml: 8 }), 8, 12)).toBeTrue();
    expect(service['_isCraftableOptionInLevelRange'](new CraftableOption({ ml: 7 }), 8, 12)).toBeFalse();
    expect(service['_isCraftableOptionInLevelRange'](new CraftableOption({ ml: 13 }), 8, 12)).toBeFalse();
    expect(service['_isCraftableOptionInLevelRange'](new CraftableOption({}), 8, 12)).toBeTrue();
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

    expect(service['_isSetInLevelRange']('Example Set', 8, 12)).toBeTrue();
    expect(service['_isSetInLevelRange']('Legendary Example Set', 8, 12)).toBeFalse();
    expect(service['_isSetInLevelRange']('Unknown Set', 8, 12)).toBeFalse();
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
          hiddenFromAffixSearch: false,
          options: [
            { set: 'Parent Level Set' },
            { set: 'Option Level Set', ml: 30 },
          ],
        },
      ],
      quests: [],
      artifact: false,
    });

    service['setLevels'] = service['_buildSetLevels'](new Map<string, Array<Item>>([
      ['Trinket', [item]],
    ]));

    expect(service['_isSetInLevelRange']('Parent Level Set', 15, 18)).toBeTrue();
    expect(service['_isSetInLevelRange']('Option Level Set', 15, 18)).toBeFalse();
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
          hiddenFromAffixSearch: false,
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
      pack: 'Test Pack',
      crafting: [],
      quests: [],
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
      .toEqual(jasmine.arrayContaining(['Pack Item', 'No Pack Item']));

    const filters = new ItemFilters();
    filters.hiddenPacks = new Set(['Test Pack', FiltersService.NO_PACK_FILTER]);

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
      pack: 'Masterminds of Sharn',
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
      pack: 'Masterminds of Sharn',
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

});
