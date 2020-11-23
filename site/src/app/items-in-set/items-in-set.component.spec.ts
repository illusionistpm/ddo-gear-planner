import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { ItemsInSetComponent } from './items-in-set.component';

describe('ItemsInSetComponent', () => {
  let component: ItemsInSetComponent;
  let fixture: ComponentFixture<ItemsInSetComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ ItemsInSetComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ItemsInSetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
