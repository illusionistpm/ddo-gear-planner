import { TestBed } from '@angular/core/testing';

import { EquippedService } from './equipped.service';
import { AffixAvailabilityService } from './affix-availability.service';
import { Item } from './item';

function makeItem(name: string, slot: string, type: string, affixes: Array<any> = [], sets: Array<string> = []) {
  return new Item({
    name,
    slot,
    type,
    ml: 1,
    affixes,
    sets,
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

  it('does not expand universal spell power into its components when selected', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    const addedAffixes = service.addImportantAffix('Universal Spell Power');

    expect(addedAffixes).toEqual(['Universal Spell Power']);
    expect(service.isImportantAffix('Universal Spell Power')).toBeTrue();
    expect(service.isImportantAffix('Fire Spell Power')).toBeFalse();
  });

  it('does not expand spell lore into its components when selected', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    const addedAffixes = service.addImportantAffix('Spell Lore');

    expect(addedAffixes).toEqual(['Spell Lore']);
    expect(service.isImportantAffix('Spell Lore')).toBeTrue();
    expect(service.isImportantAffix('Force Lore')).toBeFalse();
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

  it('reports set-granted affix-group bonuses on the tracked member affixes', () => {
    const service: EquippedService = TestBed.inject(EquippedService);
    const setName = 'Legendary Delight of the Devourer';

    service.addImportantAffix('Kinetic Intensity');

    service.set(makeItem('Devourer Gloves', 'Gloves', 'Gloves', [], [setName]));
    service.set(makeItem('Devourer Belt', 'Belt', 'Belts', [], [setName]));
    service.set(makeItem('Devourer Boots', 'Boots', 'Boots', [], [setName]));

    expect(service.getCurrentValueForAffixType('Kinetic Intensity', 'Legendary')).toBe(15);

    let covered = new Map<string, Array<any>>();
    service.getCoveredAffixes().subscribe(map => (covered = map)).unsubscribe();
    const legendary = covered.get('Kinetic Intensity')?.find(type => type.bonusType === 'Legendary');
    expect(legendary?.value).toBe(15);
  });

  it('ranks a candidate on a scarce bonus type above an equal one on a common bonus type', () => {
    const service: EquippedService = TestBed.inject(EquippedService);
    const availability = TestBed.inject(AffixAvailabilityService);
    service.setImportantAffixes(['Strength']);

    spyOn(availability, 'getScarcityWeight').and.callFake((_affixName: string, bonusType: string) =>
      bonusType === 'Profane' ? 2.2 : 1
    );

    const commonItem = makeItem('Common Belt', 'Belt', 'Belt', [{ name: 'Strength', type: 'Enhancement', value: 6 }]);
    const scarceItem = makeItem('Scarce Belt', 'Belt', 'Belt', [{ name: 'Strength', type: 'Profane', value: 6 }]);

    expect(service.getScore(scarceItem)).toBeGreaterThan(service.getScore(commonItem));
  });

  it('stops applying scarcity once equipped gear covers the type to the moderate threshold', () => {
    const service: EquippedService = TestBed.inject(EquippedService);
    const availability = TestBed.inject(AffixAvailabilityService);
    service.setImportantAffixes(['Strength']);

    spyOn(service, 'getCurrentValueForAffixType').and.returnValue(10);
    spyOn((service as any).gearList, 'getBestValueForAffixType').and.returnValue(10);
    const scarcitySpy = spyOn(availability, 'getScarcityWeight').and.returnValue(2.2);

    const scarceItem = makeItem('Scarce Belt', 'Belt', 'Belt', [{ name: 'Strength', type: 'Profane', value: 6 }]);
    service.getScore(scarceItem);

    expect(scarcitySpy).not.toHaveBeenCalled();
  });

  it('nudges a set piece up when the set is the only source of an uncovered tracked need', () => {
    const service: EquippedService = TestBed.inject(EquippedService);
    const availability = TestBed.inject(AffixAvailabilityService);
    service.setImportantAffixes(['Strength']);

    spyOn(availability, 'getScarcityWeight').and.returnValue(1);
    spyOn(availability, 'getRemainingAvailability').and.callFake((affixName: string, bonusType: string) => ({
      affixName,
      bonusType,
      slots: [],
      slotCount: 0,
      augmentSlots: [],
      itemCount: 0,
      setSources: [{ setName: 'Test Set', threshold: 3, value: 5 }],
      augmentCount: 0,
      hasItemSource: false,
      hasAugmentSource: false,
      hasSetSource: true,
      remainingSlots: [],
      remainingSlotCount: 0,
      eliminated: false,
      tier: 'set-only' as const,
      scarcityWeight: 1,
      bestValue: 0,
    }));

    const setPiece = makeItem('Set Belt', 'Belt', 'Belt', [], ['Test Set']);
    const plainPiece = makeItem('Plain Belt', 'Belt', 'Belt', []);

    expect(service.getScore(setPiece)).toBeGreaterThan(service.getScore(plainPiece));
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

  it('persists non-default planner view state to params', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    service.setActiveMainTab('affixes');
    service.setTrackedAffixGroupMode('slots');
    service.toggleTrackedAffixGroupCollapsed('Defense');
    service.toggleTrackedAffixGroupCollapsed('set-only');

    const params = service['params'].getValue();
    expect(params['tab']).toBe('affixes');
    expect(params['taGroup']).toBe('slots');
    expect(params['taCollapsed']).toBe('Defense,set-only');
  });

  it('omits default planner view state from params', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    service['_updateRouterState']();

    const params = service['params'].getValue();
    expect(params['tab']).toBeUndefined();
    expect(params['taGroup']).toBeUndefined();
    expect(params['taCollapsed']).toBeUndefined();
  });

  it('restores planner view state from params', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    service.updateFromParams({
      keys: ['tracked', 'tab', 'taGroup', 'taCollapsed'],
      get: (key: string) =>
        ({ tab: 'affixes', taGroup: 'slots', taCollapsed: 'set-only,2' } as Record<string, string>)[key] ?? null,
      getAll: () => [],
    });

    let tab: string | undefined;
    service.getActiveMainTab().subscribe(value => (tab = value)).unsubscribe();
    let state: { groupMode: string; collapsed: string[] } | undefined;
    service.getTrackedAffixViewState().subscribe(value => (state = value)).unsubscribe();

    expect(tab).toBe('affixes');
    expect(state?.groupMode).toBe('slots');
    expect([...(state?.collapsed ?? [])].sort()).toEqual(['2', 'set-only']);
  });
});
