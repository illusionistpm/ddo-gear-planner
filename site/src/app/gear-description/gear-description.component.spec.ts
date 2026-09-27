import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

import { GearDescriptionComponent } from './gear-description.component';
import { Craftable } from '../gear/craftable';
import { CraftableOption } from '../gear/craftable-option';
import { Item } from '../gear/item';
import { EquippedService } from '../planner/equipped.service';
import { TapTooltipComponent } from '../tap-tooltip/tap-tooltip.component';
import { CraftingOptionPickerComponent } from '../crafting-option-picker/crafting-option-picker.component';

describe('GearDescriptionComponent', () => {
  let component: GearDescriptionComponent;
  let fixture: ComponentFixture<GearDescriptionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ GearDescriptionComponent, TapTooltipComponent, CraftingOptionPickerComponent ],
      imports: [ FormsModule, NgbModule ]
    })
    .compileComponents();
  });

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
    expect(item.getCraftingByName('Augment Slot 2')?.craftingSystemOptions).toEqual(['Colorless Augment Slot']);
  });

  it('allows the primary color in augment slot 2 after selecting green in slot 1', () => {
    const item = makeItemWithAugmentSlots();
    item.getCraftingByName('Augment Slot 1')?.selectCraftingSystem('Green Augment Slot');
    component.curItem = item;

    component['refreshDisplayRows']();

    expect(item.getCraftingByName('Augment Slot 2')?.craftingSystemOptions).toEqual([
      'Colorless Augment Slot',
      'Blue Augment Slot',
    ]);
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

  describe('choosing an option from a long crafting list', () => {
    it('equips the item with the chosen option', async () => {
      const item = makeItemWithLongCraftingList();
      const equipped = TestBed.inject(EquippedService);
      const setSpy = vi.spyOn(equipped, 'set').mockReturnValue(undefined);

      fixture.componentRef.setInput('item', item);
      fixture.detectChanges();
      await chooseCraftingOption(fixture, 'Charisma', '+7 (ML 13)');

      const equippedItem = setSpy.mock.calls[setSpy.mock.calls.length - 1][0] as Item;
      expect(equippedItem.getCraftingByName('Colorless Augment Slot')?.selected.name).toBe('Diamond of Charisma +7');
      expect(fixture.nativeElement.querySelector('.crafting-picker-toggle').textContent.trim()).toBe('Diamond of Charisma +7');
    });

    it('shows how many pieces of its set a set augment would make', async () => {
      const item = makeItemWithLongCraftingList();
      TestBed.inject(EquippedService).addImportantAffix('Doublestrike');

      fixture.componentRef.setInput('item', item);
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.crafting-picker-toggle') as HTMLButtonElement).click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const quickblade = Array.from(document.body.querySelectorAll('.crafting-picker-family'))
        .find(button => button.textContent?.includes('Quickblade set'));
      // Nothing of the set is equipped, so this augment would be its first of three pieces.
      expect(quickblade?.querySelector('.crafting-picker-entry-note')?.textContent?.trim()).toBe('1 of 3 set pieces');
    });
  });
});

/** Picks an option in the item's only crafting row the way a user would: expand its family in the picker, pick the tier. */
async function chooseCraftingOption(fixture: ComponentFixture<GearDescriptionComponent>, familyLabel: string, tierLabel: string) {
  (fixture.nativeElement.querySelector('.crafting-picker-toggle') as HTMLButtonElement).click();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  const family = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.crafting-picker-family'))
    .find(button => button.querySelector('.crafting-picker-family-name')?.textContent?.trim() === familyLabel);
  expect(family).toBeTruthy();
  family!.click();
  fixture.detectChanges();

  const tier = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.crafting-picker-tier'))
    .find(button => button.querySelector('.crafting-picker-entry-label')?.textContent?.trim() === tierLabel);
  expect(tier).toBeTruthy();
  tier!.click();
  fixture.detectChanges();
}

/** An item with one augment slot offering more than a screenful of options, several of them tiers of one augment. */
function makeItemWithLongCraftingList() {
  const options = [
    ...[1, 3, 5, 7, 9, 11].map((value, i) =>
      new CraftableOption({ name: `Diamond of Charisma +${value}`, ml: 1 + i * 4, affixes: [{ name: 'Charisma', type: 'Enhancement', value }] })),
    ...[5, 10, 13, 15].map((value, i) =>
      new CraftableOption({ name: `Diamond of Bluff +${value}`, ml: 4 + i * 4, affixes: [{ name: 'Bluff', type: 'Competence', value }] })),
    ...['Acid', 'Cold', 'Fire', 'Electric', 'Sonic', 'Force', 'Light', 'Negative'].map(element =>
      new CraftableOption({ name: `Diamond of ${element} Absorption`, ml: 10, affixes: [{ name: `${element} Absorption`, type: 'Enhancement', value: 10 }] })),
    new CraftableOption({ name: 'Set Augment: Quickblade', ml: 30, set: 'Quickblade' }),
  ];
  const item = new Item(null);
  item.name = 'Test Ring';
  item.slot = 'Ring';
  item.ml = 30;
  item.crafting = [new Craftable('Colorless Augment Slot', options)];
  return item;
}

function makeItemWithAugmentSlots() {
  const item = new Item(null);
  item.name = 'Essence Crafting Armor';
  item.slot = 'Armor';
  item.ml = 36;
  item.crafting = [
    makeAugmentSlot('Augment Slot 1', ['Colorless Augment Slot', 'Blue Augment Slot', 'Green Augment Slot']),
    makeAugmentSlot('Augment Slot 2', ['Colorless Augment Slot', 'Blue Augment Slot']),
  ];
  return item;
}

function makeAugmentSlot(name: string, systemNames: string[]) {
  const craftable = new Craftable(name, []);
  const optionsByCraftingSystem = new Map<string, CraftableOption[]>();
  for (const systemName of systemNames) {
    optionsByCraftingSystem.set(systemName, [new CraftableOption({ name: systemName + ' Test' })]);
  }
  craftable.setCraftingSystemOptions(optionsByCraftingSystem);
  return craftable;
}
