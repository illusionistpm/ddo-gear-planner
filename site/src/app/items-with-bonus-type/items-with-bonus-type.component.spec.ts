import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { ItemsWithBonusTypeComponent } from './items-with-bonus-type.component';

describe('ItemsWithBonusTypeComponent', () => {
  let component: ItemsWithBonusTypeComponent;
  let fixture: ComponentFixture<ItemsWithBonusTypeComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ ItemsWithBonusTypeComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ItemsWithBonusTypeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
