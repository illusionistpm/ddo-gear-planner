import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { FiltersService } from '../filters.service';
import { GearDbService } from '../gear-db.service';
import { ItemSuggestionsComponent } from './item-suggestions.component';

describe('ItemSuggestionsComponent', () => {
  let component: ItemSuggestionsComponent;
  let fixture: ComponentFixture<ItemSuggestionsComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [ AppModule ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ItemSuggestionsComponent);
    component = fixture.componentInstance;
    component.slot = 'Trinket';
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('does not select items excluded by item type filters', () => {
    const filters = TestBed.inject(FiltersService);
    const gearDB = TestBed.inject(GearDbService);
    const hiddenItem = gearDB.getGearBySlot('Weapon').find(item => item.type === 'War Hammers');

    expect(hiddenItem).toBeTruthy();

    component.slot = 'Weapon';
    filters.setHiddenTypes(new Set(['War Hammers']));
    component.ngOnInit();

    component.onChange('Weapon')(hiddenItem?.name);

    expect(component.filteredGear.some(item => item.name === hiddenItem?.name)).toBeFalse();
    expect(component.gear).toEqual([]);
  });
});
