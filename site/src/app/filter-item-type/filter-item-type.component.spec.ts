import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { FilterItemTypeComponent } from './filter-item-type.component';

describe('FilterItemTypeComponent', () => {
  let component: FilterItemTypeComponent;
  let fixture: ComponentFixture<FilterItemTypeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ AppModule ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(FilterItemTypeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('tracks only the hidden types in a group when filters update', () => {
    component.filters.setHiddenTypes(new Set(['War Hammers']));

    expect(component.hiddenTypesMap.get('one-handed melee')).toEqual(['War Hammers']);
  });

  it('clears hidden type state for groups with no hidden entries', () => {
    component.filters.setHiddenTypes(new Set(['War Hammers']));
    component.filters.setHiddenTypes(new Set());

    const options = component.getTypesWithAttribute(['one-handed', 'melee'])?.getValue() || [];

    expect(component.hiddenTypesMap.get('one-handed melee')).toEqual([]);
    expect(options.find(option => option.name === 'War Hammers')?.value).toBeFalse();
  });

  it('shows all one-handed melee options even when one type is hidden', () => {
    component.filters.setHiddenTypes(new Set(['War Hammers']));

    const options = component.getTypesWithAttribute(['one-handed', 'melee'])?.getValue() || [];

    expect(options.length).toBeGreaterThan(1);
    expect(options.map(option => option.name)).toContain('Long Swords');
    expect(options.map(option => option.name)).toContain('War Hammers');
  });
});
