import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { FiltersComponent } from './filters.component';
import { FiltersService } from '../planner/filters.service';

describe('FiltersComponent', () => {
  let component: FiltersComponent;
  let fixture: ComponentFixture<FiltersComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppModule]
    })
      .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(FiltersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('starts with all pack options checked', () => {
    expect(component.packOptions.length).toBeGreaterThan(0);
    expect(component.packOptions.every(option => option.value)).toBe(true);
  });

  it('lists free quests, the DDO Store and events first, then packs alphabetically', () => {
    const names = component.packOptions.map(option => option.name);

    expect(names.slice(0, 3)).toEqual(['Free Quests', 'DDO Store', 'Events']);
    const packs = names.slice(3);
    expect(packs).toEqual([...packs].sort((left, right) => left.localeCompare(right)));
  });

  it('starts with the inline pack filter section collapsed', () => {
    expect(component.showPackFilters).toBe(false);
  });

  it('toggles the inline pack filter section', () => {
    component.togglePackFilters();

    expect(component.showPackFilters).toBe(true);
  });

  it('toggles all pack options together', () => {
    component.toggleAllPacks();

    expect(component.packOptions.every(option => !option.value)).toBe(true);
  });

  it('stores unchecked pack options as hidden packs', () => {
    const firstPack = component.packOptions[0];
    firstPack.value = false;

    component.onChangePacks(component.packOptions, 'subgroup');

    component.filters.getItemFilters().subscribe(filters => {
      expect(filters.hiddenPacks.has(firstPack.name === 'Free Quests' ? FiltersService.NO_PACK_FILTER : firstPack.name)).toBe(true);
    });
  });
});
