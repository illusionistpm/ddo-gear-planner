import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SuggestionDrawerComponent } from './suggestion-drawer.component';
import { SuggestionDrawerService } from './suggestion-drawer.service';

function pressEscape() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
}

describe('SuggestionDrawerComponent', () => {
  let fixture: ComponentFixture<SuggestionDrawerComponent>;
  let drawer: SuggestionDrawerService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [SuggestionDrawerComponent],
      // The drawer's content components aren't under test here.
      schemas: [CUSTOM_ELEMENTS_SCHEMA]
    });
    drawer = TestBed.inject(SuggestionDrawerService);
    fixture = TestBed.createComponent(SuggestionDrawerComponent);
    fixture.detectChanges();
  });

  const drawerElement = () => fixture.nativeElement.querySelector('aside.suggestion-drawer');

  it('closes on Escape, including after drilling into another view', () => {
    drawer.openSlot('Head');
    drawer.openSet('Some Set');
    fixture.detectChanges();
    expect(drawerElement()).not.toBeNull();

    pressEscape();
    fixture.detectChanges();

    expect(drawerElement()).toBeNull();
    expect(drawer.canGoBack).toBe(false);
  });

  it('handles Escape again after being reopened', () => {
    drawer.openSlot('Head');
    pressEscape();
    drawer.openSlot('Neck');
    fixture.detectChanges();

    pressEscape();
    fixture.detectChanges();

    expect(drawerElement()).toBeNull();
  });

  it('leaves Escape alone while closed', () => {
    drawer.openSlot('Head');
    drawer.close();
    const nextSpy = vi.spyOn(drawer, 'close');

    pressEscape();

    expect(nextSpy).not.toHaveBeenCalled();
  });
});
