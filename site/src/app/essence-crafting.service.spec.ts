import { TestBed } from '@angular/core/testing';

import { EssenceCraftingService } from './essence-crafting.service';
import { Item } from './item';

describe('EssenceCraftingService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: EssenceCraftingService = TestBed.inject(EssenceCraftingService);
    expect(service).toBeTruthy();
  });

  it('uses the generated Essence Crafting max level for selectable levels', () => {
    const service: EssenceCraftingService = TestBed.inject(EssenceCraftingService);
    expect(service.maxLevel).toBe(34);
    expect(service.levels[0]).toBe(34);
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
});
