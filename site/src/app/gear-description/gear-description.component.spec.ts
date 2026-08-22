import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { GearDescriptionComponent } from './gear-description.component';
import { Craftable } from '../craftable';
import { CraftableOption } from '../craftable-option';
import { Item } from '../item';

describe('GearDescriptionComponent', () => {
  let component: GearDescriptionComponent;
  let fixture: ComponentFixture<GearDescriptionComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ GearDescriptionComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(GearDescriptionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('hides and clears augment slot 2 when augment slot 1 is empty', () => {
    const item = makeItemWithAugmentSlots();
    item.getCraftingByName('Augment Slot 2')?.selectCraftingSystem('Colorless Augment Slot');
    component.curItem = item;

    component['refreshDisplayRows']();

    expect(item.getCraftingByName('Augment Slot 2')?.selectedCraftingSystemName).toBe('');
    expect(component.craftingRows.map(row => row.craft.name)).toEqual(['Augment Slot 1']);
  });

  it('shows augment slot 2 after augment slot 1 is selected', () => {
    const item = makeItemWithAugmentSlots();
    item.getCraftingByName('Augment Slot 1')?.selectCraftingSystem('Blue Augment Slot');
    component.curItem = item;

    component['refreshDisplayRows']();

    expect(component.craftingRows.map(row => row.craft.name)).toEqual(['Augment Slot 1', 'Augment Slot 2']);
    expect(component.getCraftingSystemEmptyLabel(item.getCraftingByName('Augment Slot 1') as Craftable)).toBe('No augment slot');
  });

  it('hides and clears augment slot 2 when augment slot 1 is colorless', () => {
    const item = makeItemWithAugmentSlots();
    item.getCraftingByName('Augment Slot 1')?.selectCraftingSystem('Colorless Augment Slot');
    item.getCraftingByName('Augment Slot 2')?.selectCraftingSystem('Colorless Augment Slot');
    component.curItem = item;

    component['refreshDisplayRows']();

    expect(item.getCraftingByName('Augment Slot 2')?.selectedCraftingSystemName).toBe('');
    expect(component.craftingRows.map(row => row.craft.name)).toEqual(['Augment Slot 1']);
  });
});

function makeItemWithAugmentSlots() {
  const item = new Item(null);
  item.name = 'Essence Crafting Armor';
  item.slot = 'Armor';
  item.ml = 36;
  item.crafting = [
    makeAugmentSlot('Augment Slot 1', ['Colorless Augment Slot', 'Blue Augment Slot']),
    makeAugmentSlot('Augment Slot 2', ['Colorless Augment Slot']),
  ];
  return item;
}

function makeAugmentSlot(name: string, systemNames: string[]) {
  const craftable = new Craftable(name, [], false);
  const optionsByCraftingSystem = new Map<string, CraftableOption[]>();
  for (const systemName of systemNames) {
    optionsByCraftingSystem.set(systemName, [new CraftableOption({ name: systemName + ' Test' })]);
  }
  craftable.setCraftingSystemOptions(optionsByCraftingSystem);
  return craftable;
}
