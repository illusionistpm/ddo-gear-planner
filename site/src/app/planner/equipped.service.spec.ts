import { TestBed } from '@angular/core/testing';

import { EquippedService } from './equipped.service';
import { AffixAvailabilityService } from '../affixes/affix-availability.service';
import { Item } from '../gear/item';
import { QueryParamsService } from '../build/query-params.service';
import { FiltersService } from './filters.service';

function makeParamsAdapter(record: Record<string, unknown>) {
  return {
    keys: Object.keys(record),
    get: (key: string) => {
      const value = record[key];
      return Array.isArray(value) ? (value[0] ?? null) : ((value as string | null | undefined) ?? null);
    },
    getAll: (key: string) => {
      const value = record[key];
      return Array.isArray(value) ? value : (value === undefined ? [] : [value as string]);
    }
  };
}

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
  const viewStateKeys = [
    'ddo-gear-planner-active-tab',
    'ddo-gear-planner-tracked-affix-group-mode',
    'ddo-gear-planner-tracked-affix-collapsed'
  ];

  beforeEach(() => {
    for (const key of viewStateKeys) {
      localStorage.removeItem(key);
    }
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    for (const key of viewStateKeys) {
      localStorage.removeItem(key);
    }
  });

  it('should be created', () => {
    const service: EquippedService = TestBed.inject(EquippedService);
    expect(service).toBeTruthy();
  });

  it('tracks percent variants when the base affix is selected', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    expect(service.addImportantAffix('Armor Class')).toEqual(['Armor Class', 'Armor Class (%)']);
    service.addImportantAffix('False Life');

    expect(service.isImportantAffix('Armor Class')).toBe(true);
    expect(service.isImportantAffix('Armor Class (%)')).toBe(true);
    expect(service.isImportantAffix('False Life')).toBe(true);
    expect(service.isImportantAffix('False Life (%)')).toBe(true);

    expect(service.removeImportantAffix('Armor Class')).toEqual(['Armor Class', 'Armor Class (%)']);

    expect(service.isImportantAffix('Armor Class')).toBe(false);
    expect(service.isImportantAffix('Armor Class (%)')).toBe(false);
    expect(service.isImportantAffix('False Life (%)')).toBe(true);
  });

  it('expands tracked affixes loaded from query params', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    service.setImportantAffixes(['Armor Class']);

    expect(Array.from(service.getImportantAffixes()).sort()).toEqual(['Armor Class', 'Armor Class (%)']);
  });

  it('canonicalizes synonymized tracked affixes loaded from query params', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    service.setImportantAffixes(['Devotion']);

    expect(service.isImportantAffix('Positive Spell Power')).toBe(true);
    expect(service.isImportantAffix('Devotion')).toBe(false);
  });

  it('does not track universal spell power when a specific spell power is selected', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    const addedAffixes = service.addImportantAffix('Light Spell Power');

    expect(addedAffixes).toEqual(['Light Spell Power']);
    expect(service.isImportantAffix('Light Spell Power')).toBe(true);
    expect(service.isImportantAffix('Universal Spell Power')).toBe(false);
  });

  it('does not expand universal spell power into its components when selected', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    const addedAffixes = service.addImportantAffix('Universal Spell Power');

    expect(addedAffixes).toEqual(['Universal Spell Power']);
    expect(service.isImportantAffix('Universal Spell Power')).toBe(true);
    expect(service.isImportantAffix('Fire Spell Power')).toBe(false);
  });

  it('does not expand spell lore into its components when selected', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    const addedAffixes = service.addImportantAffix('Spell Lore');

    expect(addedAffixes).toEqual(['Spell Lore']);
    expect(service.isImportantAffix('Spell Lore')).toBe(true);
    expect(service.isImportantAffix('Force Lore')).toBe(false);
  });

  it('empties and disables offhand when equipping a non-crossbow two-handed weapon', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    service.set(makeItem('Test Shield', 'Offhand', 'Large shields'));
    service.set(makeItem('Test Great Sword', 'Weapon', 'Great Swords'));

    expect(service.hasItem('Offhand')).toBe(false);
    expect(service.isOffhandDisabled()).toBe(true);
    expect(service.isSlotDisabled('Offhand')).toBe(true);
    expect(service.isSlotDisabled('Weapon')).toBe(false);
    expect(service.canEquip(makeItem('Test Rune Arm', 'Offhand', 'Rune Arms'))).toBe(false);
    expect(service.isLocked('Offhand')).toBe(true);
    expect(service.getUnlockedSlots().has('Offhand')).toBe(false);
  });

  it('counts equipped items, not empty slots', () => {
    const service: EquippedService = TestBed.inject(EquippedService);
    expect(service.getEquippedItemCount()).toBe(0);
    expect(service.isBuildEmpty()).toBe(true);

    service.set(makeItem('Test Shield', 'Offhand', 'Large shields'));
    service.set(makeItem('Test Ring', 'Ring1', 'Jewelry'));
    expect(service.getEquippedItemCount()).toBe(2);

    // A two-hander evicts the offhand, emptying that slot.
    service.set(makeItem('Test Great Sword', 'Weapon', 'Great Swords'));
    expect(service.getEquippedItemCount()).toBe(2);

    service.clearSlot('Ring1');
    service.clearSlot('Weapon');
    expect(service.getEquippedItemCount()).toBe(0);
    expect(service.isBuildEmpty()).toBe(true);
  });

  it('omits empty slots from the params it publishes, rather than an undefined-valued key', () => {
    // Regression test: empty slots once wrote params[slot] = undefined, which
    // survived as a real key; re-applying that record fed a null name into
    // canonicalizeGeneratedCraftedItemName, which throws - and an uncaught
    // error inside route.paramMap's subscribe callback silently kills that
    // subscription until a hard reload.
    const service: EquippedService = TestBed.inject(EquippedService);
    const queryParams: QueryParamsService = TestBed.inject(QueryParamsService);
    // EquippedService's live-edit subscription to QueryParamsService's
    // combined-params tracking only wires up once initialPageLoad flips
    // false (see QueryParamsService.applyParamsToListeners) - a real page
    // load does this via the URL-decode pipeline; trigger it directly here.
    queryParams.applyDecodedBuildParams({});

    service.set(makeItem('Test Shield', 'Offhand', 'Large shields'));
    // 'Weapon' (and every other slot) is deliberately left empty.

    const combined = queryParams.getCombinedParams();

    expect(combined['Offhand']).toBe('Test Shield');
    expect('Weapon' in combined).toBe(false);
    expect(() => service.updateFromParams({
      keys: Object.keys(combined),
      get: (key: string) => {
        const value = (combined as Record<string, unknown>)[key];
        return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
      },
      getAll: (key: string) => {
        const value = (combined as Record<string, unknown>)[key];
        return Array.isArray(value) ? value : (value === undefined ? [] : [value]);
      }
    })).not.toThrow();
  });

  it('ignores an ml_<slot> param for a slot with no equipped item', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    service.updateFromParams(makeParamsAdapter({ ml_Weapon: '15' }));

    expect(service.getSlotsSnapshot().get('Weapon')).toBeNull();
  });

  it('does not include an unequipped slot\'s set membership in getActiveSets()', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    service.set(makeItem('Devourer Gloves', 'Gloves', 'Gloves', [], ['Devourer of Souls']));
    // Every other slot is deliberately left empty.

    expect(service.getActiveSets().get('Devourer of Souls')).toBe(1);
  });

  it('labels an empty slot "empty" in the shared text description, not "undefined"', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    service.set(makeItem('Test Shield', 'Offhand', 'Large shields'));
    // Every other slot is deliberately left empty.

    const description = service.getGearDescription();

    expect(description).toContain('Offhand: Test Shield');
    expect(description).toContain('Weapon: empty');
    expect(description).not.toContain('undefined');
  });

  it('keeps rune arms equipped with crossbows and filters offhand choices to rune arms', () => {
    const service: EquippedService = TestBed.inject(EquippedService);
    const runeArm = makeItem('Test Rune Arm', 'Offhand', 'Rune Arms');
    const shield = makeItem('Test Shield', 'Offhand', 'Large shields');

    service.set(runeArm);
    service.set(makeItem('Test Heavy Crossbow', 'Weapon', 'Heavy Crossbows'));

    expect(service.getSlotsSnapshot().get('Offhand')?.name).toBe('Test Rune Arm');
    expect(service.isOffhandDisabled()).toBe(false);
    expect(service.isOffhandRuneArmOnly()).toBe(true);
    expect(service.canEquip(runeArm)).toBe(true);
    expect(service.canEquip(shield)).toBe(false);
    expect(service.getCompatibleGearForSlot('Offhand', [runeArm, shield])).toEqual([runeArm]);
    expect(service.getCompatibleGear([runeArm, shield])).toEqual([runeArm]);
    expect(service.getUnlockedSlots().has('Offhand')).toBe(false);
  });

  it('evicts non-rune offhands when equipping a crossbow', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    service.set(makeItem('Test Shield', 'Offhand', 'Large shields'));
    service.set(makeItem('Test Great Crossbow', 'Weapon', 'Great Crossbows'));

    expect(service.hasItem('Offhand')).toBe(false);
    expect(service.isOffhandDisabled()).toBe(false);
    expect(service.isOffhandRuneArmOnly()).toBe(true);
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

  it('lets a manual external value outrank a weaker gear source and be removed again', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    service.set(makeItem('Weak Gloves', 'Gloves', 'Gloves', [
      { name: 'Deadly', type: 'Insightful', value: 5 },
    ]));

    const id = service.addExternalAffixValue('Deadly', 'Insightful', 20, 'Trance');

    expect(service.getCurrentValueForAffixType('Deadly', 'Insightful')).toBe(20);
    expect(service.getSourcesForAffixType('Deadly', 'Insightful')).toEqual([{
        kind: 'external',
        slot: 'Non-gear',
        itemName: 'Trance',
        affixName: 'Deadly',
        bonusType: 'Insightful',
        value: 20,
      }]);

    service.removeExternalAffix(id);

    expect(service.getCurrentValueForAffixType('Deadly', 'Insightful')).toBe(5);
  });

  it('replaces the existing external entry for a type instead of stacking a second one', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    const firstId = service.addExternalAffixValue('Deadly', 'Insightful', 10, 'Trance');
    const secondId = service.addExternalAffixIgnored('Deadly', 'Insightful', 'Not chasing');

    expect(service.getExternalAffixesForType('Deadly', 'Insightful')).toEqual([{
        id: secondId,
        affixName: 'Deadly',
        bonusType: 'Insightful',
        kind: 'ignored',
        value: 0,
        label: 'Not chasing',
      }]);
    expect(service.isAffixTypeIgnored('Deadly', 'Insightful')).toBe(true);
    expect(firstId).not.toBe(secondId);
  });

  it('records an ignored external affix without contributing to its value', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    const id = service.addExternalAffixIgnored('Concentration', 'Insight', 'Not worth chasing');

    expect(service.getCurrentValueForAffixType('Concentration', 'Insight')).toBe(0);
    expect(service.getExternalAffixesForType('Concentration', 'Insight')).toEqual([{
        id,
        affixName: 'Concentration',
        bonusType: 'Insight',
        kind: 'ignored',
        value: 0,
        label: 'Not worth chasing',
      }]);

    service.removeExternalAffix(id);

    expect(service.getExternalAffixesForType('Concentration', 'Insight')).toEqual([]);
  });

  it('emits an event when an item is equipped', () => {
    const service: EquippedService = TestBed.inject(EquippedService);
    const events: Array<{
      slot: string;
      itemName: string;
    }> = [];
    const subscription = service.getEquippedItemEvents().subscribe(event => events.push(event));

    service.set(makeItem('Flashy Gloves', 'Gloves', 'Gloves'));
    subscription.unsubscribe();

    expect(events).toEqual([{ slot: 'Gloves', itemName: 'Flashy Gloves' }]);
  });

  describe('one Minor Artifact at a time', () => {
    function artifact(name: string, slot: string, type: string) {
      return new Item({
        name, slot, type, ml: 30, affixes: [], sets: [], url: '/page/' + name.replace(/ /g, '_'),
        crafting: [], quests: [], artifact: true,
      });
    }

    it('refuses a second artifact in another slot', () => {
      const service: EquippedService = TestBed.inject(EquippedService);
      service.set(artifact('Artifact Ring', 'Ring1', 'Rings'));

      const boots = artifact('Artifact Boots', 'Boots', 'Boots');
      expect(service.isBlockedByArtifactLimit(boots)).toBe(true);
      expect(service.canEquip(boots)).toBe(false);

      service.set(boots);
      expect(service.hasItem('Boots')).toBe(false);
    });

    it('allows swapping the artifact in its own slot, and any ordinary item', () => {
      const service: EquippedService = TestBed.inject(EquippedService);
      service.set(artifact('Artifact Ring', 'Ring1', 'Rings'));

      expect(service.canEquip(artifact('Other Artifact Ring', 'Ring1', 'Rings'))).toBe(true);
      expect(service.canEquip(makeItem('Plain Boots', 'Boots', 'Boots'))).toBe(true);
    });

    it('allows an artifact again once the equipped one is removed', () => {
      const service: EquippedService = TestBed.inject(EquippedService);
      service.set(artifact('Artifact Ring', 'Ring1', 'Rings'));
      service.clearSlot('Ring1');

      expect(service.canEquip(artifact('Artifact Boots', 'Boots', 'Boots'))).toBe(true);
    });

    it('leaves a build that already has two artifacts alone, but will not take one back once removed', () => {
      const service: EquippedService = TestBed.inject(EquippedService);
      const ring = artifact('Artifact Ring', 'Ring1', 'Rings');
      const boots = artifact('Artifact Boots', 'Boots', 'Boots');
      // How a URL restore fills slots: it bypasses set(), so an old link with two artifacts still loads.
      (service as any)._set(ring);
      (service as any)._set(boots);

      expect(service.hasItem('Ring1')).toBe(true);
      expect(service.hasItem('Boots')).toBe(true);

      service.clearSlot('Boots');
      expect(service.canEquip(boots)).toBe(false);
    });

    it('drops blocked artifacts from slot suggestions but not from the drawer-facing list', () => {
      const service: EquippedService = TestBed.inject(EquippedService);
      service.set(artifact('Artifact Ring', 'Ring1', 'Rings'));
      const blocked = artifact('Artifact Boots', 'Boots', 'Boots');
      const plain = makeItem('Plain Boots', 'Boots', 'Boots');

      expect(service.getCompatibleGearForSlot('Boots', [blocked, plain])).toEqual([plain]);
      expect(service.getCompatibleGear([blocked, plain])).toEqual([blocked, plain]);
    });
  });

  describe('filigree slots tracking', () => {
    function coveredNames(service: EquippedService) {
      let covered = new Map<string, Array<any>>();
      service.getCoveredAffixes().subscribe(map => (covered = map)).unsubscribe();
      return Array.from(covered.keys());
    }

    it('tracks Max Filigree Slots without storing it while the level range reaches 20', () => {
      const service: EquippedService = TestBed.inject(EquippedService);
      TestBed.inject(FiltersService).setLevelRange(1, 20);
      service.setImportantAffixes(['Strength']);

      expect(coveredNames(service)).toContain('Max Filigree Slots');
      expect(service.isImportantAffix('Max Filigree Slots')).toBe(true);
      expect(service.isDerivedTrackedAffix('Max Filigree Slots')).toBe(true);
      expect(Array.from(service.getImportantAffixes())).toEqual(['Strength']);
    });

    it('drops it when the level range stops short of 20, and brings it back', () => {
      const service: EquippedService = TestBed.inject(EquippedService);
      const filters = TestBed.inject(FiltersService);
      service.setImportantAffixes(['Strength']);

      filters.setLevelRange(1, 19);
      expect(coveredNames(service)).not.toContain('Max Filigree Slots');
      expect(service.isImportantAffix('Max Filigree Slots')).toBe(false);
      expect(service.isDerivedTrackedAffix('Max Filigree Slots')).toBe(false);

      filters.setLevelRange(1, 25);
      expect(coveredNames(service)).toContain('Max Filigree Slots');
    });

    it('does not derive any other affix', () => {
      const service: EquippedService = TestBed.inject(EquippedService);

      expect(service.isDerivedTrackedAffix('Strength')).toBe(false);
    });
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

    vi.spyOn(availability, 'getScarcityWeight').mockImplementation((_affixName: string, bonusType: string) => bonusType === 'Profane' ? 2.2 : 1);

    const commonItem = makeItem('Common Belt', 'Belt', 'Belt', [{ name: 'Strength', type: 'Enhancement', value: 6 }]);
    const scarceItem = makeItem('Scarce Belt', 'Belt', 'Belt', [{ name: 'Strength', type: 'Profane', value: 6 }]);

    expect(service.getScore(scarceItem)).toBeGreaterThan(service.getScore(commonItem));
  });

  it('stops applying scarcity once equipped gear covers the type to the moderate threshold', () => {
    const service: EquippedService = TestBed.inject(EquippedService);
    const availability = TestBed.inject(AffixAvailabilityService);
    service.setImportantAffixes(['Strength']);

    vi.spyOn(service, 'getCurrentValueForAffixType').mockReturnValue(10);
    vi.spyOn((service as any).gearList, 'getBestValueForAffixType').mockReturnValue(10);
    const scarcitySpy = vi.spyOn(availability, 'getScarcityWeight').mockReturnValue(2.2);

    const scarceItem = makeItem('Scarce Belt', 'Belt', 'Belt', [{ name: 'Strength', type: 'Profane', value: 6 }]);
    service.getScore(scarceItem);

    expect(scarcitySpy).not.toHaveBeenCalled();
  });

  it('nudges a set piece up when the set is the only source of an uncovered tracked need', () => {
    const service: EquippedService = TestBed.inject(EquippedService);
    const availability = TestBed.inject(AffixAvailabilityService);
    service.setImportantAffixes(['Strength']);

    vi.spyOn(availability, 'getScarcityWeight').mockReturnValue(1);
    vi.spyOn(availability, 'getRemainingAvailability').mockImplementation((affixName: string, bonusType: string) => ({
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

    const params = service['params'].getValue()!;
    expect(params['craft_0_system']).toBe('Augment Slot 1');
    expect(params['craft_0_selected']).toBe('Red Augment Slot (empty)');
  });

  it('does not persist planner view state to params - it lives in localStorage instead', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    service.setActiveMainTab('affixes');
    service.setTrackedAffixGroupMode('slots');
    service.toggleTrackedAffixGroupCollapsed('Defense');
    service.toggleTrackedAffixGroupCollapsed('set-only');

    expect(localStorage.getItem('ddo-gear-planner-active-tab')).toBe('affixes');
    expect(localStorage.getItem('ddo-gear-planner-tracked-affix-group-mode')).toBe('slots');
    expect(localStorage.getItem('ddo-gear-planner-tracked-affix-collapsed')).toBe('Defense,set-only');
  });

  it('ignores tab/taGroup/taCollapsed if a URL still carries them (legacy links)', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    service.updateFromParams({
      keys: ['tracked', 'tab', 'taGroup', 'taCollapsed'],
      get: (key: string) => ({ tab: 'affixes', taGroup: 'slots', taCollapsed: 'set-only,2' } as Record<string, string>)[key] ?? null,
      getAll: () => [],
    });

    let tab: string | undefined;
    service.getActiveMainTab().subscribe(value => (tab = value)).unsubscribe();

    expect(tab).toBe('equipment');
  });

  it('restores planner view state from localStorage on construction', () => {
    localStorage.setItem('ddo-gear-planner-active-tab', 'affixes');
    localStorage.setItem('ddo-gear-planner-tracked-affix-group-mode', 'slots');
    localStorage.setItem('ddo-gear-planner-tracked-affix-collapsed', 'set-only,2');

    const service: EquippedService = TestBed.inject(EquippedService);

    let tab: string | undefined;
    service.getActiveMainTab().subscribe(value => (tab = value)).unsubscribe();
    let state: {
      groupMode: string;
      collapsed: string[];
    } | undefined;
    service.getTrackedAffixViewState().subscribe(value => (state = value)).unsubscribe();

    expect(tab).toBe('affixes');
    expect(state?.groupMode).toBe('slots');
    expect([...(state?.collapsed ?? [])].sort()).toEqual(['2', 'set-only']);
  });
});
