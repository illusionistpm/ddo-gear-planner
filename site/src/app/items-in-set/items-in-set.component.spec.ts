import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { ItemsInSetComponent } from './items-in-set.component';
import { Affix } from '../affixes/affix';
import { Item } from '../gear/item';
import { SuggestionDrawerService } from '../suggestion-drawer/suggestion-drawer.service';

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

    expect(component.affixUi.getClassForSetAffix(affix, false)).toBe('DisabledSetBonus');
    expect(component.affixUi.getClassForSetAffix(affix, true)).not.toBe('DisabledSetBonus');
  });

  it('explains a locked tier with the shared set-bonus wording', () => {
    component.setName = 'Some Set';
    component.equippedPieces = 1;

    expect(component.getSetBonusTooltip({ threshold: 3, eligible: false, affixes: [] }))
      .toBe('Needs 3 set items (currently have 1)');
    expect(component.getSetBonusTooltip({ threshold: 3, eligible: true, affixes: [] }))
      .toBe('Active — 3 of Some Set equipped');
  });
});

// Drives the item-preview carousel through the rendered DOM, so these tests
// pin behaviour independent of how the preview is implemented.
describe('ItemsInSetComponent item preview', () => {
  let component: ItemsInSetComponent;
  let fixture: ComponentFixture<ItemsInSetComponent>;
  let el: HTMLElement;

  function makeItem(name: string, slot: string): Item {
    return new Item({
      name,
      slot,
      type: 'Test',
      ml: 1,
      affixes: [],
      sets: ['Some Set'],
      url: '/page/' + name.replace(/ /g, '_'),
      crafting: [],
      quests: [],
      artifact: false,
    });
  }

  // _sortBySlot orders these Alpha (Belt), Beta (Boots), Gamma (Neck).
  function render(items: Item[] = [makeItem('Gamma', 'Neck'), makeItem('Alpha', 'Belt'), makeItem('Beta', 'Boots')]) {
    component.setName = 'Some Set';
    spyOn(component.gearDB, 'findGearInSet').and.returnValue(items);
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
    fixture = TestBed.createComponent(ItemsInSetComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
  });

  it('opens on the clicked row and highlights it', () => {
    render();
    expect(panel()).toBeNull();

    click(rowLinks()[1]);

    expect(panelTitle()).toBe('Beta');
    expect(selectedRows().length).toBe(1);
    expect(selectedRows()[0].textContent).toContain('Beta');
  });

  it('steps through the list and clamps at both ends', () => {
    render();

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

  it('carries the carousel across every row, with no cap', () => {
    const items = Array.from({ length: 101 }, (_, i) => makeItem('Item ' + String(i).padStart(3, '0'), 'Slot' + String(i).padStart(3, '0')));
    render(items);
    expect(rowLinks().length).toBe(101);

    click(rowLinks()[99]);
    expect(button('Next item').disabled).toBeFalse();
    click(button('Next item'));
    expect(panelTitle()).toBe('Item 100');
  });

  it('equips the previewed item and closes the drawer', () => {
    render();
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
    render();
    const set = spyOn(component.equipped, 'set');

    click(rowLinks()[0]);
    click(button('Close item preview'));

    expect(panel()).toBeNull();
    expect(selectedRows().length).toBe(0);
    expect(set).not.toHaveBeenCalled();
  });
});
