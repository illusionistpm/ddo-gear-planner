import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { ItemsInSetComponent } from './items-in-set.component';
import { Affix } from '../affixes/affix';
import { Item } from '../gear/item';
import { SuggestionDrawerService } from '../suggestion-drawer/suggestion-drawer.service';

describe('ItemsInSetComponent', () => {
  let component: ItemsInSetComponent;
  let fixture: ComponentFixture<ItemsInSetComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppModule]
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ItemsInSetComponent);
    component = fixture.componentInstance;
  });

  it('loads the set bonus tiers for the set before the item list', () => {
    vi.spyOn(component.gearDB, 'getSetBonusThresholdDetails').mockReturnValue([
      { threshold: 3, eligible: false, affixes: [new Affix({ name: 'Dodge', type: 'Quality', value: '3' })] },
    ]);
    vi.spyOn(component.gearDB, 'findGearInSet').mockReturnValue([]);

    component.setName = 'Some Set';
    component.ngOnInit();

    expect(component.setBonusTiers.length).toBe(1);
    expect(component.gearDB.getSetBonusThresholdDetails).toHaveBeenCalledWith('Some Set', component.equippedPieces);
  });

  it('lists set items for an already-filled slot apart from the ones that could be equipped', () => {
    const makeItem = (name: string, slot: string) => new Item({
      name, slot, type: 'Test', ml: 1, affixes: [], sets: ['Some Set'],
      url: '/page/' + name.replace(/ /g, '_'), crafting: [], quests: [], artifact: false,
    });
    component.equipped.set(makeItem('Worn Boots', 'Boots'));
    vi.spyOn(component.gearDB, 'findGearInSet')
      .mockReturnValue([makeItem('Other Boots', 'Boots'), makeItem('Some Gloves', 'Gloves')]);

    component.setName = 'Some Set';
    component.ngOnInit();

    expect(component.matches.map(item => item.name)).toEqual(['Some Gloves']);
    expect(component.lockedMatches.map(item => item.name)).toEqual(['Other Boots']);
  });

  it('lists a set Minor Artifact under the equipment exclusions once another one is worn', () => {
    const makeArtifact = (name: string, slot: string) => new Item({
      name, slot, type: 'Test', ml: 30, affixes: [], sets: ['Some Set'],
      url: '/page/' + name.replace(/ /g, '_'), crafting: [], quests: [], artifact: true,
    });
    component.equipped.set(makeArtifact('Artifact Ring', 'Ring1'));
    vi.spyOn(component.gearDB, 'findGearInSet').mockReturnValue([makeArtifact('Artifact Boots', 'Boots')]);

    component.setName = 'Some Set';
    component.ngOnInit();

    expect(component.matches).toEqual([]);
    expect(component.lockedMatches.map(item => item.name)).toEqual(['Artifact Boots']);
    expect(component.artifactLimited.size).toBe(1);
  });

  it('dims the tiers not yet reached, and explains each with the shared set-bonus wording', () => {
    vi.spyOn(component.gearDB, 'getSetBonusThresholdDetails').mockReturnValue([
      { threshold: 1, eligible: true, affixes: [new Affix({ name: 'Dodge', type: 'Quality', value: '1' })] },
      { threshold: 3, eligible: false, affixes: [new Affix({ name: 'Dodge', type: 'Quality', value: '3' })] },
    ]);
    vi.spyOn(component.gearDB, 'findGearInSet').mockReturnValue([]);
    vi.spyOn(component.equipped, 'getActiveSets').mockReturnValue(new Map([['Some Set', 1]]));
    component.setName = 'Some Set';
    fixture.detectChanges();

    const rows = [...fixture.nativeElement.querySelectorAll('.set-bonus-summary-row')] as HTMLElement[];
    expect(rows.map(row => row.title)).toEqual(['Active — 1 of Some Set equipped', 'Needs 3 set items (currently have 1)']);
    expect(rows.map(row => row.classList.contains('disabled-set-tier'))).toEqual([false, true]);
    expect(rows[1].querySelector('.set-bonus-summary-value')!.classList).toContain('DisabledSetBonus');
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
    vi.spyOn(component.gearDB, 'findGearInSet').mockReturnValue(items);
    vi.spyOn(component.equipped, 'getCompatibleGear').mockImplementation(gear => gear);
    vi.spyOn(component.equipped, 'getUnlockedSlots').mockReturnValue(new Set(items.map(item => item.slot)));
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

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AppModule] }).compileComponents();
  });

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
    expect(button('Previous item').disabled).toBe(true);
    expect(button('Next item').disabled).toBe(false);

    click(button('Next item'));
    expect(panelTitle()).toBe('Beta');
    click(button('Next item'));
    expect(panelTitle()).toBe('Gamma');
    expect(button('Next item').disabled).toBe(true);

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
    expect(button('Next item').disabled).toBe(false);
    click(button('Next item'));
    expect(panelTitle()).toBe('Item 100');
  });

  it('equips the previewed item and closes the drawer', () => {
    render();
    const set = vi.spyOn(component.equipped, 'set').mockReturnValue(undefined);
    const close = vi.spyOn(TestBed.inject(SuggestionDrawerService), 'close').mockReturnValue(undefined);

    click(rowLinks()[0]);
    click(button('Next item'));
    click(el.querySelector<HTMLElement>('.preview-equip-button')!);

    expect(set).toHaveBeenCalledTimes(1);
    expect(vi.mocked(set).mock.lastCall![0].name).toBe('Beta');
    expect(close).toHaveBeenCalled();
  });

  it('closes without equipping and clears the row highlight', () => {
    render();
    const set = vi.spyOn(component.equipped, 'set').mockReturnValue(undefined);

    click(rowLinks()[0]);
    click(button('Close item preview'));

    expect(panel()).toBeNull();
    expect(selectedRows().length).toBe(0);
    expect(set).not.toHaveBeenCalled();
  });
});
