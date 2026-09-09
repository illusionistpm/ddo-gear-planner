import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { ItemsInSetComponent } from './items-in-set.component';
import { Affix } from '../affix';

describe('ItemsInSetComponent', () => {
  let component: ItemsInSetComponent;
  let fixture: ComponentFixture<ItemsInSetComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [AppModule]
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ItemsInSetComponent);
    component = fixture.componentInstance;
  });

  it('loads the set bonus tiers for the set before the item list', () => {
    spyOn(component.gearDB, 'getSetBonusThresholdDetails').and.returnValue([
      { threshold: 3, eligible: false, affixes: [new Affix({ name: 'Dodge', type: 'Quality', value: '3' })] },
    ]);
    spyOn(component.gearDB, 'findGearInSet').and.returnValue([]);

    component.setName = 'Some Set';
    component.ngOnInit();

    expect(component.setBonusTiers.length).toBe(1);
    expect(component.gearDB.getSetBonusThresholdDetails).toHaveBeenCalledWith('Some Set', component.equippedPieces);
  });

  it('marks not-yet-active tier bonuses as disabled', () => {
    const affix = new Affix({ name: 'Dodge', type: 'Quality', value: '3' });

    expect(component.getClassForSetAffix(affix, false)).toBe('DisabledSetBonus');
    expect(component.getClassForSetAffix(affix, true)).not.toBe('DisabledSetBonus');
  });
});
