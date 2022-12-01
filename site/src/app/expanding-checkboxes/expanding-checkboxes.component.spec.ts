import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExpandingCheckboxesComponent } from './expanding-checkboxes.component';

describe('ExpandingCheckboxesComponent', () => {
  let component: ExpandingCheckboxesComponent;
  let fixture: ComponentFixture<ExpandingCheckboxesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ExpandingCheckboxesComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ExpandingCheckboxesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
