import { ComponentFixture, TestBed } from '@angular/core/testing';
import buildInfo from '@data/build-info.json';

import { AppModule } from '../app.module';
import { formatBuiltAt } from '../shared/format-built-at';
import { CreditsComponent } from './credits.component';

describe('CreditsComponent', () => {
  let fixture: ComponentFixture<CreditsComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AppModule] }).compileComponents();
    fixture = TestBed.createComponent(CreditsComponent);
    host = fixture.nativeElement;
    fixture.detectChanges();
  });

  function toggle() {
    host.querySelector<HTMLButtonElement>('.credits-toggle')!.click();
    fixture.detectChanges();
  }

  function popover() {
    return host.querySelector('.credits-popover');
  }

  it('starts closed', () => {
    expect(popover()).toBeNull();
    expect(host.querySelector('.credits-toggle')!.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens from the info button, and says so', () => {
    toggle();

    expect(popover()).not.toBeNull();
    expect(host.querySelector('.credits-toggle')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('shows when the game data was built', () => {
    toggle();

    expect(popover()!.textContent).toContain(`Data built: ${formatBuiltAt(buildInfo.builtAt)}`);
  });

  it('credits the wiki, the slot icons and their authors, and Font Awesome', () => {
    toggle();
    const text = popover()!.textContent!.replace(/\s+/g, ' ');
    const links = Array.from(popover()!.querySelectorAll('a')).map(a => a.getAttribute('href'));

    expect(text).toContain('DDO Wiki');
    expect(text).toContain('CC BY-SA 2.5');
    expect(text).toContain('Slot icons by Lorc, ');
    expect(text).toMatch(/and \w+, from game-icons\.net/);
    expect(text).toContain('Font Awesome Free');
    expect(links).toContain('https://ddowiki.com');
    expect(links).toContain('https://game-icons.net');
    expect(links).toContain('https://creativecommons.org/licenses/by/3.0/');
  });

  it('opens every link in a new tab without a referrer', () => {
    toggle();

    for (const link of Array.from(popover()!.querySelectorAll('a'))) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noreferrer');
    }
  });

  it('closes from its close button', () => {
    toggle();
    popover()!.querySelector<HTMLButtonElement>('.credits-close')!.click();
    fixture.detectChanges();

    expect(popover()).toBeNull();
  });

  it('closes on Escape', () => {
    toggle();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(popover()).toBeNull();
  });

  it('closes when the info button is pressed again', () => {
    toggle();
    toggle();

    expect(popover()).toBeNull();
  });

  it('closes when the page closes it, as opening the Ko-fi popover does', () => {
    toggle();
    fixture.componentInstance.close();
    fixture.detectChanges();

    expect(popover()).toBeNull();
  });

  it('announces opening, but not closing', () => {
    let opened = 0;
    fixture.componentInstance.opened.subscribe(() => opened++);

    toggle();
    toggle();

    expect(opened).toBe(1);
  });
});
