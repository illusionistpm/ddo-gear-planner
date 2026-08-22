import { TestBed } from '@angular/core/testing';

import { EssenceCraftingService } from './essence-crafting.service';
import { Item } from './item';
import { Craftable } from './craftable';
import { CraftableOption } from './craftable-option';

describe('EssenceCraftingService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: EssenceCraftingService = TestBed.inject(EssenceCraftingService);
    expect(service).toBeTruthy();
  });

  it('uses the generated Essence Crafting max level for selectable levels', () => {
    const service: EssenceCraftingService = TestBed.inject(EssenceCraftingService);
    expect(service.maxLevel).toBe(36);
    expect(service.levels[0]).toBe(service.maxLevel);
  });

  it('rebuilds generated weapon blanks from their Essence Crafting type when ML changes', () => {
    const service: EssenceCraftingService = TestBed.inject(EssenceCraftingService);
    const item = new Item(null);
    item.name = 'Essence Crafting Melee';
    item.slot = 'Weapon';
    item.ml = 34;
    item.crafting = service.getValuesForML('Melee', item.ml);

    service.setItemToML(item, 30);

    expect(item.crafting.length).toBe(3);
    expect(item.crafting.every(craftable => craftable.options.length > 1)).toBeTrue();
  });

  it('rebuilds crafted items from their raw Essence Crafting system when ML changes', () => {
    const service: EssenceCraftingService = TestBed.inject(EssenceCraftingService);
    const item = new Item({
      name: 'Crafted Rune Arm',
      slot: 'Offhand',
      type: 'Rune Arms',
      ml: 34,
      affixes: [],
      sets: [],
      url: '/page/Crafted_Rune_Arm',
      crafting: [
        'Essence Crafting: Rune Arm - Extra',
        'Essence Crafting: Rune Arm - Prefix',
        'Essence Crafting: Rune Arm - Suffix',
      ],
      quests: [],
      artifact: false,
    });
    item.crafting = service.getValuesForML('Rune Arm', item.ml);

    service.setItemToML(item, 30);

    expect(item.crafting.length).toBe(3);
    expect(item.crafting.every(craftable => craftable.options.length > 1)).toBeTrue();
  });

  it('rebuilds cloned crafted items from their raw Essence Crafting system when ML changes', () => {
    const service: EssenceCraftingService = TestBed.inject(EssenceCraftingService);
    const item = new Item({
      name: 'Crafted Rune Arm',
      slot: 'Offhand',
      type: 'Rune Arms',
      ml: 34,
      affixes: [],
      sets: [],
      url: '/page/Crafted_Rune_Arm',
      crafting: [
        'Essence Crafting: Rune Arm - Extra',
        'Essence Crafting: Rune Arm - Prefix',
        'Essence Crafting: Rune Arm - Suffix',
      ],
      quests: [],
      artifact: false,
    });
    item.crafting = service.getValuesForML('Rune Arm', item.ml);

    const clone = new Item(item);

    service.setItemToML(clone, 30);

    expect(clone.rawCrafting).toEqual([
      'Essence Crafting: Rune Arm - Extra',
      'Essence Crafting: Rune Arm - Prefix',
      'Essence Crafting: Rune Arm - Suffix',
    ]);
    expect(clone.crafting.length).toBe(3);
    expect(clone.crafting.every(craftable => craftable.options.length > 1)).toBeTrue();
  });

  it('preserves non-essence crafting rows when ML changes', () => {
    const service: EssenceCraftingService = TestBed.inject(EssenceCraftingService);
    const item = new Item(null);
    const augmentSlot = new Craftable('Augment Slot 1', [], false);
    augmentSlot.setCraftingSystemOptions(new Map([
      ['Blue Augment Slot', [new CraftableOption({ name: 'Sapphire of Test' })]],
    ]), 'Blue Augment Slot');
    item.name = 'Essence Crafting Armor';
    item.slot = 'Armor';
    item.ml = 36;
    item.crafting = service.getValuesForML('Armor', item.ml).concat([augmentSlot]);

    service.setItemToML(item, 30);

    expect(item.crafting.map(craftable => craftable.name)).toEqual([
      'Prefix',
      'Suffix',
      'Extra',
      'Augment Slot 1',
    ]);
    expect(item.getCraftingByName('Augment Slot 1')?.selectedCraftingSystemName).toBe('Blue Augment Slot');
  });
});
