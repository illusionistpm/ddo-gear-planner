import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { EffectsTableComponent } from './effects-table.component';

describe('EffectsTableComponent', () => {
  let component: EffectsTableComponent;
  let fixture: ComponentFixture<EffectsTableComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ EffectsTableComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(EffectsTableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
