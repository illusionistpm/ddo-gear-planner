import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ItemsInSetComponent } from './items-in-set.component';

describe('ItemsInSetComponent', () => {
  let component: ItemsInSetComponent;
  let fixture: ComponentFixture<ItemsInSetComponent>;

  beforeEach(async(() => {
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
