import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { EffectsTableComponent } from './effects-table.component';

describe('EffectsTableComponent', () => {
  let component: EffectsTableComponent;
  let fixture: ComponentFixture<EffectsTableComponent>;
  const onboardingStateKey = 'ddo-planner-onboarding-state-v1';
  const legacyOnboardingKey = 'ddo-planner-onboarding-affix-type-opened';

  beforeEach(waitForAsync(() => {
    localStorage.removeItem(onboardingStateKey);
    localStorage.removeItem(legacyOnboardingKey);
    TestBed.configureTestingModule({
      imports: [ AppModule ]
    })
    .compileComponents();
  }));

  afterEach(() => {
    localStorage.removeItem(onboardingStateKey);
    localStorage.removeItem(legacyOnboardingKey);
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(EffectsTableComponent);
    component = fixture.componentInstance;
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
    expect(component.getAffixGroups()).toContain({ name: 'Attributes', affixes: ['Strength'] });
    expect(component.getAffixGroups()).toContain({ name: 'Offense', affixes: ['Armor-Piercing'] });
    expect(component.getAffixGroups()).toContain({ name: 'Casting', affixes: ['Cold Lore'] });
  });

  it('combines checklist affixes with utility affixes in one display group', () => {
    component.boolAffixNames = ['Feather Falling'];
    component.boolAffixMap.set('Feather Falling', [{ bonusType: 'Bool', value: 1 }]);
    component.affixNames = ['Speed', 'Deadly'];

    expect(component.getTrackedAffixGroups()).toContain({
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
    spyOn(component.gearDB, 'getAllLevelTypesForAffix').and.callFake((affixName: string) =>
      affixName === 'Strength' ? ['Enhancement', 'Equipment'] : []
    );
    spyOn(component.gearDB, 'getBestValueForAffixType').and.callFake((affixName: string, bonusType: string) =>
      affixName === 'Strength' && bonusType === 'Enhancement' ? 8 : 0
    );
    (component as any).refreshTrackedAffixDisplay();

    expect(component.isOnboardingTargetChip('Speed', 'Enhancement')).toBeFalse();
    expect(component.isOnboardingTargetChip('Strength', 'Enhancement')).toBeTrue();
    expect(component.isOnboardingTargetChip('Strength', 'Equipment')).toBeFalse();
  });

  it('falls back to a covered chip when every onboarding chip already has value', () => {
    component.onboardingActive = true;
    component.affixNames = ['Strength'];
    component.affixMap.set('Strength', [
      { bonusType: 'Equipment', value: 13 },
    ]);
    spyOn(component.gearDB, 'getAllLevelTypesForAffix').and.returnValue([]);
    (component as any).refreshTrackedAffixDisplay();

    expect(component.isOnboardingTargetChip('Strength', 'Equipment')).toBeTrue();
  });

  it('falls back to the first utility checklist chip when it is the only onboarding group', () => {
    component.onboardingActive = true;
    component.boolAffixNames = ['Feather Falling'];
    component.boolAffixMap.set('Feather Falling', [{ bonusType: 'Bool', value: 1 }]);
    (component as any).refreshTrackedAffixDisplay();

    expect(component.isOnboardingTargetChip('Feather Falling', 'Bool')).toBeTrue();
  });

  it('pairs the tracked affix chip green cue with intro text and a skip action', () => {
    component.onboardingActive = true;
    component.affixNames = ['Strength'];
    component.affixMap.set('Strength', [
      { bonusType: 'Equipment', value: 13 },
    ]);
    spyOn(component.gearDB, 'getAllLevelTypesForAffix').and.returnValue([]);
    (component as any).refreshTrackedAffixDisplay();

    expect(component.shouldShowAffixTypeHint()).toBeTrue();
    expect(component.isOnboardingTargetChip('Strength', 'Equipment')).toBeTrue();
  });

  it('completes onboarding when a tracked affix chip opens item suggestions', () => {
    component.onboardingActive = true;
    component.affixNames = ['Strength'];
    component.affixMap.set('Strength', [
      { bonusType: 'Equipment', value: 13 },
    ]);
    spyOn(component.gearDB, 'getAllLevelTypesForAffix').and.returnValue([]);
    spyOn((component as any).suggestionDrawer, 'openBonusType');
    (component as any).refreshTrackedAffixDisplay();

    component.showItemsWithBonusType('Strength', 'Equipment');

    expect(component.onboardingActive).toBeFalse();
    expect((component as any).suggestionDrawer.openBonusType).toHaveBeenCalledWith('Strength', 'Equipment', true);
  });

  it('hides the tracked affix onboarding cue when dismissed', () => {
    component.onboardingActive = true;
    component.affixNames = ['Strength'];
    component.affixMap.set('Strength', [
      { bonusType: 'Equipment', value: 13 },
    ]);
    spyOn(component.gearDB, 'getAllLevelTypesForAffix').and.returnValue([]);
    (component as any).refreshTrackedAffixDisplay();

    component.dismissIntro();

    expect(component.shouldShowAffixTypeHint()).toBeFalse();
    expect(component.isOnboardingTargetChip('Strength', 'Equipment')).toBeFalse();
  });

  it('toggles category collapse state by group name', () => {
    expect(component.isAffixGroupCollapsed('Offense')).toBeFalse();

    component.toggleAffixGroup('Offense');
    expect(component.isAffixGroupCollapsed('Offense')).toBeTrue();

    component.toggleAffixGroup('Offense');
    expect(component.isAffixGroupCollapsed('Offense')).toBeFalse();
  });

  it('lists all-level bonus types unavailable due to filtering', () => {
    component.affixMap.set('Kinetic Intensity', [
      { bonusType: 'Equipment', value: 0 },
      { bonusType: 'Insight', value: 0 },
    ]);
    spyOn(component.gearDB, 'getBestValueForAffixType').and.returnValue(0);
    spyOn(component.gearDB, 'getAllLevelTypesForAffix').and.returnValue(['Equipment', 'Insight', 'Quality']);

    expect(component.getVisibleTypes('Kinetic Intensity')).toEqual([]);
    expect(component.getUnavailableTypes('Kinetic Intensity')).toEqual(['Equipment', 'Insight', 'Quality']);
  });

  it('keeps zero-value bonus type buttons when filtered gear can provide that type', () => {
    component.affixMap.set('Kinetic Intensity', [
      { bonusType: 'Equipment', value: 0 },
      { bonusType: 'Insight', value: 0 },
    ]);
    spyOn(component.gearDB, 'getBestValueForAffixType').and.callFake((affixName, bonusType) =>
      bonusType === 'Equipment' ? 12 : 0
    );
    spyOn(component.gearDB, 'getAllLevelTypesForAffix').and.returnValue(['Equipment', 'Insight']);

    expect(component.getVisibleTypes('Kinetic Intensity')).toEqual([
      {
        bonusType: 'Equipment',
        value: 0,
        label: 'Equipment',
        sourceAffixName: 'Kinetic Intensity',
        sourceBonusType: 'Equipment',
      },
    ]);
    expect(component.getUnavailableTypes('Kinetic Intensity')).toEqual(['Insight']);
    expect(component.isBonusTypeUnavailableAtCurrentLevelRange(
      'Kinetic Intensity',
      { bonusType: 'Equipment', value: 0 }
    )).toBeFalse();
  });

  it('keeps equipped bonus type buttons even when the filtered max is zero', () => {
    component.affixMap.set('Kinetic Intensity', [
      { bonusType: 'Equipment', value: 12 },
    ]);
    spyOn(component.gearDB, 'getBestValueForAffixType').and.returnValue(0);
    spyOn(component.gearDB, 'getAllLevelTypesForAffix').and.returnValue(['Equipment']);

    expect(component.getVisibleTypes('Kinetic Intensity')).toEqual([
      {
        bonusType: 'Equipment',
        value: 12,
        label: 'Equipment',
        sourceAffixName: 'Kinetic Intensity',
        sourceBonusType: 'Equipment',
      },
    ]);
  });

  it('shows universal spell power rows under specific spell power affixes', () => {
    component.affixMap.set('Light Spell Power', [
      { bonusType: 'Enhancement', value: 120 },
    ]);
    spyOn(component.gearDB, 'getAllLevelTypesForAffix').and.callFake((affixName: string) => {
      if (affixName === 'Light Spell Power') {
        return ['Enhancement'];
      }
      if (affixName === 'Universal Spell Power') {
        return ['Implement', 'Profane'];
      }
      return [];
    });
    spyOn(component.gearDB, 'getBestValueForAffixType').and.callFake((affixName: string, bonusType: string) => {
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
    spyOn(component.equipped, 'getCurrentValueForAffixType').and.callFake((affixName: string, bonusType: string) =>
      affixName === 'Universal Spell Power' && bonusType === 'Implement' ? 30 : 0
    );

    const visibleTypes = component.getVisibleTypes('Light Spell Power');

    expect(visibleTypes).toContain({
      bonusType: 'Enhancement',
      value: 120,
      label: 'Enhancement',
      sourceAffixName: 'Light Spell Power',
      sourceBonusType: 'Enhancement',
    });
    expect(visibleTypes).toContain({
      bonusType: 'Implement',
      value: 30,
      label: 'Universal Implement',
      sourceAffixName: 'Universal Spell Power',
      sourceBonusType: 'Implement',
    });
    expect(visibleTypes).toContain({
      bonusType: 'Profane',
      value: 0,
      label: 'Universal Profane',
      sourceAffixName: 'Universal Spell Power',
      sourceBonusType: 'Profane',
    });
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
    spyOn(component.gearDB, 'getAllLevelTypesForAffix').and.callFake((affixName: string) => {
      if (affixName === 'Light Lore') {
        return ['Equipment'];
      }
      if (affixName === 'Universal Spell Lore') {
        return ['Artifact'];
      }
      return [];
    });
    spyOn(component.gearDB, 'getBestValueForAffixType').and.callFake((affixName: string, bonusType: string) =>
      affixName === 'Universal Spell Lore' && bonusType === 'Artifact' ? 5 : 1
    );
    spyOn(component.equipped, 'getCurrentValueForAffixType').and.returnValue(0);

    expect(component.getVisibleTypes('Light Lore')).toContain({
      bonusType: 'Artifact',
      value: 0,
      label: 'Universal Artifact',
      sourceAffixName: 'Universal Spell Lore',
      sourceBonusType: 'Artifact',
    });
  });

  it('explains unavailable bonus types in the tooltip', () => {
    spyOn(component.gearDB, 'getBestValueForAffixType').and.returnValue(0);

    expect(component.getBonusTypeTooltip('Kinetic Intensity', { bonusType: 'Equipment', value: 0 }))
      .toBe('No gear with this bonus type is available in the current level range.');
  });

  it('hides max available badges when the filtered max is zero', () => {
    spyOn(component.gearDB, 'getBestValueForAffixType').and.returnValue(0);

    expect(component.shouldShowMaxAvailable('Kinetic Intensity', { bonusType: 'Equipment', value: 0 })).toBeFalse();
  });

  it('shows max available badges when the filtered max is positive', () => {
    spyOn(component.gearDB, 'getBestValueForAffixType').and.returnValue(12);

    expect(component.shouldShowMaxAvailable('Kinetic Intensity', { bonusType: 'Equipment', value: 0 })).toBeTrue();
  });
});
