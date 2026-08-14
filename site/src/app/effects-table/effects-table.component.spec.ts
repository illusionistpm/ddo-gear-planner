import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { EffectsTableComponent } from './effects-table.component';

describe('EffectsTableComponent', () => {
  let component: EffectsTableComponent;
  let fixture: ComponentFixture<EffectsTableComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [ AppModule ]
    })
    .compileComponents();
  }));

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

  it('toggles category collapse state by group name', () => {
    expect(component.isAffixGroupCollapsed('Offense')).toBeFalse();

    component.toggleAffixGroup('Offense');
    expect(component.isAffixGroupCollapsed('Offense')).toBeTrue();

    component.toggleAffixGroup('Offense');
    expect(component.isAffixGroupCollapsed('Offense')).toBeFalse();
  });

  it('keeps all-level bonus type buttons when the filtered gear has no available value', () => {
    component.affixMap.set('Kinetic Intensity', [
      { bonusType: 'Equipment', value: 0 },
      { bonusType: 'Insight', value: 0 },
    ]);
    spyOn(component.gearDB, 'getBestValueForAffixType').and.returnValue(0);
    spyOn(component.gearDB, 'getAllLevelTypesForAffix').and.returnValue(['Equipment', 'Insight', 'Quality']);

    expect(component.getVisibleTypes('Kinetic Intensity')).toEqual([
      { bonusType: 'Equipment', value: 0 },
      { bonusType: 'Insight', value: 0 },
      { bonusType: 'Quality', value: 0 },
    ]);
    expect(component.isBonusTypeUnavailableAtCurrentLevelRange(
      'Kinetic Intensity',
      { bonusType: 'Equipment', value: 0 }
    )).toBeTrue();
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
      { bonusType: 'Equipment', value: 0 },
      { bonusType: 'Insight', value: 0 },
    ]);
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
      { bonusType: 'Equipment', value: 12 },
    ]);
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
