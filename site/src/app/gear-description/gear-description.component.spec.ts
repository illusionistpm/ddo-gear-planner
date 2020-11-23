import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { GearDescriptionComponent } from './gear-description.component';

describe('GearDescriptionComponent', () => {
  let component: GearDescriptionComponent;
  let fixture: ComponentFixture<GearDescriptionComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ GearDescriptionComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(GearDescriptionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
