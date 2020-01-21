import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ItemSuggestionsComponent } from './item-suggestions.component';

describe('ItemSuggestionsComponent', () => {
  let component: ItemSuggestionsComponent;
  let fixture: ComponentFixture<ItemSuggestionsComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ItemSuggestionsComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ItemSuggestionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
