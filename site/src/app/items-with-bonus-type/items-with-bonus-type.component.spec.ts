import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { ItemsWithBonusTypeComponent } from './items-with-bonus-type.component';
import { Item } from '../item';
import { Craftable } from '../craftable';
import { CraftableOption } from '../craftable-option';

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

  it('offers free non-augment crafting tiers on equipped items', () => {
    component.affixName = 'Disable Device';
    component.bonusType = 'Insight';

    const filledTier = new Craftable('T1 (Equipment)', [
      new CraftableOption({ affixes: [{ name: 'Disable Device', type: 'Competence', value: 22 }] }),
    ], false);
    filledTier.selected = filledTier.options[1];
    const openTier = new Craftable('T2 (Equipment)', [
      new CraftableOption({ affixes: [{ name: 'Disable Device', type: 'Insight', value: 7 }] }),
    ], false);

    const necklace = new Item(null);
    necklace.name = 'Legendary Green Steel Necklace';
    necklace.slot = 'Neck';
    necklace.crafting = [filledTier, openTier];

    spyOn(component.gearDB, 'findGearWithAffixAndType').and.returnValue([]);
    spyOn(component.gearDB, 'findAugmentsWithAffixAndType').and.returnValue([]);
    spyOn(component.gearDB, 'findSetsWithAffixAndType').and.returnValue([] as any);
    spyOn(component.equipped, 'getCompatibleGear').and.returnValue([]);
    spyOn(component.equipped, 'getUnlockedSlots').and.returnValue(new Set());
    spyOn(component.equipped, 'getActiveSets').and.returnValue(new Map());
    spyOn(component.equipped, 'getSlotsSnapshot').and.returnValue(new Map([['Neck', necklace]]));

    (component as any).refreshMatches();

    const keys = Array.from(component.craftIntoEquippedGear.keys());
    expect(keys.length).toBe(1);
    const gearMap = component.craftIntoEquippedGear.get(keys[0])!;
    const [equippedItem] = Array.from(gearMap.keys());
    expect(equippedItem.name).toBe('Legendary Green Steel Necklace');
    expect(gearMap.get(equippedItem)!.map(c => c.name)).toEqual(['T2 (Equipment)']);
    expect(component.craftOptionMatchValue(keys[0])).toBe(7);
  });
});
