import { TestBed } from '@angular/core/testing';

import {
  canonicalizeCraftingSystemName,
  canonicalizeGeneratedCraftedItemName,
  GearDbService,
} from './gear-db.service';

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
    expect(canonicalizeGeneratedCraftedItemName('Cannith Boots of Propulsion')).toBe('Cannith Boots of Propulsion');
  });

  it('finds generated Essence Crafting blanks from URL item names', () => {
    const service: GearDbService = TestBed.inject(GearDbService);

    expect(service.findGearBySlot('Weapon', 'Essence Crafting Melee')?.name).toBe('Essence Crafting Melee');
    expect(service.findGearBySlot('Weapon', 'Cannith Melee')?.name).toBe('Essence Crafting Melee');
  });

});
