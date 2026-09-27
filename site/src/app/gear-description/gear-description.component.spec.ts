import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

import { GearDescriptionComponent } from './gear-description.component';
import { Craftable } from '../gear/craftable';
import { CraftableOption } from '../gear/craftable-option';
import { Item } from '../gear/item';
import { Affix } from '../affixes/affix';
import { EquippedService } from '../planner/equipped.service';
import { FiltersService } from '../planner/filters.service';
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

  describe('crafting options with minimum levels', () => {
    let filters: FiltersService;

    beforeEach(() => {
      filters = TestBed.inject(FiltersService);
      filters.setLevelRange(15, 20);
    });

    function showItem(item: Item) {
      fixture.componentRef.setInput('item', item);
      fixture.detectChanges();
    }

    /** The option names the item's crafting select offers, once focused as a user would. */
    function offeredOptions(): string[] {
      const select = Array.from(fixture.nativeElement.querySelectorAll('select') as NodeListOf<HTMLSelectElement>)
        .find(element => element.closest('.row')?.textContent?.includes('Colorless Augment Slot'));
      expect(select).toBeTruthy();
      select!.dispatchEvent(new Event('focus'));
      fixture.detectChanges();
      return Array.from(select!.options).map(option => option.textContent!.trim()).filter(Boolean);
    }

    it('offers options up to the maximum level, however far below the minimum', () => {
      showItem(makeItemWithLeveledOptions());

      expect(offeredOptions()).toEqual(['Low Augment', 'Mid Augment']);
    });

    it('still offers the chosen option when it is above the maximum level', () => {
      const item = makeItemWithLeveledOptions();
      const craft = item.crafting[0];
      craft.selected = craft.options.find(option => option.name === 'High Augment')!;
      showItem(item);

      expect(offeredOptions()).toEqual(['Low Augment', 'Mid Augment', 'High Augment']);
    });

    it('lists options up to the maximum level in the picker, however far below the minimum', async () => {
      showItem(makeItemWithLongCraftingList());
      (fixture.nativeElement.querySelector('.crafting-picker-toggle') as HTMLButtonElement).click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const familyNames = Array.from(document.body.querySelectorAll('.crafting-picker-family'))
        .map(button => button.textContent ?? '');
      expect(familyNames.some(name => name.includes('Quickblade set'))).toBe(false);

      Array.from(document.body.querySelectorAll<HTMLButtonElement>('.crafting-picker-family'))
        .find(button => button.querySelector('.crafting-picker-family-name')?.textContent?.trim() === 'Charisma')!
        .click();
      fixture.detectChanges();
      const tierLabels = Array.from(document.body.querySelectorAll('.crafting-picker-tier .crafting-picker-entry-label'))
        .map(label => label.textContent?.trim());
      expect(tierLabels).toEqual(['+1 (ML 1)', '+3 (ML 5)', '+5 (ML 9)', '+7 (ML 13)', '+9 (ML 17)']);
    });

    it('offers the options again when the maximum level is raised', () => {
      showItem(makeItemWithLeveledOptions());
      expect(offeredOptions()).toEqual(['Low Augment', 'Mid Augment']);

      filters.setLevelRange(15, 30);
      fixture.detectChanges();

      expect(offeredOptions()).toEqual(['Low Augment', 'Mid Augment', 'High Augment']);
    });
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

  describe('rank colours on an equipped item', () => {
    let equipped: EquippedService;

    beforeEach(() => {
      equipped = TestBed.inject(EquippedService);
      equipped.addImportantAffix('Strength');
    });

    function showEquipped(item: Item) {
      equipped.set(item);
      fixture.componentRef.setInput('item', item);
      fixture.detectChanges();
    }

    it('shows the unique best value as Best', () => {
      equipped.set(makeGear('Weak Belt', 'Belt', 3));
      showEquipped(makeGear('Strong Gloves', 'Gloves', 5));

      expect(affixRowClasses(fixture)).toContain('Best');
    });

    it('shows a value tied with another slot as BestTied', () => {
      equipped.set(makeGear('Tied Belt', 'Belt', 5));
      showEquipped(makeGear('Strong Gloves', 'Gloves', 5));

      expect(affixRowClasses(fixture)).toContain('BestTied');
    });

    it('shows a value beaten by another slot as Outranked', () => {
      equipped.set(makeGear('Strong Belt', 'Belt', 7));
      showEquipped(makeGear('Weak Gloves', 'Gloves', 5));

      expect(affixRowClasses(fixture)).toContain('Outranked');
    });

    it('colours the selected crafting option like the rest of the item', async () => {
      const item = makeItemWithLongCraftingList();
      item.slot = 'Ring1';
      item.crafting[0].options.push(new CraftableOption({ name: 'Diamond of Strength +5', ml: 1, affixes: [{ name: 'Strength', type: 'Enhancement', value: 5 }] }));
      item.crafting[0].selected = item.crafting[0].options[item.crafting[0].options.length - 1];
      showEquipped(item);

      expect(fixture.nativeElement.querySelector('.crafting-picker-toggle-label').classList).toContain('Best');
    });
  });

  // A preview is ranked as if it were equipped in its slot, replacing what is there now.
  describe('rank colours on a previewed item', () => {
    let equipped: EquippedService;

    beforeEach(() => {
      equipped = TestBed.inject(EquippedService);
      equipped.addImportantAffix('Strength');
    });

    function showPreview(item: Item) {
      fixture.componentRef.setInput('item', item);
      fixture.detectChanges();
    }

    function affixRowTooltip(): string {
      return (fixture.nativeElement.querySelector('.row.Outranked, .row.Best, .row.BestTied, .row.BetterThanBest') as HTMLElement).title;
    }

    it('shows a value another slot already provides as BestTied, since equipping it would tie', () => {
      equipped.set(makeGear('Belt', 'Belt', 5));
      showPreview(makeGear('Gloves', 'Gloves', 5));

      expect(affixRowClasses(fixture)).toContain('BestTied');
    });

    it('shows an upgrade over the build as BetterThanBest', () => {
      equipped.set(makeGear('Belt', 'Belt', 5));
      showPreview(makeGear('Gloves', 'Gloves', 7));

      expect(affixRowClasses(fixture)).toContain('BetterThanBest');
    });

    it('shows the same value as the item it replaces as Best', () => {
      equipped.set(makeGear('Old Gloves', 'Gloves', 5));
      showPreview(makeGear('New Gloves', 'Gloves', 5));

      expect(affixRowClasses(fixture)).toContain('Best');
    });

    it('shows a downgrade of the item it replaces as Outranked, naming what it would lose', () => {
      equipped.set(makeGear('Old Gloves', 'Gloves', 7));
      showPreview(makeGear('New Gloves', 'Gloves', 5));

      expect(affixRowClasses(fixture)).toContain('Outranked');
      expect(affixRowTooltip()).toBe('Lower than current +7 from Old Gloves (Gloves)');
    });

    it('shows a value beaten by another slot as Outranked', () => {
      equipped.set(makeGear('Belt', 'Belt', 7));
      showPreview(makeGear('Gloves', 'Gloves', 5));

      expect(affixRowClasses(fixture)).toContain('Outranked');
      expect(affixRowTooltip()).toBe('Overpowered by Belt (Belt)');
    });

    it('replaces only the ring slot the preview is for', () => {
      equipped.set(makeGear('Left Ring', 'Ring1', 5));
      showPreview(makeGear('New Ring', 'Ring2', 5));

      expect(affixRowClasses(fixture)).toContain('BestTied');
    });

    it('ranks crafting options as if chosen in place of the current one', async () => {
      equipped.set(makeGear('Belt', 'Belt', 5));
      const item = makeItemWithLongCraftingList();
      item.slot = 'Ring1';
      const strength = [5, 7].map(value => new CraftableOption({ name: `Diamond of Strength +${value}`, ml: 1, affixes: [{ name: 'Strength', type: 'Enhancement', value }] }));
      item.crafting[0].options.push(...strength);
      item.crafting[0].selected = strength[1];
      showPreview(item);

      (fixture.nativeElement.querySelector('.crafting-picker-toggle') as HTMLButtonElement).click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      // The selected +7 matches its row; the +5 would only tie the belt.
      expect(fixture.nativeElement.querySelector('.crafting-picker-toggle-label').classList).toContain('BetterThanBest');
      const tierClass = (label: string) => Array.from(document.body.querySelectorAll('.crafting-picker-tier .crafting-picker-entry-label'))
        .find(element => element.textContent?.trim().startsWith(label))?.classList;
      expect(tierClass('+7')).toContain('BetterThanBest');
      expect(tierClass('+5')).toContain('BestTied');
    });
  });
});

