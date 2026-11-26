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

  describe('keyboard navigation', () => {
    let aside: HTMLElement;

    /** A list as the views mark one: a search box, then rows each with one control to move to. */
    function list(rows: string) {
      drawer.openBonusType('Strength', 'Enhancement', true);
      fixture.detectChanges();
      aside = drawerElement();
      aside.innerHTML = `<input type="text" data-drawer-search>${rows}`;
      document.body.appendChild(fixture.nativeElement);
    }

    afterEach(() => (fixture.nativeElement as HTMLElement).remove());

    const press = (key: string) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      (document.activeElement ?? aside).dispatchEvent(event);
      return event;
    };
    const navTargets = () => Array.from(aside.querySelectorAll<HTMLElement>('[data-drawer-nav]'));

    it('moves from the search into the list and back with the arrows, and among the rows with J/K', () => {
      list(`
        <div class="item-result-row"><button data-drawer-nav>A</button></div>
        <div class="item-result-row"><button data-drawer-nav disabled>Equipped</button></div>
        <div class="item-result-row"><button data-drawer-nav>B</button></div>
        <div class="item-result-row"><button data-drawer-nav>C</button></div>`);
      const [a, , b, c] = navTargets();
      const search = aside.querySelector<HTMLInputElement>('[data-drawer-search]')!;

      search.focus();
      expect(press('j').defaultPrevented).toBe(false); // typed into the search
      expect(press('ArrowDown').defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(a);
      press('j'); // past the disabled one
      expect(document.activeElement).toBe(b);
      press('j');
      press('j'); // stays on the last
      expect(document.activeElement).toBe(c);
      press('k');
      press('ArrowUp');
      press('ArrowUp');
      expect(document.activeElement).toBe(search);
    });

    it('holds the selected row at the same height, scrolling the drawer under it', () => {
      list('<div class="item-result-row"><button data-drawer-nav>A</button></div>');
      const scrollTo = vi.fn();
      aside.scrollTo = scrollTo as unknown as typeof aside.scrollTo;
      Object.defineProperty(aside, 'clientHeight', { value: 1000 });
      aside.scrollTop = 300;
      vi.spyOn(aside, 'getBoundingClientRect').mockReturnValue({ top: 0 } as DOMRect);
      vi.spyOn(aside.querySelector('.item-result-row')!, 'getBoundingClientRect').mockReturnValue({ top: 700 } as DOMRect);

      aside.querySelector<HTMLInputElement>('[data-drawer-search]')!.focus();
      press('ArrowDown');

      // 700 below the top, held 200 (a fifth of 1000) down: 500 further on.
      expect(scrollTo).toHaveBeenCalledWith({ top: 800 });
    });

    it('takes an open item preview along to each item it moves to, but never presses Equip', () => {
      list(`
        <div class="item-result-row"><button data-drawer-nav class="item-preview-link">A</button></div>
        <div class="item-result-row selected-preview-row"><button data-drawer-nav class="item-preview-link">B</button></div>
        <div class="item-result-row"><button data-drawer-nav class="equip-button">Set</button></div>
        <aside class="item-preview-panel"><button class="preview-equip-button">Equip</button></aside>`);
      const [, b, set] = navTargets();
      const previewB = vi.fn();
      const pressSet = vi.fn();
      b.addEventListener('click', previewB);
      set.addEventListener('click', pressSet);

      // From the preview's own Equip, Up carries on from the previewed row.
      aside.querySelector<HTMLElement>('.preview-equip-button')!.focus();
      press('ArrowUp');
      press('ArrowDown');

      expect(document.activeElement).toBe(b);
      expect(previewB).toHaveBeenCalledTimes(1);
      press('ArrowDown');
      expect(document.activeElement).toBe(set);
      expect(pressSet).not.toHaveBeenCalled();
    });

    it('equips the previewed item on a second Enter, as the preview\'s own Equip would', () => {
      list(`
        <div class="item-result-row selected-preview-row"><button data-drawer-nav class="item-preview-link">A</button></div>
        <div class="item-result-row"><button data-drawer-nav class="item-preview-link">B</button></div>
        <aside class="item-preview-panel"><button class="preview-equip-button">Equip</button></aside>`);
      const [a, b] = navTargets();
      const equip = vi.fn();
      aside.querySelector('.preview-equip-button')!.addEventListener('click', equip);

      b.focus();
      expect(press('Enter').defaultPrevented).toBe(false); // not previewed: its own click previews it
      a.focus();
      expect(press('Enter').defaultPrevented).toBe(true);
      expect(equip).toHaveBeenCalledTimes(1);
    });
  });
});
