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
});
