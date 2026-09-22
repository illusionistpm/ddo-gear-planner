import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { EffectsTableComponent } from './effects-table.component';
import { FiltersService } from '../planner/filters.service';
import { EquippedService } from '../planner/equipped.service';

describe('EffectsTableComponent', () => {
  let component: EffectsTableComponent;
  let fixture: ComponentFixture<EffectsTableComponent>;
  const onboardingStateKey = 'ddo-planner-onboarding-state-v1';
  const legacyOnboardingKey = 'ddo-planner-onboarding-affix-type-opened';

  beforeEach(async () => {
    localStorage.removeItem(onboardingStateKey);
    localStorage.removeItem(legacyOnboardingKey);
    await TestBed.configureTestingModule({
      imports: [AppModule]
    })
      .compileComponents();
  });

  afterEach(() => {
    localStorage.removeItem(onboardingStateKey);
    localStorage.removeItem(legacyOnboardingKey);
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(EffectsTableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    // From level 20 the Max Filigree Slots affix is tracked automatically; keep it out of these specs' rows.
    // (After creation, because restoring the URL resets the level range.)
    TestBed.inject(FiltersService).setLevelRange(1, 19);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('groups regular affixes without filtering them', () => {
    component.boolAffixNames = ['Deathblock'];
    component.boolAffixMap.set('Deathblock', [{ bonusType: 'Bool', value: 1 }]);
    component.affixNames = ['Strength', 'Armor-Piercing', 'Cold Lore'];

    expect(component.getFilteredBoolAffixNames()).toEqual(['Deathblock']);
    expect(component.getAffixGroups()).toContainEqual({ name: 'Attributes', affixes: ['Strength'] });
    expect(component.getAffixGroups()).toContainEqual({ name: 'Offense', affixes: ['Armor-Piercing'] });
    expect(component.getAffixGroups()).toContainEqual({ name: 'Casting', affixes: ['Cold Lore'] });
  });

  it('combines checklist affixes with utility affixes in one display group', () => {
    component.boolAffixNames = ['Feather Falling'];
    component.boolAffixMap.set('Feather Falling', [{ bonusType: 'Bool', value: 1 }]);
    component.affixNames = ['Speed', 'Deadly'];

    expect(component.getTrackedAffixGroups()).toContainEqual({
      name: 'Utility & Checklist',
      affixes: ['Speed'],
      checklistAffixes: ['Feather Falling']
    });
  });

  it('targets the first missing-value chip in the first non-utility onboarding group', () => {
    component.onboardingActive = true;
    component.affixNames = ['Speed', 'Strength'];
    component.affixMap.set('Speed', [
      { bonusType: 'Enhancement', value: 30 },
    ]);
    component.affixMap.set('Strength', [
      { bonusType: 'Enhancement', value: 0 },
      { bonusType: 'Equipment', value: 13 },
    ]);
    vi.spyOn(component.gearDB, 'getAllLevelTypesForAffix').mockImplementation((affixName: string) => affixName === 'Strength' ? ['Enhancement', 'Equipment'] : []);
    vi.spyOn(component.gearDB, 'getBestValueForAffixType').mockImplementation((affixName: string, bonusType: string) => affixName === 'Strength' && bonusType === 'Enhancement' ? 8 : 0);
    (component as any).refreshTrackedAffixDisplay();

    expect(component.isOnboardingTargetChip('Speed', 'Enhancement')).toBe(false);
    expect(component.isOnboardingTargetChip('Strength', 'Enhancement')).toBe(true);
    expect(component.isOnboardingTargetChip('Strength', 'Equipment')).toBe(false);
  });

  it('falls back to a covered chip when every onboarding chip already has value', () => {
    component.onboardingActive = true;
    component.affixNames = ['Strength'];
    component.affixMap.set('Strength', [
      { bonusType: 'Equipment', value: 13 },
    ]);
    vi.spyOn(component.gearDB, 'getAllLevelTypesForAffix').mockReturnValue([]);
    (component as any).refreshTrackedAffixDisplay();

    expect(component.isOnboardingTargetChip('Strength', 'Equipment')).toBe(true);
  });

  it('falls back to the first utility checklist chip when it is the only onboarding group', () => {
    component.onboardingActive = true;
    component.boolAffixNames = ['Feather Falling'];
    component.boolAffixMap.set('Feather Falling', [{ bonusType: 'Bool', value: 1 }]);
    (component as any).refreshTrackedAffixDisplay();

    expect(component.isOnboardingTargetChip('Feather Falling', 'Bool')).toBe(true);
  });

  it('pairs the tracked affix chip green cue with intro text and a skip action', () => {
    component.onboardingActive = true;
    component.affixNames = ['Strength'];
    component.affixMap.set('Strength', [
      { bonusType: 'Equipment', value: 13 },
    ]);
    vi.spyOn(component.gearDB, 'getAllLevelTypesForAffix').mockReturnValue([]);
    (component as any).refreshTrackedAffixDisplay();

    expect(component.shouldShowAffixTypeHint()).toBe(true);
    expect(component.isOnboardingTargetChip('Strength', 'Equipment')).toBe(true);
  });

  it('completes onboarding when a tracked affix chip opens item suggestions', () => {
    component.onboardingActive = true;
    component.affixNames = ['Strength'];
    component.affixMap.set('Strength', [
      { bonusType: 'Equipment', value: 13 },
    ]);
    vi.spyOn(component.gearDB, 'getAllLevelTypesForAffix').mockReturnValue([]);
    vi.spyOn((component as any).suggestionDrawer, 'openBonusType').mockReturnValue(undefined);
    (component as any).refreshTrackedAffixDisplay();

    component.showItemsWithBonusType('Strength', 'Equipment');

    expect(component.onboardingActive).toBe(false);
    expect((component as any).suggestionDrawer.openBonusType).toHaveBeenCalledWith('Strength', 'Equipment', true);
  });

  it('hides the tracked affix onboarding cue when dismissed', () => {
    component.onboardingActive = true;
    component.affixNames = ['Strength'];
    component.affixMap.set('Strength', [
      { bonusType: 'Equipment', value: 13 },
    ]);
    vi.spyOn(component.gearDB, 'getAllLevelTypesForAffix').mockReturnValue([]);
    (component as any).refreshTrackedAffixDisplay();

    component.dismissIntro();

    expect(component.shouldShowAffixTypeHint()).toBe(false);
    expect(component.isOnboardingTargetChip('Strength', 'Equipment')).toBe(false);
  });

  it('toggles category collapse state by group name', () => {
    expect(component.isAffixGroupCollapsed('Offense')).toBe(false);

    component.toggleAffixGroup('Offense');
    expect(component.isAffixGroupCollapsed('Offense')).toBe(true);

    component.toggleAffixGroup('Offense');
    expect(component.isAffixGroupCollapsed('Offense')).toBe(false);
  });

  it('lists all-level bonus types unavailable due to filtering', () => {
    component.affixMap.set('Strength', [
      { bonusType: 'Equipment', value: 0 },
      { bonusType: 'Insight', value: 0 },
    ]);
    vi.spyOn(component.gearDB, 'getBestValueForAffixType').mockReturnValue(0);
    vi.spyOn(component.gearDB, 'getAllLevelTypesForAffix').mockReturnValue(['Equipment', 'Insight', 'Quality']);

    expect(component.getVisibleTypes('Strength')).toEqual([]);
    expect(component.getUnavailableTypes('Strength')).toEqual(['Equipment', 'Insight', 'Quality']);
  });

  it('keeps zero-value bonus type buttons when filtered gear can provide that type', () => {
    component.affixMap.set('Strength', [
      { bonusType: 'Equipment', value: 0 },
      { bonusType: 'Insight', value: 0 },
    ]);
    vi.spyOn(component.gearDB, 'getBestValueForAffixType').mockImplementation((affixName, bonusType) => bonusType === 'Equipment' ? 12 : 0);
    vi.spyOn(component.gearDB, 'getAllLevelTypesForAffix').mockReturnValue(['Equipment', 'Insight']);

    expect(component.getVisibleTypes('Strength')).toEqual([
      {
        bonusType: 'Equipment',
        value: 0,
        label: 'Equipment',
        sourceAffixName: 'Strength',
        sourceBonusType: 'Equipment',
      },
    ]);
    expect(component.getUnavailableTypes('Strength')).toEqual(['Insight']);
    expect(component.isBonusTypeUnavailableAtCurrentLevelRange('Strength', { bonusType: 'Equipment', value: 0 })).toBe(false);
  });

  it('keeps equipped bonus type buttons even when the filtered max is zero', () => {
    component.affixMap.set('Strength', [
      { bonusType: 'Equipment', value: 12 },
    ]);
    vi.spyOn(component.gearDB, 'getBestValueForAffixType').mockReturnValue(0);
    vi.spyOn(component.gearDB, 'getAllLevelTypesForAffix').mockReturnValue(['Equipment']);

    expect(component.getVisibleTypes('Strength')).toEqual([
      {
        bonusType: 'Equipment',
        value: 12,
        label: 'Equipment',
        sourceAffixName: 'Strength',
        sourceBonusType: 'Equipment',
      },
    ]);
  });

  it('shows universal spell power rows under specific spell power affixes', () => {
    component.affixMap.set('Light Spell Power', [
      { bonusType: 'Enhancement', value: 120 },
    ]);
    vi.spyOn(component.gearDB, 'getAllLevelTypesForAffix').mockImplementation((affixName: string) => {
      if (affixName === 'Light Spell Power') {
        return ['Enhancement'];
      }
      if (affixName === 'Universal Spell Power') {
        return ['Implement', 'Profane'];
      }
      return [];
    });
    vi.spyOn(component.gearDB, 'getBestValueForAffixType').mockImplementation((affixName: string, bonusType: string) => {
      if (affixName === 'Light Spell Power' && bonusType === 'Enhancement') {
        return 150;
      }
      if (affixName === 'Universal Spell Power' && bonusType === 'Implement') {
        return 32;
      }
      if (affixName === 'Universal Spell Power' && bonusType === 'Profane') {
        return 25;
      }
      return 0;
    });
    vi.spyOn(component.equipped, 'getCurrentValueForAffixType').mockImplementation((affixName: string, bonusType: string) => affixName === 'Universal Spell Power' && bonusType === 'Implement' ? 30 : 0);

    const visibleTypes = component.getVisibleTypes('Light Spell Power');

    expect(visibleTypes).toContainEqual({
      bonusType: 'Enhancement',
      value: 120,
      label: 'Enhancement',
      sourceAffixName: 'Light Spell Power',
      sourceBonusType: 'Enhancement',
    });
    expect(visibleTypes).toContainEqual({
      bonusType: 'Implement',
      value: 30,
      label: 'Universal Implement',
      sourceAffixName: 'Universal Spell Power',
      sourceBonusType: 'Implement',
    });
    expect(visibleTypes).toContainEqual({
      bonusType: 'Profane',
      value: 0,
      label: 'Universal Profane',
      sourceAffixName: 'Universal Spell Power',
      sourceBonusType: 'Profane',
    });
  });

  it('does not also show a plain per-element row for a universal-companion-only bonus type', () => {
    // "Implement" spell power only ever comes from Universal Spell Power, so
    // ungrouping the companion affix leaks it onto Cold Spell Power's level types.
    vi.spyOn(component.gearDB, 'getAllLevelTypesForAffix').mockImplementation((affixName: string) => {
      if (affixName === 'Cold Spell Power') {
        return ['Equipment', 'Implement'];
      }
      if (affixName === 'Universal Spell Power') {
        return ['Implement'];
      }
      return [];
    });
    vi.spyOn(component.gearDB, 'isBonusTypeOnlyFromUniversalCompanion').mockImplementation((affixName: string, bonusType: string) => affixName === 'Cold Spell Power' && bonusType === 'Implement');
    vi.spyOn(component.gearDB, 'getBestValueForAffixType').mockImplementation((affixName: string, bonusType: string) => {
      if (affixName === 'Cold Spell Power' && bonusType === 'Equipment') {
        return 150;
      }
      if (affixName === 'Universal Spell Power' && bonusType === 'Implement') {
        return 32;
      }
      return 0;
    });
    vi.spyOn(component.equipped, 'getCurrentValueForAffixType').mockReturnValue(0);

    const visibleTypes = component.getVisibleTypes('Cold Spell Power');
    const implementRows = visibleTypes.filter(type => type.bonusType === 'Implement');

    expect(implementRows).toEqual([
      {
        bonusType: 'Implement',
        value: 0,
        label: 'Universal Implement',
        sourceAffixName: 'Universal Spell Power',
        sourceBonusType: 'Implement',
      },
    ]);
    expect(visibleTypes.some(type => type.label === 'Implement')).toBe(false);
  });

  it('routes universal spell power rows to the universal source affix', () => {
    const type = {
      bonusType: 'Implement',
      value: 30,
      label: 'Universal Implement',
      sourceAffixName: 'Universal Spell Power',
      sourceBonusType: 'Implement',
    };

    expect(component.getSourceAffixName('Light Spell Power', type)).toBe('Universal Spell Power');
    expect(component.getSourceBonusType(type)).toBe('Implement');
  });

  it('shows universal spell lore rows under specific lore affixes', () => {
    component.affixMap.set('Light Lore', [
      { bonusType: 'Equipment', value: 22 },
    ]);
    vi.spyOn(component.gearDB, 'getAllLevelTypesForAffix').mockImplementation((affixName: string) => {
      if (affixName === 'Light Lore') {
        return ['Equipment'];
      }
      if (affixName === 'Universal Spell Lore') {
        return ['Artifact'];
      }
      return [];
    });
    vi.spyOn(component.gearDB, 'getBestValueForAffixType').mockImplementation((affixName: string, bonusType: string) => affixName === 'Universal Spell Lore' && bonusType === 'Artifact' ? 5 : 1);
    vi.spyOn(component.equipped, 'getCurrentValueForAffixType').mockReturnValue(0);

    expect(component.getVisibleTypes('Light Lore')).toContainEqual({
      bonusType: 'Artifact',
      value: 0,
      label: 'Universal Artifact',
      sourceAffixName: 'Universal Spell Lore',
      sourceBonusType: 'Artifact',
    });
  });

  it('shows universal spell critical damage rows under specific intensity affixes', () => {
    component.affixMap.set('Fire Intensity', [
      { bonusType: 'Equipment', value: 12 },
    ]);
    vi.spyOn(component.gearDB, 'getAllLevelTypesForAffix').mockImplementation((affixName: string) => {
      if (affixName === 'Fire Intensity') {
        return ['Equipment'];
      }
      if (affixName === 'Universal Spell Critical Damage') {
        return ['Legendary'];
      }
      return [];
    });
    vi.spyOn(component.gearDB, 'getBestValueForAffixType').mockImplementation((affixName: string, bonusType: string) => affixName === 'Universal Spell Critical Damage' && bonusType === 'Legendary' ? 15 : 1);
    vi.spyOn(component.equipped, 'getCurrentValueForAffixType').mockReturnValue(0);

    expect(component.getVisibleTypes('Fire Intensity')).toContainEqual({
      bonusType: 'Legendary',
      value: 0,
      label: 'Universal Legendary',
      sourceAffixName: 'Universal Spell Critical Damage',
      sourceBonusType: 'Legendary',
    });
  });

  it('explains unavailable bonus types in the tooltip', () => {
    vi.spyOn(component.gearDB, 'getBestValueForAffixType').mockReturnValue(0);

    expect(component.getBonusTypeTooltip('Strength', { bonusType: 'Equipment', value: 0 }))
      .toBe('No gear with this bonus type is available in the current level range.');
  });

  it('says a zero-value available bonus type is not covered yet, rather than calling it low', () => {
    vi.spyOn(component.gearDB, 'getBestValueForAffixType').mockReturnValue(10);

    expect(component.getBonusTypeTooltip('Strength', { bonusType: 'Equipment', value: 0 }))
      .toBe('Not covered yet (best available: 10)');
  });

  it('does not show a numeric best-available value for an uncovered checklist affix', () => {
    vi.spyOn(component.gearDB, 'getBestValueForAffixType').mockReturnValue(1);

    expect(component.getBonusTypeTooltip('Deathblock', { bonusType: 'Bool', value: 0 }))
      .toBe('Not covered yet');
  });

  it('does not include source equipment names in bonus type tooltips', () => {
    vi.spyOn(component.gearDB, 'getBestValueForAffixType').mockReturnValue(10);
    vi.spyOn(component.equipped, 'getSourcesForAffixType').mockReturnValue([
      {
        kind: 'item',
        slot: 'Goggles',
        itemName: 'Precise Lenses',
        affixName: 'Accuracy',
        bonusType: 'Equipment',
        value: 8,
      },
    ]);

    expect(component.getBonusTypeTooltip('Accuracy', { bonusType: 'Equipment', value: 8 }))
      .toBe('Moderate value (2 below max)');
  });

  it('tracks visible type rows without depending on component method binding', () => {
    const trackVisibleType = component.trackVisibleType;

    expect(trackVisibleType(0, {
      bonusType: 'Implement',
      value: 0,
      sourceAffixName: 'Universal Spell Power',
      sourceBonusType: 'Implement',
    })).toBe('Universal Spell Power\0Implement');
  });

  it('hides max available badges when the filtered max is zero', () => {
    vi.spyOn(component.gearDB, 'getBestValueForAffixType').mockReturnValue(0);

    expect(component.shouldShowMaxAvailable('Strength', { bonusType: 'Equipment', value: 0 })).toBe(false);
  });

  it('shows max available badges when the filtered max is positive', () => {
    vi.spyOn(component.gearDB, 'getBestValueForAffixType').mockReturnValue(12);

    expect(component.shouldShowMaxAvailable('Strength', { bonusType: 'Equipment', value: 0 })).toBe(true);
  });

  it('follows the tracked-affix grouping mode', () => {
    // The Group by control lives in the workspace toolbar now; this component
    // only renders whichever mode EquippedService reports.
    const equipped = TestBed.inject(EquippedService);

    expect(component.groupMode).toBe('category');
    equipped.setTrackedAffixGroupMode('slots');
    expect(component.groupMode).toBe('slots');
    equipped.setTrackedAffixGroupMode('category');
    expect(component.groupMode).toBe('category');
  });

  it('buckets uncovered types by remaining supply, set-only first then by slot count', () => {
    component.affixNames = ['Strength', 'Fire Intensity', 'Dexterity'];
    component.affixMap.set('Strength', [{ bonusType: 'Profane', value: 0 }]);
    component.affixMap.set('Fire Intensity', [{ bonusType: 'Legendary', value: 0 }]);
    component.affixMap.set('Dexterity', [{ bonusType: 'Insight', value: 0 }]);
    vi.spyOn(component.gearDB, 'getAllLevelTypesForAffix').mockReturnValue([]);
    vi.spyOn(component.gearDB, 'getBestValueForAffixType').mockReturnValue(5);
    vi.spyOn(component.gearDB, 'getBestValueForAffix').mockReturnValue(5);
    vi.spyOn((component as any).availability, 'getRemainingAvailability').mockImplementation((_affixName: any, bonusType: any) => {
      if (bonusType === 'Legendary') {
        return { tier: 'set-only', slotCount: 0, eliminated: false, setSources: [] };
      }
      if (bonusType === 'Profane') {
        return { tier: 'scarce', slotCount: 1, eliminated: false, setSources: [] };
      }
      return { tier: 'common', slotCount: 7, eliminated: false, setSources: [] };
    });

    const groups = component.getSlotGroups();

    expect(groups.map(group => group.key)).toEqual(['set-only', '1', '5plus']);
    expect(groups[0].rows[0].affixName).toBe('Fire Intensity');
    expect(groups[1].rows[0].chips[0].bonusType).toBe('Profane');
  });

  it('puts Max Filigree Slots in its own Minor Artifact bucket above the set-only one', () => {
    component.affixNames = ['Strength', 'Fire Intensity', 'Max Filigree Slots'];
    component.affixMap.set('Strength', [{ bonusType: 'Profane', value: 0 }]);
    component.affixMap.set('Fire Intensity', [{ bonusType: 'Legendary', value: 0 }]);
    component.affixMap.set('Max Filigree Slots', [{ bonusType: 'Untyped', value: 0 }]);
    vi.spyOn(component.gearDB, 'getAllLevelTypesForAffix').mockReturnValue([]);
    vi.spyOn(component.gearDB, 'getBestValueForAffixType').mockReturnValue(5);
    vi.spyOn(component.gearDB, 'getBestValueForAffix').mockReturnValue(5);
    vi.spyOn((component as any).availability, 'getRemainingAvailability').mockImplementation((_affixName: any, bonusType: any) => {
      if (bonusType === 'Legendary') {
        return { tier: 'set-only', slotCount: 0, eliminated: false, setSources: [] };
      }
      return { tier: 'scarce', slotCount: 2, eliminated: false, setSources: [] };
    });

    const groups = component.getSlotGroups();

    expect(groups.map(group => group.key)).toEqual(['minor-artifact', 'set-only', '2']);
    expect(groups[0].label).toBe('Minor Artifact');
    expect(groups[0].rows.map(row => row.affixName)).toEqual(['Max Filigree Slots']);
  });

  it('keeps every bonus type of one affix on a single row within a bucket', () => {
    component.affixNames = ['Fortitude Save'];
    component.affixMap.set('Fortitude Save', [
      { bonusType: 'Insight', value: 0 },
      { bonusType: 'Resistance', value: 0 },
    ]);
    vi.spyOn(component.gearDB, 'getAllLevelTypesForAffix').mockReturnValue([]);
    vi.spyOn(component.gearDB, 'getBestValueForAffixType').mockReturnValue(5);
    vi.spyOn(component.gearDB, 'getBestValueForAffix').mockReturnValue(5);
    vi.spyOn((component as any).availability, 'getRemainingAvailability').mockReturnValue({
      tier: 'scarce', slotCount: 2, eliminated: false, setSources: [],
    });

    const groups = component.getSlotGroups();

    expect(groups.map(group => group.key)).toEqual(['2']);
    expect(groups[0].rows.length).toBe(1);
    expect(groups[0].rows[0].affixName).toBe('Fortitude Save');
    expect(new Set(groups[0].rows[0].chips.map(chip => chip.bonusType)))
      .toEqual(new Set(['Insight', 'Resistance']));
  });

  it('puts sufficiently-covered types in the fulfilled bucket instead of the slot buckets', () => {
    component.affixNames = ['Strength'];
    component.affixMap.set('Strength', [
      { bonusType: 'Enhancement', value: 6 },
      { bonusType: 'Insight', value: 0 },
    ]);
    vi.spyOn(component.gearDB, 'getAllLevelTypesForAffix').mockReturnValue([]);
    vi.spyOn(component.gearDB, 'getBestValueForAffixType').mockReturnValue(8);
    const remaining = vi.spyOn((component as any).availability, 'getRemainingAvailability').mockReturnValue({
      tier: 'common', slotCount: 9, eliminated: false, setSources: [],
    });

    const groups = component.getSlotGroups();

    // Enhancement is sufficient (6 >= 3/4 of 8) and lands in "fulfilled" without
    // querying availability; Insight is still grouped by remaining supply.
    expect(groups.map(group => group.key)).toEqual(['5plus', 'fulfilled']);
    expect(groups[0].rows[0].chips[0].bonusType).toBe('Insight');
    expect(groups[1].rows[0].chips[0].bonusType).toBe('Enhancement');
    expect(remaining).toHaveBeenCalledTimes(1);
  });

  it('puts eliminated types in the ruled-out bucket at the bottom', () => {
    component.affixNames = ['Strength', 'Dexterity'];
    component.affixMap.set('Strength', [{ bonusType: 'Profane', value: 0 }]);
    component.affixMap.set('Dexterity', [{ bonusType: 'Insight', value: 0 }]);
    vi.spyOn(component.gearDB, 'getAllLevelTypesForAffix').mockReturnValue([]);
    vi.spyOn(component.gearDB, 'getBestValueForAffixType').mockReturnValue(6);
    vi.spyOn(component.gearDB, 'getBestValueForAffix').mockReturnValue(6);
    vi.spyOn((component as any).availability, 'getRemainingAvailability').mockImplementation((_affixName: any, bonusType: any) => bonusType === 'Profane'
      ? { tier: 'unavailable', slotCount: 0, eliminated: true, setSources: [] }
      : { tier: 'scarce', slotCount: 2, eliminated: false, setSources: [] });

    const groups = component.getSlotGroups();

    expect(groups.map(group => group.key)).toEqual(['2', 'ruled-out']);
    expect(groups[1].rows[0].chips[0].eliminated).toBe(true);
  });

  it('puts the fulfilled bucket after the ruled-out bucket', () => {
    component.affixNames = ['Strength', 'Dexterity', 'Wisdom'];
    component.affixMap.set('Strength', [{ bonusType: 'Profane', value: 0 }]);
    component.affixMap.set('Dexterity', [{ bonusType: 'Insight', value: 0 }]);
    component.affixMap.set('Wisdom', [{ bonusType: 'Enhancement', value: 6 }]);
    vi.spyOn(component.gearDB, 'getAllLevelTypesForAffix').mockReturnValue([]);
    vi.spyOn(component.gearDB, 'getBestValueForAffixType').mockReturnValue(6);
    vi.spyOn(component.gearDB, 'getBestValueForAffix').mockReturnValue(6);
    vi.spyOn((component as any).availability, 'getRemainingAvailability').mockImplementation((_affixName: any, bonusType: any) => bonusType === 'Profane'
      ? { tier: 'unavailable', slotCount: 0, eliminated: true, setSources: [] }
      : { tier: 'scarce', slotCount: 2, eliminated: false, setSources: [] });

    const groups = component.getSlotGroups();

    expect(groups.map(group => group.key)).toEqual(['2', 'ruled-out', 'fulfilled']);
    expect(groups[2].rows[0].affixName).toBe('Wisdom');
  });

  it('collects checked checklist affixes into the fulfilled bucket\'s checklist row', () => {
    component.boolAffixNames = ['Deathblock'];
    component.boolAffixMap.set('Deathblock', [{ bonusType: 'Bool', value: 1 }]);

    const groups = component.getSlotGroups();

    expect(groups.map(group => group.key)).toEqual(['fulfilled']);
    expect(groups[0].rows).toEqual([]);
    expect(groups[0].checklistAffixes).toEqual(['Deathblock']);
  });

  it('routes a set-only need through the bonus-type drawer, which lists the sets', () => {
    vi.spyOn((component as any).suggestionDrawer, 'openBonusType').mockReturnValue(undefined);

    component.showItemsWithBonusType('Kinetic Lore', 'Artifact');

    expect((component as any).suggestionDrawer.openBonusType).toHaveBeenCalledWith('Kinetic Lore', 'Artifact', true);
  });

  it('treats a type at or above 3/4 of the best value as sufficient', () => {
    vi.spyOn(component.gearDB, 'getBestValueForAffixType').mockReturnValue(8);

    expect(component.isBonusTypeSufficient('Strength', { bonusType: 'Profane', value: 6 })).toBe(true);
    expect(component.isBonusTypeSufficient('Strength', { bonusType: 'Profane', value: 5 })).toBe(false);
    expect(component.isBonusTypeSufficient('Strength', { bonusType: 'Profane', value: 0 })).toBe(false);
  });

  it('does not query availability for sufficiently-covered types when grouping by slots', () => {
    component.affixNames = ['Strength'];
    component.affixMap.set('Strength', [{ bonusType: 'Profane', value: 7 }]);
    vi.spyOn(component.gearDB, 'getAllLevelTypesForAffix').mockReturnValue([]);
    vi.spyOn(component.gearDB, 'getBestValueForAffixType').mockReturnValue(8);
    const remaining = vi.spyOn((component as any).availability, 'getRemainingAvailability').mockReturnValue(undefined);

    const groups = component.getSlotGroups();

    expect(groups.map(group => group.key)).toEqual(['fulfilled']);
    expect(remaining).not.toHaveBeenCalled();
  });

  describe('getClassForValue', () => {
    beforeEach(() => {
      vi.spyOn(component.gearDB, 'getBestValueForAffixType').mockImplementation((affixName: string, bonusType: string) => affixName === 'Strength' && bonusType === 'Insight' ? 8 : 0);
    });

    it('classifies penalties separately', () => {
      expect(component.getClassForValue('Strength', { bonusType: 'Penalty', value: -2 })).toBe('penalty-value');
    });

    it('treats zero as no value', () => {
      expect(component.getClassForValue('Strength', { bonusType: 'Insight', value: 0 })).toBe('no-value');
    });

    it('treats values below three quarters of the best as low', () => {
      expect(component.getClassForValue('Strength', { bonusType: 'Insight', value: 5 })).toBe('low-value');
    });

    it('treats values at three quarters of the best as moderate', () => {
      expect(component.getClassForValue('Strength', { bonusType: 'Insight', value: 6 })).toBe('mid-value');
    });

    it('treats the best available value as max', () => {
      expect(component.getClassForValue('Strength', { bonusType: 'Insight', value: 8 })).toBe('max-value');
    });

    it('treats zero with nothing available as no value, not best possible', () => {
      expect(component.getClassForValue('Strength', { bonusType: 'Quality', value: 0 })).toBe('no-value');
    });
  });

  describe('universal companion bonus types', () => {
    beforeEach(() => {
      vi.spyOn(component.gearDB, 'getAllLevelTypesForAffix').mockImplementation((affixName: string) => {
        if (affixName === 'Fire Spell Power') {
          return ['Equipment', 'Implement'];
        }
        if (affixName === 'Universal Spell Power') {
          return ['Implement'];
        }
        return [];
      });
      vi.spyOn(component.gearDB, 'getBestValueForAffixType').mockReturnValue(30);
      vi.spyOn(component.gearDB, 'isBonusTypeOnlyFromUniversalCompanion').mockImplementation((affixName: string, bonusType: string) => affixName === 'Fire Spell Power' && bonusType === 'Implement');
      vi.spyOn(component.equipped, 'getCurrentValueForAffixType').mockReturnValue(0);
    });

    it('shows a universal-only bonus type as a Universal row, not also as a plain row', () => {
      component.affixMap.set('Fire Spell Power', [{ bonusType: 'Equipment', value: 0 }]);

      expect(component.getVisibleTypes('Fire Spell Power').map(type => type.label))
        .toEqual(['Equipment', 'Universal Implement']);
    });
  });
});
