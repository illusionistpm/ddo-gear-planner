import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';

import { ItemsWithBonusTypeComponent } from './items-with-bonus-type.component';
import { Item } from '../item';
import { Craftable } from '../craftable';
import { CraftableOption } from '../craftable-option';
import { AppModule } from '../app.module';
import { SuggestionDrawerService } from '../suggestion-drawer/suggestion-drawer.service';

describe('ItemsWithBonusTypeComponent', () => {
  let component: ItemsWithBonusTypeComponent;
  let fixture: ComponentFixture<ItemsWithBonusTypeComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ ItemsWithBonusTypeComponent ],
      imports: [ FormsModule ]
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
    ]);
    filledTier.selected = filledTier.options[1];
    const openTier = new Craftable('T2 (Equipment)', [
      new CraftableOption({ affixes: [{ name: 'Disable Device', type: 'Insight', value: 7 }] }),
    ]);

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

// Drives the item-preview carousel through the rendered DOM, so these tests
// pin behaviour independent of how the preview is implemented.
describe('ItemsWithBonusTypeComponent item preview', () => {
  let component: ItemsWithBonusTypeComponent;
  let fixture: ComponentFixture<ItemsWithBonusTypeComponent>;
  let el: HTMLElement;

  function makeItem(name: string, slot: string, value: number): Item {
    return new Item({
      name,
      slot,
      type: 'Test',
      ml: 1,
      affixes: [{ name: 'Kinetic Lore', type: 'Artifact', value }],
      sets: [],
      url: '/page/' + name.replace(/ /g, '_'),
      crafting: [],
      quests: [],
      artifact: false,
    });
  }

  function render(items: Item[]) {
    component.affixName = 'Kinetic Lore';
    component.bonusType = 'Artifact';
    spyOn(component.gearDB, 'findGearWithAffixAndType').and.returnValue(items);
    spyOn(component.gearDB, 'findAugmentsWithAffixAndType').and.returnValue([]);
    spyOn(component.gearDB, 'findSetsWithAffixAndType').and.returnValue([]);
    spyOn(component.equipped, 'getCompatibleGear').and.callFake(gear => gear);
    spyOn(component.equipped, 'getUnlockedSlots').and.returnValue(new Set(items.map(item => item.slot)));
    fixture.detectChanges();
  }

  const rowLinks = () => Array.from(el.querySelectorAll<HTMLElement>('.item-preview-link'));
  const panel = () => el.querySelector<HTMLElement>('.item-preview-panel');
  const panelTitle = () => panel()?.querySelector('h3')?.textContent?.trim();
  const button = (label: string) => el.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
  const selectedRows = () => Array.from(el.querySelectorAll('.selected-preview-row'));

  function click(target: HTMLElement) {
    target.click();
    fixture.detectChanges();
  }

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({ imports: [AppModule] }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ItemsWithBonusTypeComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
  });

  it('opens on the clicked row and highlights it', () => {
    render([makeItem('Alpha', 'Neck', 3), makeItem('Beta', 'Belt', 2), makeItem('Gamma', 'Boots', 1)]);
    expect(panel()).toBeNull();

    click(rowLinks()[1]);

    expect(panelTitle()).toBe('Beta');
    expect(selectedRows().length).toBe(1);
    expect(selectedRows()[0].textContent).toContain('Beta');
  });

  it('steps through the rendered list and clamps at both ends', () => {
    render([makeItem('Alpha', 'Neck', 3), makeItem('Beta', 'Belt', 2), makeItem('Gamma', 'Boots', 1)]);

    click(rowLinks()[0]);
    expect(button('Previous item').disabled).toBeTrue();
    expect(button('Next item').disabled).toBeFalse();

    click(button('Next item'));
    expect(panelTitle()).toBe('Beta');
    click(button('Next item'));
    expect(panelTitle()).toBe('Gamma');
    expect(button('Next item').disabled).toBeTrue();

    click(button('Next item'));
    expect(panelTitle()).toBe('Gamma');

    click(button('Previous item'));
    expect(panelTitle()).toBe('Beta');
    expect(selectedRows()[0].textContent).toContain('Beta');
  });

  it('only carries the carousel across the 100 rows it renders', () => {
    const items = Array.from({ length: 101 }, (_, i) => makeItem('Item ' + (101 - i), 'Neck', 101 - i));
    render(items);
    expect(rowLinks().length).toBe(100);

    click(rowLinks()[99]);

    expect(panelTitle()).toBe('Item 2');
    expect(button('Next item').disabled).toBeTrue();
  });

  it('equips the previewed item and closes the drawer', () => {
    render([makeItem('Alpha', 'Neck', 3), makeItem('Beta', 'Belt', 2)]);
    const set = spyOn(component.equipped, 'set');
    const close = spyOn(TestBed.inject(SuggestionDrawerService), 'close');

    click(rowLinks()[0]);
    click(button('Next item'));
    click(el.querySelector<HTMLElement>('.preview-equip-button')!);

    expect(set).toHaveBeenCalledTimes(1);
    expect(set.calls.mostRecent().args[0].name).toBe('Beta');
    expect(close).toHaveBeenCalled();
  });

  it('closes without equipping and clears the row highlight', () => {
    render([makeItem('Alpha', 'Neck', 3)]);
    const set = spyOn(component.equipped, 'set');

    click(rowLinks()[0]);
    click(button('Close item preview'));

    expect(panel()).toBeNull();
    expect(selectedRows().length).toBe(0);
    expect(set).not.toHaveBeenCalled();
  });
});
