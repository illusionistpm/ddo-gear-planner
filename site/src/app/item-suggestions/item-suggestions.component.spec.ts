import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { ItemSuggestionsComponent } from './item-suggestions.component';

describe('ItemSuggestionsComponent', () => {
  let component: ItemSuggestionsComponent;
  let fixture: ComponentFixture<ItemSuggestionsComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [ AppModule ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ItemSuggestionsComponent);
    component = fixture.componentInstance;
    component.slot = 'Trinket';
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