function makeGear(name: string, slot: string, strength: number) {
  const item = new Item(null);
  item.name = name;
  item.slot = slot;
  item.ml = 1;
  item.affixes = [new Affix({ name: 'Strength', type: 'Enhancement', value: strength })];
  item.crafting = [];
  return item;
}

function affixRowClasses(fixture: ComponentFixture<GearDescriptionComponent>): string[] {
  const row = Array.from(fixture.nativeElement.querySelectorAll('.row') as NodeListOf<HTMLElement>)
    .find(element => element.textContent?.includes('Strength') && element.textContent?.includes('Enhancement'));
  expect(row).toBeTruthy();
  return Array.from(row!.classList);
}

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

/** An item with a short list of augments, one below the level range, one inside it and one above it. */
function makeItemWithLeveledOptions() {
  const options = [
    new CraftableOption({ name: 'Low Augment', ml: 5, affixes: [{ name: 'Charisma', type: 'Enhancement', value: 1 }] }),
    new CraftableOption({ name: 'Mid Augment', ml: 20, affixes: [{ name: 'Charisma', type: 'Enhancement', value: 5 }] }),
    new CraftableOption({ name: 'High Augment', ml: 30, affixes: [{ name: 'Charisma', type: 'Enhancement', value: 9 }] }),
  ];
  const item = new Item(null);
  item.name = 'Test Ring';
  item.slot = 'Ring';
  item.ml = 18;
  item.crafting = [new Craftable('Colorless Augment Slot', options)];
  return item;
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
