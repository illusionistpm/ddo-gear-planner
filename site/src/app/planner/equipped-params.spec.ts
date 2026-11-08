import { TestBed } from '@angular/core/testing';

import { EssenceCraftingService } from '../gear/essence-crafting.service';
import { GearDbService } from '../gear/gear-db.service';
import { Item } from '../gear/item';
import { EquippedService } from './equipped.service';
import { ItemBonusService } from '../gear/item-bonus.service';
import { QueryParamRecord } from '../build/query-param-types';
import { slotsFromParams } from './slots-from-params';

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
    expect(slot('Boots')).toBeNull();
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
      craft_0_slot: 'Boots', craft_0_system: 'Augment Slot 1', craft_0_selected: 'Red Augment Slot (empty)',
      craft_1_slot: 'Weapon', craft_1_system: 'No Such System', craft_1_selected: 'Anything',
      craft_2_slot: 'Weapon', craft_2_system: 'Augment Slot 1', craft_2_selected: 'No Such Option',
      craft_3_slot: 'Weapon', craft_3_system: 'Augment Slot 1', craft_3_selected: 'Red Augment Slot (empty)',
    }));

    expect(slot('Boots')).toBeNull();
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

  it('empties a slot when the params name an item the data doesn\'t have, not keeping the last build\'s', () => {
    const ring = gearDb.getGearBySlot('Ring1')[0];
    service.updateFromParams(paramsOf({ Ring1: ring.name }));

    service.updateFromParams(paramsOf({ Ring1: 'No Such Ring', ml_Ring1: '3' }));

    expect(slot('Ring1')).toBeNull();
  });

  describe('Mythic Boosts, Reaper bonuses and Curses', () => {
    const helm = 'Epic Deific Diadem';
    const bonusNames = (item: Item | null) => Object.fromEntries(
      Object.entries(item?.bonuses ?? {}).map(([kind, option]) => [kind, option?.name]));

    it('puts each on the item in the slot its key names', () => {
      service.updateFromParams(paramsOf({
        Helm: helm,
        mythic_Helm: 'Mythic +3 (PRR/MRR)',
        reaper_Helm: 'Reaper Helmet Enchantment',
        curse_Helm: 'Curse of Major Strength',
      }));

      expect(bonusNames(slot('Helm'))).toEqual({
        mythic: 'Mythic +3 (PRR/MRR)',
        reaper: 'Reaper Helmet Enchantment',
        curse: 'Curse of Major Strength',
      });
      expect(slot('Helm')?.getActiveAffixes().filter(affix => affix.type === 'Fortune').map(affix => [affix.name, affix.value]))
        .toEqual([['Strength', 2]]);
    });

    it('ignores one the slot can\'t carry, or one for an empty slot', () => {
      const quiver = gearDb.getGearBySlot('Quiver')[0];

      service.updateFromParams(paramsOf({
        Helm: helm,
        mythic_Helm: 'Mythic +4 (Melee/Ranged/Spell Power)',
        Quiver: quiver.name,
        curse_Quiver: 'Curse of Major Strength',
        curse_Boots: 'Curse of Major Strength',
      }));

      expect(bonusNames(slot('Helm'))).toEqual({});
      expect(bonusNames(slot('Quiver'))).toEqual({});
    });

    it('writes them back to the params it read them from', () => {
      let written: QueryParamRecord | null = null;
      (service as any).params.subscribe((params: QueryParamRecord | null) => (written = params));
      const ring = gearDb.getGearBySlot('Ring2')[0];
      const item = new Item(ring);
      item.bonuses.curse = TestBed.inject(ItemBonusService).find('curse', 'Ring2', 'Curse of the Unbreakable');
      item.bonuses.reaper = TestBed.inject(ItemBonusService).find('reaper', 'Ring2', 'Reaper Ring Boost (+10 Universal Spell Power)');

      service.set(item);

      expect(written!['curse_Ring2']).toBe('Curse of the Unbreakable');
      expect(written!['reaper_Ring2']).toBe('Reaper Ring Boost (+10 Universal Spell Power)');
      expect(written!['mythic_Ring2']).toBeUndefined();

      const record = Object.fromEntries(Object.entries(written!).filter(([, value]) => typeof value === 'string')) as Record<string, string>;
      service.updateFromParams(paramsOf(record));
      expect(bonusNames(slot('Ring2'))).toEqual({ curse: 'Curse of the Unbreakable', reaper: 'Reaper Ring Boost (+10 Universal Spell Power)' });
    });
  });

  it('is slotsFromParams, which works the items out without equipping them', () => {
    const params = paramsOf({ Weapon: 'Cannith Melee', ml_Weapon: '12', Helm: 'Epic Deific Diadem' });

    const slots = slotsFromParams(params, gearDb, TestBed.inject(EssenceCraftingService));

    expect(slots.get('Weapon')?.name).toBe('Essence Crafting Melee');
    expect(slots.get('Weapon')?.ml).toBe(12);
    expect(slots.get('Helm')?.name).toBe('Epic Deific Diadem');
    expect(slots.get('Boots')).toBeNull();
    expect(Array.from(service.getSlotsSnapshot().values()).every(item => item === null)).toBe(true);

    service.updateFromParams(params);
    expect(Array.from(service.getSlotsSnapshot(), ([name, item]) => [name, item?.name ?? null, item?.ml ?? null]))
      .toEqual(Array.from(slots, ([name, item]) => [name, item?.name ?? null, item?.ml ?? null]));
  });
});
