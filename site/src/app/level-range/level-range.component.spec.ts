import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { LevelRangeComponent } from './level-range.component';

describe('LevelRangeComponent', () => {
  let component: LevelRangeComponent;
  let fixture: ComponentFixture<LevelRangeComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ LevelRangeComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(LevelRangeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
