import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FilterItemTypeComponent } from './filter-item-type.component';

describe('FilterItemTypeComponent', () => {
  let component: FilterItemTypeComponent;
  let fixture: ComponentFixture<FilterItemTypeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ FilterItemTypeComponent ]
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
});
