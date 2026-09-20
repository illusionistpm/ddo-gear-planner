import { TestBed } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { AffixAvailabilityService } from './affix-availability.service';
import { GearDbService, SetAffixMatch } from '../gear/gear-db.service';
import { FiltersService } from '../planner/filters.service';

describe('AffixAvailabilityService', () => {
  let service: AffixAvailabilityService;
  let gearDB: GearDbService;
  let filters: FiltersService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AppModule] });
    gearDB = TestBed.inject(GearDbService);
    filters = TestBed.inject(FiltersService);
    service = TestBed.inject(AffixAvailabilityService);
  });

  function itemsAcrossSlots(count: number): Array<{
    slot: string;
  }> {
    return Array.from({ length: count }, (_unused, index) => ({ slot: 'Slot' + index }));
  }

  function stubSources(items: Array<{
    slot: string;
  }>, sets: SetAffixMatch[] = [], augmentOptionCount = 0, augmentSlots: string[] = [], setSlots: string[] = []) {
    vi.spyOn(gearDB, 'findGearWithAffixAndType').mockReturnValue(items as any);
    vi.spyOn(gearDB, 'findSetsWithAffixAndType').mockReturnValue(sets);
    vi.spyOn(gearDB, 'findAugmentsWithAffixAndType').mockReturnValue(augmentOptionCount
      ? [{ name: 'Blue Augment Slot', options: new Array(augmentOptionCount).fill({}) } as any]
      : []);
    vi.spyOn(gearDB, 'findSlotsForAugmentAffixAndType').mockReturnValue(augmentSlots);
    vi.spyOn(gearDB, 'findSlotsForSet').mockReturnValue(setSlots);
    vi.spyOn(gearDB, 'getBestValueForAffixType').mockReturnValue(10);
  }

  it('rates a bonus type carried by many slots as common with no scarcity weight', () => {
    stubSources(itemsAcrossSlots(6));

    const info = service.getAvailability('Strength', 'Enhancement');

    expect(info.tier).toBe('common');
    expect(info.slotCount).toBe(6);
    expect(info.scarcityWeight).toBe(1);
  });

  it('rates a bonus type on one or two slots as scarce and weights it up', () => {
    stubSources(itemsAcrossSlots(2));

    const info = service.getAvailability('Strength', 'Profane');

    expect(info.tier).toBe('scarce');
    expect(info.scarcityWeight).toBeGreaterThan(1);
  });

  it('weights a single-slot bonus type more heavily than a two-slot one', () => {
    const twoSlot = new AffixAvailabilityService(gearDB, filters);
    vi.spyOn(gearDB, 'findGearWithAffixAndType').mockReturnValueOnce(itemsAcrossSlots(1) as any).mockReturnValueOnce(itemsAcrossSlots(2) as any);
    vi.spyOn(gearDB, 'findSetsWithAffixAndType').mockReturnValue([] as any);
    vi.spyOn(gearDB, 'findAugmentsWithAffixAndType').mockReturnValue([] as any);
    vi.spyOn(gearDB, 'getBestValueForAffixType').mockReturnValue(10);

    const oneSlotWeight = twoSlot.getAvailability('Strength', 'A').scarcityWeight;
    const twoSlotWeight = twoSlot.getAvailability('Strength', 'B').scarcityWeight;

    expect(oneSlotWeight).toBeGreaterThan(twoSlotWeight);
    expect(twoSlotWeight).toBeGreaterThan(1);
  });

  it('flags a bonus type available only through a set as set-only', () => {
    stubSources([], [['Elder\'s Knowledge', 2, 5]]);

    const info = service.getAvailability('Fire Intensity', 'Legendary');

    expect(info.tier).toBe('set-only');
    expect(info.hasItemSource).toBe(false);
    expect(info.setSources).toEqual([{ setName: 'Elder\'s Knowledge', threshold: 2, value: 5 }]);
    expect(info.scarcityWeight).toBe(1);
  });

  it('flags a bonus type available only through a hostable augment as augment-only', () => {
    stubSources([], [], 2, ['Trinket', 'Goggles']);

    const info = service.getAvailability('Constitution', 'Quality');

    expect(info.tier).toBe('augment-only');
    expect(info.scarcityWeight).toBeGreaterThan(1);
  });

  it('does not treat an augment with nowhere to slot it as a source', () => {
    stubSources([], [], 2, []);

    expect(service.getAvailability('Constitution', 'Quality').tier).toBe('unavailable');
  });

  it('ignores empty augment craftables (one per colour) as phantom sources', () => {
    vi.spyOn(gearDB, 'findGearWithAffixAndType').mockReturnValue([] as any);
    vi.spyOn(gearDB, 'findSetsWithAffixAndType').mockReturnValue([] as any);
    vi.spyOn(gearDB, 'findAugmentsWithAffixAndType').mockReturnValue([
      { name: 'Blue Augment Slot', options: [] },
      { name: 'Sun Augment Slot', options: [] },
    ] as any);
    const slotSpy = vi.spyOn(gearDB, 'findSlotsForAugmentAffixAndType').mockReturnValue([]);
    vi.spyOn(gearDB, 'getBestValueForAffixType').mockReturnValue(0);

    const info = service.getAvailability('Dodge', 'Quality');

    expect(info.augmentCount).toBe(0);
    expect(info.tier).toBe('unavailable');
    expect(slotSpy).not.toHaveBeenCalled();
  });

  it('treats a no-item bonus type as set-only even when an augment also grants it', () => {
    stubSources([], [['Arcsteel Battlemage', 3, 5]], 1, ['Trinket']);

    expect(service.getAvailability('Kinetic Lore', 'Artifact').tier).toBe('set-only');
  });

  it('reports an entirely absent bonus type as unavailable', () => {
    stubSources([]);

    expect(service.getAvailability('Strength', 'Nonsense').tier).toBe('unavailable');
  });

  it('memoises results and clears the cache when the item filters change', () => {
    const spy = vi.spyOn(gearDB, 'findGearWithAffixAndType').mockReturnValue(itemsAcrossSlots(2) as any);
    vi.spyOn(gearDB, 'findSetsWithAffixAndType').mockReturnValue([] as any);
    vi.spyOn(gearDB, 'findAugmentsWithAffixAndType').mockReturnValue([] as any);
    vi.spyOn(gearDB, 'getBestValueForAffixType').mockReturnValue(10);

    const first = service.getAvailability('Strength', 'Enhancement');
    const second = service.getAvailability('Strength', 'Enhancement');
    expect(second).toBe(first);
    expect(spy).toHaveBeenCalledTimes(1);

    filters.setLevelRange(5, 20);
    service.getAvailability('Strength', 'Enhancement');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('returns a neutral weight for an unknown affix or bonus type', () => {
    expect(service.getScarcityWeight('', 'Enhancement')).toBe(1);
    expect(service.getScarcityWeight('Strength', '')).toBe(1);
  });

  it('narrows availability to open slots and tightens the tier as slots fill', () => {
    stubSources(itemsAcrossSlots(3)); // Slot0, Slot1, Slot2

    const wideOpen = new Set(['Slot0', 'Slot1', 'Slot2', 'Belt']);
    const nearlyFull = new Set(['Slot2', 'Belt']);

    expect(service.getRemainingAvailability('Strength', 'Insight', wideOpen).tier).toBe('limited');

    const narrowed = service.getRemainingAvailability('Strength', 'Insight', nearlyFull);
    expect(narrowed.tier).toBe('scarce');
    expect(narrowed.remainingSlotCount).toBe(1);
    expect(narrowed.scarcityWeight).toBeGreaterThan(service.getRemainingAvailability('Strength', 'Insight', wideOpen).scarcityWeight);
  });

  it('marks an item-only bonus type eliminated once no open slot can carry it', () => {
    stubSources(itemsAcrossSlots(2));

    const info = service.getRemainingAvailability('Strength', 'Insight', new Set(['Belt']));

    expect(info.eliminated).toBe(true);
    expect(info.tier).toBe('unavailable');
  });

  it('does not eliminate a bonus type that a set still backs after its slots fill', () => {
    stubSources(itemsAcrossSlots(1), [['Some Set', 3, 5]]);

    const info = service.getRemainingAvailability('Kinetic Lore', 'Artifact', new Set(['Belt']));

    expect(info.eliminated).toBe(false);
    expect(info.tier).toBe('set-only');
  });

  it('eliminates an augment-only type once no open slot can host the augment', () => {
    stubSources([], [], 2, ['Trinket', 'Goggles']);

    const info = service.getRemainingAvailability('Constitution', 'Quality', new Set(['Cloak', 'Quiver']));

    expect(info.tier).toBe('unavailable');
    expect(info.eliminated).toBe(true);
  });

  it('counts augment-hostable open slots toward the remaining supply, not just item slots', () => {
    stubSources([], [], 2, ['Cloak', 'Boots', 'Gloves', 'Bracers', 'Necklace']);

    const oneOpen = service.getRemainingAvailability('Constitution', 'Quality', new Set(['Cloak']));
    expect(oneOpen.tier).toBe('scarce');
    expect(oneOpen.remainingSlotCount).toBe(1);
    expect(oneOpen.eliminated).toBe(false);

    const manyOpen = service.getRemainingAvailability('Constitution', 'Quality', new Set(['Cloak', 'Boots', 'Gloves', 'Bracers', 'Necklace']));
    expect(manyOpen.tier).toBe('common');
    expect(manyOpen.remainingSlotCount).toBe(5);
  });

  it('counts a filled slot whose equipped item still has a free compatible augment slot', () => {
    stubSources([], [], 2, ['Cloak']); // one augment-hostable empty slot

    // Goggles is filled (not in openSlots) but its equipped item has a free
    // compatible augment slot -> Cloak + Goggles = 2 places.
    const info = service.getRemainingAvailability('Fortitude Save', 'Artifact', new Set(['Cloak', 'Quiver']), undefined, new Set(['Goggles']));

    expect(info.remainingSlotCount).toBe(2);
    expect(info.tier).toBe('scarce');
    expect(info.eliminated).toBe(false);
  });

  it('merges native item slots and augment-hostable slots without double counting', () => {
    stubSources([{ slot: 'Cloak' }, { slot: 'Boots' }], [], 2, ['Boots', 'Gloves']);

    const info = service.getRemainingAvailability('Constitution', 'Quality', new Set(['Cloak', 'Boots', 'Gloves']));

    expect(info.remainingSlotCount).toBe(3); // Cloak, Boots, Gloves
    expect(info.tier).toBe('limited');
  });

  it('drops a set-only type when the set can no longer reach its piece threshold', () => {
    stubSources([], [['Big Set', 3, 5]], 0, [], ['Belt', 'Cloak', 'Trinket']);

    const info = service.getRemainingAvailability('X', 'Y', new Set(['Cloak']), new Map());

    expect(info.tier).toBe('unavailable');
    expect(info.eliminated).toBe(true);
  });

  it('keeps a set-only type when equipped pieces plus open slots still reach the threshold', () => {
    stubSources([], [['Big Set', 3, 5]], 0, [], ['Belt', 'Cloak', 'Trinket', 'Ring1']);

    const info = service.getRemainingAvailability('X', 'Y', new Set(['Cloak', 'Ring1']), new Map([['Big Set', 1]]));

    expect(info.tier).toBe('set-only');
    expect(info.eliminated).toBe(false);
  });

  it('leaves set reachability unchecked when no equipped-set context is given', () => {
    stubSources([], [['Big Set', 3, 5]], 0, [], ['Belt']);

    expect(service.getRemainingAvailability('X', 'Y', new Set(['Cloak'])).tier).toBe('set-only');
  });
});
