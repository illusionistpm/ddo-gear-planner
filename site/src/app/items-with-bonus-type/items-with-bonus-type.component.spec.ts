import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { ItemsWithBonusTypeComponent } from './items-with-bonus-type.component';

describe('ItemsWithBonusTypeComponent', () => {
  let component: ItemsWithBonusTypeComponent;
  let fixture: ComponentFixture<ItemsWithBonusTypeComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ ItemsWithBonusTypeComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ItemsWithBonusTypeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('splits sets into reachable and out-of-reach by piece threshold', () => {
    component.affixName = 'Kinetic Lore';
    component.bonusType = 'Artifact';
    spyOn(component.gearDB, 'findGearWithAffixAndType').and.returnValue([]);
    spyOn(component.gearDB, 'findAugmentsWithAffixAndType').and.returnValue([]);
    spyOn(component.gearDB, 'findSetsWithAffixAndType').and.returnValue([
      ['Reachable Set', 2, 5],
      ['Out Of Reach Set', 3, 6],
    ] as any);
    spyOn(component.equipped, 'getCompatibleGear').and.returnValue([]);
    spyOn(component.equipped, 'getUnlockedSlots').and.returnValue(new Set(['Cloak', 'Boots']));
    spyOn(component.equipped, 'getActiveSets').and.returnValue(new Map());
    spyOn((component as any).availability, 'isSetReachable').and.callFake(
      (setName: string) => setName === 'Reachable Set'
    );

    (component as any).refreshMatches();

    expect(component.sets.map(entry => entry[0])).toEqual(['Reachable Set']);
    expect(component.unreachableSets.map(entry => entry[0])).toEqual(['Out Of Reach Set']);
  });

  it('reports how many pieces of a set are already equipped', () => {
    component.affixName = 'Kinetic Lore';
    component.bonusType = 'Artifact';
    spyOn(component.gearDB, 'findGearWithAffixAndType').and.returnValue([]);
    spyOn(component.gearDB, 'findAugmentsWithAffixAndType').and.returnValue([]);
    spyOn(component.gearDB, 'findSetsWithAffixAndType').and.returnValue([['Owned Set', 3, 6]] as any);
    spyOn(component.equipped, 'getCompatibleGear').and.returnValue([]);
    spyOn(component.equipped, 'getUnlockedSlots').and.returnValue(new Set(['Cloak', 'Boots', 'Gloves']));
    spyOn(component.equipped, 'getActiveSets').and.returnValue(new Map([['Owned Set', 2]]));
    spyOn((component as any).availability, 'isSetReachable').and.returnValue(true);

    (component as any).refreshMatches();

    expect(component.equippedPiecesForSet('Owned Set')).toBe(2);
    expect(component.equippedPiecesForSet('Some Other Set')).toBe(0);
  });
});
