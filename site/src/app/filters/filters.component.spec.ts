import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { FiltersComponent } from './filters.component';
import { FiltersService } from '../filters.service';

describe('FiltersComponent', () => {
  let component: FiltersComponent;
  let fixture: ComponentFixture<FiltersComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [ AppModule ]
    })
    .compileComponents();
  }));

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
    expect(component.packOptions.every(option => option.value)).toBeTrue();
  });

  it('shows free quests first when items without packs are present', () => {
    expect(component.packOptions[0].name).toBe('Free Quests');
  });

  it('starts with the inline pack filter section collapsed', () => {
    expect(component.showPackFilters).toBeFalse();
  });

  it('toggles the inline pack filter section', () => {
    component.togglePackFilters();

    expect(component.showPackFilters).toBeTrue();
  });

  it('toggles all pack options together', () => {
    component.toggleAllPacks();

    expect(component.packOptions.every(option => !option.value)).toBeTrue();
  });

  it('stores unchecked pack options as hidden packs', () => {
    const firstPack = component.packOptions[0];
    firstPack.value = false;

    component.onChangePacks(component.packOptions, 'subgroup');

    component.filters.getItemFilters().subscribe(filters => {
      expect(filters.hiddenPacks.has(firstPack.name === 'Free Quests' ? FiltersService.NO_PACK_FILTER : firstPack.name)).toBeTrue();
    });
  });
});
