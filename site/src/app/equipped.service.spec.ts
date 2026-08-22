import { TestBed } from '@angular/core/testing';

import { EquippedService } from './equipped.service';
import { Item } from './item';

function makeItem(name: string, slot: string, type: string, affixes: Array<any> = []) {
  return new Item({
    name,
    slot,
    type,
    ml: 1,
    affixes,
    sets: [],
    url: '/page/' + name.replace(/ /g, '_'),
    crafting: [],
    quests: [],
    artifact: false,
  });
}

describe('EquippedService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: EquippedService = TestBed.inject(EquippedService);
    expect(service).toBeTruthy();
  });

  it('tracks percent variants when the base affix is selected', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    expect(service.addImportantAffix('Armor Class')).toEqual(['Armor Class', 'Armor Class (%)']);
    service.addImportantAffix('False Life');

    expect(service.isImportantAffix('Armor Class')).toBeTrue();
    expect(service.isImportantAffix('Armor Class (%)')).toBeTrue();
    expect(service.isImportantAffix('False Life')).toBeTrue();
    expect(service.isImportantAffix('False Life (%)')).toBeTrue();

    expect(service.removeImportantAffix('Armor Class')).toEqual(['Armor Class', 'Armor Class (%)']);

    expect(service.isImportantAffix('Armor Class')).toBeFalse();
    expect(service.isImportantAffix('Armor Class (%)')).toBeFalse();
    expect(service.isImportantAffix('False Life (%)')).toBeTrue();
  });

  it('expands tracked affixes loaded from query params', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    service.setImportantAffixes(['Armor Class']);

    expect(Array.from(service.getImportantAffixes()).sort()).toEqual(['Armor Class', 'Armor Class (%)']);
  });

  it('canonicalizes synonymized tracked affixes loaded from query params', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    service.setImportantAffixes(['Devotion']);

    expect(service.isImportantAffix('Positive Spell Power')).toBeTrue();
    expect(service.isImportantAffix('Devotion')).toBeFalse();
  });

  it('does not track universal spell power when a specific spell power is selected', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    const addedAffixes = service.addImportantAffix('Light Spell Power');

    expect(addedAffixes).toEqual(['Light Spell Power']);
    expect(service.isImportantAffix('Light Spell Power')).toBeTrue();
    expect(service.isImportantAffix('Universal Spell Power')).toBeFalse();
  });

  it('allows universal spell power to be tracked directly', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    const addedAffixes = service.addImportantAffix('Universal Spell Power');

    expect(addedAffixes).toEqual(['Universal Spell Power']);
    expect(service.isImportantAffix('Universal Spell Power')).toBeTrue();
  });

  it('tracks spell lore components when universal spell lore is selected', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    const addedAffixes = service.addImportantAffix('Spell Lore');

    expect(addedAffixes).toContain('Spell Lore');
    expect(addedAffixes).toContain('Kinetic Lore');
    expect(service.isImportantAffix('Spell Lore')).toBeTrue();
    expect(service.isImportantAffix('Kinetic Lore')).toBeTrue();
  });

  it('empties and disables offhand when equipping a non-crossbow two-handed weapon', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    service.set(makeItem('Test Shield', 'Offhand', 'Large shields'));
    service.set(makeItem('Test Great Sword', 'Weapon', 'Great Swords'));

    expect(service.hasItem('Offhand')).toBeFalse();
    expect(service.isOffhandDisabled()).toBeTrue();
    expect(service.canEquip(makeItem('Test Rune Arm', 'Offhand', 'Rune Arms'))).toBeFalse();
    expect(service.isLocked('Offhand')).toBeTrue();
    expect(service.getUnlockedSlots().has('Offhand')).toBeFalse();
  });

  it('keeps rune arms equipped with crossbows and filters offhand choices to rune arms', () => {
    const service: EquippedService = TestBed.inject(EquippedService);
    const runeArm = makeItem('Test Rune Arm', 'Offhand', 'Rune Arms');
    const shield = makeItem('Test Shield', 'Offhand', 'Large shields');

    service.set(runeArm);
    service.set(makeItem('Test Heavy Crossbow', 'Weapon', 'Heavy Crossbows'));

    expect(service.getSlotsSnapshot().get('Offhand')?.name).toBe('Test Rune Arm');
    expect(service.isOffhandDisabled()).toBeFalse();
    expect(service.isOffhandRuneArmOnly()).toBeTrue();
    expect(service.canEquip(runeArm)).toBeTrue();
    expect(service.canEquip(shield)).toBeFalse();
    expect(service.getCompatibleGearForSlot('Offhand', [runeArm, shield])).toEqual([runeArm]);
    expect(service.getCompatibleGear([runeArm, shield])).toEqual([runeArm]);
    expect(service.getUnlockedSlots().has('Offhand')).toBeFalse();
  });

  it('evicts non-rune offhands when equipping a crossbow', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    service.set(makeItem('Test Shield', 'Offhand', 'Large shields'));
    service.set(makeItem('Test Great Crossbow', 'Weapon', 'Great Crossbows'));

    expect(service.hasItem('Offhand')).toBeFalse();
    expect(service.isOffhandDisabled()).toBeFalse();
    expect(service.isOffhandRuneArmOnly()).toBeTrue();
  });

  it('reports the equipped item currently supplying an affix type', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    service.set(makeItem('Weak Gloves', 'Gloves', 'Gloves', [
      { name: 'Strength', type: 'Enhancement', value: 5 },
    ]));
    service.set(makeItem('Strong Belt', 'Belt', 'Belts', [
      { name: 'Strength', type: 'Enhancement', value: 10 },
    ]));

    expect(service.getSourcesForAffixType('Strength', 'Enhancement')).toEqual([{
      kind: 'item',
      slot: 'Belt',
      itemName: 'Strong Belt',
      affixName: 'Strength',
      bonusType: 'Enhancement',
      value: 10,
    }]);
  });

  it('emits an event when an item is equipped', () => {
    const service: EquippedService = TestBed.inject(EquippedService);
    const events: Array<{ slot: string; itemName: string }> = [];
    const subscription = service.getEquippedItemEvents().subscribe(event => events.push(event));

    service.set(makeItem('Flashy Gloves', 'Gloves', 'Gloves'));
    subscription.unsubscribe();

    expect(events).toEqual([{ slot: 'Gloves', itemName: 'Flashy Gloves' }]);
  });

  it('persists named crafting choices that do not add affixes', () => {
    const service: EquippedService = TestBed.inject(EquippedService);
    const item = service['gearList'].findGearBySlot('Weapon', 'Essence Crafting Melee');
    const augmentSlot = item?.getCraftingByName('Augment Slot 1');

    augmentSlot?.selectByParamDescription('Red Augment Slot (empty)');
    service.set(item as Item);

    const params = service['params'].getValue();
    expect(params['craft_0_system']).toBe('Augment Slot 1');
    expect(params['craft_0_selected']).toBe('Red Augment Slot (empty)');
  });
});
