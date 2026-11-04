import { TestBed } from '@angular/core/testing';

import { GearDbService } from '../gear/gear-db.service';
import { Item } from '../gear/item';
import { EquippedService } from './equipped.service';

// How EquippedService.updateFromParams turns a build's params into the
// items in its slots, pinned through the slots it ends up with.

function paramsOf(record: Record<string, string>) {
  return {
    keys: Object.keys(record),
    get: (key: string) => record[key] ?? null,
    getAll: (key: string) => key in record ? [record[key]] : [],
  };
}

describe('EquippedService building items from params', () => {
  let service: EquippedService;
  let gearDb: GearDbService;

  const slot = (name: string) => service.getSlotsSnapshot().get(name) ?? null;
  const selections = (item: Item | null) => (item?.crafting ?? [])
    .filter(craftable => craftable.selected)
    .map(craftable => `${craftable.name} = ${craftable.getSelectedParamDescription()}`);

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EquippedService);
    gearDb = TestBed.inject(GearDbService);
  });

  it('equips each item the params name, in the slot it names', () => {
    const ring = gearDb.getGearBySlot('Ring1')[0];

    service.updateFromParams(paramsOf({ Ring1: ring.name, Helm: 'Epic Deific Diadem' }));

    expect(slot('Ring1')?.name).toBe(ring.name);
    expect(slot('Helm')?.name).toBe('Epic Deific Diadem');
    expect(slot('Feet')).toBeNull();
  });

  it('empties every slot the params don\'t name, as loading another build does', () => {
    const ring = gearDb.getGearBySlot('Ring1')[0];
    service.updateFromParams(paramsOf({ Ring1: ring.name, Helm: 'Epic Deific Diadem' }));

    service.updateFromParams(paramsOf({ Helm: 'Epic Deific Diadem', Ring1: '' }));

    expect(slot('Ring1')).toBeNull();
    expect(slot('Helm')?.name).toBe('Epic Deific Diadem');
  });

  it('reads an essence-crafted item by its old name', () => {
    service.updateFromParams(paramsOf({ Weapon: 'Cannith Melee' }));

    expect(slot('Weapon')?.name).toBe('Essence Crafting Melee');
  });

  it('equips a copy, so choices made on it don\'t reach the item list', () => {
    service.updateFromParams(paramsOf({
      Weapon: 'Essence Crafting Melee', craft_0_slot: 'Weapon', craft_0_system: 'Augment Slot 1',
      craft_0_selected: 'Red Augment Slot (empty)',
    }));

    expect(selections(slot('Weapon'))).toContain('Augment Slot 1 = Red Augment Slot (empty)');
    expect(slot('Weapon')).not.toBe(gearDb.findGearBySlot('Weapon', 'Essence Crafting Melee'));
    expect(selections(gearDb.findGearBySlot('Weapon', 'Essence Crafting Melee')!)).not
      .toContain('Augment Slot 1 = Red Augment Slot (empty)');
  });

  it('sets an item\'s minimum level, an essence-crafted one\'s through its crafting', () => {
    const ring = gearDb.getGearBySlot('Ring1')[0];

    service.updateFromParams(paramsOf({ Ring1: ring.name, ml_Ring1: '7', Weapon: 'Essence Crafting Melee', ml_Weapon: '12' }));

    expect(slot('Ring1')?.ml).toBe(7);
    expect(slot('Weapon')?.ml).toBe(12);
    expect(slot('Weapon')?.crafting.map(craftable => craftable.name)).toEqual(expect.arrayContaining(['Prefix', 'Suffix']));
  });

  it('skips a crafting choice it can\'t place, applying the rest', () => {
    service.updateFromParams(paramsOf({
      Weapon: 'Essence Crafting Melee',
      craft_0_slot: 'Feet', craft_0_system: 'Augment Slot 1', craft_0_selected: 'Red Augment Slot (empty)',
      craft_1_slot: 'Weapon', craft_1_system: 'No Such System', craft_1_selected: 'Anything',
      craft_2_slot: 'Weapon', craft_2_system: 'Augment Slot 1', craft_2_selected: 'No Such Option',
      craft_3_slot: 'Weapon', craft_3_system: 'Augment Slot 1', craft_3_selected: 'Red Augment Slot (empty)',
    }));

    expect(slot('Feet')).toBeNull();
    expect(selections(slot('Weapon'))).toContain('Augment Slot 1 = Red Augment Slot (empty)');
  });

  it('empties the offhand behind a two-hander that isn\'t a crossbow', () => {
    const twoHander = gearDb.getGearBySlot('Weapon').find(item => item.isTwoHandedWeapon() && !item.isCrossbow())!;
    const shield = gearDb.getGearBySlot('Offhand').find(item => !item.isRuneArm())!;

    service.updateFromParams(paramsOf({ Weapon: twoHander.name, Offhand: shield.name }));

    expect(slot('Weapon')?.name).toBe(twoHander.name);
    expect(slot('Offhand')).toBeNull();
  });

  it('keeps only a rune arm behind a crossbow', () => {
    const crossbow = gearDb.getGearBySlot('Weapon').find(item => item.isTwoHandedWeapon() && item.isCrossbow())!;
    const shield = gearDb.getGearBySlot('Offhand').find(item => !item.isRuneArm())!;
    const runeArm = gearDb.getGearBySlot('Offhand').find(item => item.isRuneArm())!;

    service.updateFromParams(paramsOf({ Weapon: crossbow.name, Offhand: shield.name }));
    expect(slot('Offhand')).toBeNull();

    service.updateFromParams(paramsOf({ Weapon: crossbow.name, Offhand: runeArm.name }));
    expect(slot('Offhand')?.name).toBe(runeArm.name);
  });

  it('leaves a slot as it was when the params name an item the data doesn\'t have', () => {
    const ring = gearDb.getGearBySlot('Ring1')[0];
    service.updateFromParams(paramsOf({ Ring1: ring.name }));

    service.updateFromParams(paramsOf({ Ring1: 'No Such Ring', ml_Ring1: '3' }));

    expect(slot('Ring1')?.name).toBe(ring.name);
    expect(slot('Ring1')?.ml).toBe(3);
  });
});
