import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { FiltersService } from '../planner/filters.service';
import { GearDbService } from '../gear/gear-db.service';
import { ItemSuggestionsComponent } from './item-suggestions.component';
import { EquippedService } from '../planner/equipped.service';
import { UndoService } from '../undo/undo.service';

describe('ItemSuggestionsComponent', () => {
  let component: ItemSuggestionsComponent;
  let fixture: ComponentFixture<ItemSuggestionsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppModule]
    })
      .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ItemSuggestionsComponent);
    component = fixture.componentInstance;
    component.slot = 'Trinket';
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('puts keyboard focus in the name search when it opens', () => {
    const search = (fixture.nativeElement as HTMLElement).querySelector('input[placeholder="Enter an item name"]');
    expect(search).not.toBeNull();
    expect(document.activeElement).toBe(search);
  });

  it('does not select items excluded by item type filters', () => {
    const filters = TestBed.inject(FiltersService);
    const gearDB = TestBed.inject(GearDbService);
    const hiddenItem = gearDB.getGearBySlot('Weapon').find(item => item.type === 'War Hammers');

    expect(hiddenItem).toBeTruthy();

    component.slot = 'Weapon';
    filters.setHiddenTypes(new Set(['War Hammers']));
    component.ngOnInit();

    component.onChange('Weapon')(hiddenItem!.name);

    expect(component.filteredGear.some(item => item.name === hiddenItem?.name)).toBe(false);
    expect(component.gear).toEqual([]);
  });

  it('filters the displayed items by the search query', () => {
    const gearDB = TestBed.inject(GearDbService);
    const item = gearDB.getGearBySlot('Trinket').find(gear => !gear.isGeneratedEssenceCraftingBlank());

    expect(item).toBeTruthy();

    component.searchQuery = item?.name || '';
    component.onSearchQueryChanged();

    expect(component.gear.length).toBeGreaterThan(0);
    expect(component.gear.every(gear => gear.name.toLowerCase().includes(component.searchQuery.toLowerCase()))).toBe(true);
    expect(component.gear.some(gear => gear.name === item?.name)).toBe(true);
  });

  it('returns to suggested items when the search query is cleared', () => {
    const suggestedItems = component.gear;

    component.searchQuery = 'zzzz-no-real-item';
    component.onSearchQueryChanged();
    expect(component.gear).toEqual([]);

    component.searchQuery = '';
    component.onSearchQueryChanged();

    expect(component.gear).toEqual(suggestedItems);
  });

  describe('as rendered', () => {
    const element = () => fixture.nativeElement as HTMLElement;
    const equipButtons = () => Array.from(element().querySelectorAll<HTMLButtonElement>('.suggestion-equip-button'));

    function search(text: string) {
      const input = element().querySelector<HTMLInputElement>('#slotItemSearch')!;
      input.value = text;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }

    it('says so when a search matches nothing, rather than showing a blank list', () => {
      search('zzzz-no-real-item');

      expect(equipButtons()).toEqual([]);
      expect(element().querySelector('.slot-suggestions-empty')?.textContent).toContain('No Trinket items match "zzzz-no-real-item"');
    });

    it('says how many matches the filters are hiding', () => {
      const gearDB = TestBed.inject(GearDbService);
      const hidden = gearDB.getGearBySlot('Weapon').find(item => item.type === 'War Hammers')!;
      TestBed.inject(FiltersService).setHiddenTypes(new Set(['War Hammers']));
      component.slot = 'Weapon';
      component.ngOnInit();
      fixture.detectChanges();

      search(hidden.name);

      expect(element().querySelector('.slot-suggestions-hidden')?.textContent).toContain('hidden by your filters');
    });

    it('lists the items the filters hide only on request, and equips one from there', () => {
      const gearDB = TestBed.inject(GearDbService);
      const hammers = gearDB.getGearBySlot('Weapon').filter(item => item.type === 'War Hammers');
      TestBed.inject(FiltersService).setHiddenTypes(new Set(['War Hammers']));
      component.slot = 'Weapon';
      component.ngOnInit();
      fixture.detectChanges();

      const reveal = element().querySelector<HTMLButtonElement>('.slot-suggestions-show-hidden')!;
      expect(reveal.textContent).toContain(`Show ${hammers.length} items hidden by your filters`);
      expect(element().querySelector('.slot-suggestions-hidden-section')).toBeNull();

      reveal.click();
      fixture.detectChanges();

      const section = element().querySelector<HTMLElement>('.slot-suggestions-hidden-section')!;
      expect(element().querySelector('.slot-suggestions-show-hidden')).toBeNull();
      const rows = Array.from(section.querySelectorAll<HTMLElement>('[data-drawer-row]'));
      expect(rows.length).toBe(Math.min(20, hammers.length));
      const names = rows.map(row => row.querySelector('.col')!.textContent!.trim());
      expect(names.every(name => hammers.some(hammer => hammer.name === name))).toBe(true);

      rows[0].querySelector<HTMLButtonElement>('.suggestion-equip-button')!.click();
      let equipped: string | undefined;
      TestBed.inject(EquippedService).getSlot('Weapon')!.subscribe(item => equipped = item?.name);
      expect(equipped).toBe(names[0]);
    });

    it('offers no hidden items when the filters hide nothing', () => {
      expect(element().querySelector('.slot-suggestions-show-hidden')).toBeNull();
    });

    it('shows the first items and adds more on request', () => {
      const first = equipButtons().length;
      const more = element().querySelector<HTMLButtonElement>('.slot-suggestions-more');
      expect(first).toBe(20);
      expect(more?.textContent).toContain('Show 20 more');

      more!.click();
      fixture.detectChanges();

      expect(equipButtons().length).toBe(40);
    });

    it('marks the equipped item, and clears the slot with an Undo on offer', () => {
      const equipped = TestBed.inject(EquippedService);
      expect(element().querySelector('.slot-current')).toBeNull();

      const item = component.gear[0];
      equipped.set(item);
      fixture.detectChanges();

      expect(element().querySelector('.slot-current-name')?.textContent).toBe(item.name);
      expect(equipButtons()[0].disabled).toBe(true);
      expect(equipButtons()[0].textContent).toContain('Equipped');

      let message: string | undefined;
      TestBed.inject(UndoService).offer$.subscribe(offer => message = offer?.message);
      element().querySelector<HTMLButtonElement>('.slot-current-clear')!.click();

      expect(equipped.hasItem('Trinket')).toBe(false);
      expect(message).toContain(item.name);
    });
  });
});
