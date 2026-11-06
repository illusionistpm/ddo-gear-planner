import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SupportLinkComponent } from './support-link.component';

describe('SupportLinkComponent', () => {
  let fixture: ComponentFixture<SupportLinkComponent>;
  const el = () => fixture.nativeElement as HTMLElement;
  const button = () => el().querySelector<HTMLButtonElement>('.support-link')!;
  const popover = () => el().querySelector('.support-popover');

  beforeEach(async () => {
    await TestBed.configureTestingModule({ declarations: [SupportLinkComponent] }).compileComponents();
    fixture = TestBed.createComponent(SupportLinkComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => (fixture.nativeElement as HTMLElement).remove());

  const open = () => {
    button().click();
    fixture.detectChanges();
  };

  it('opens the support form under the button, saying so', () => {
    const opened = vi.fn();
    fixture.componentInstance.opened.subscribe(opened);

    open();

    expect(popover()?.querySelector('iframe')?.getAttribute('src')).toContain('buymeacoffee.com/widget/page/illusionistpm');
    expect(button().getAttribute('aria-expanded')).toBe('true');
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it('closes from its close button, the button again, Escape, or a click anywhere else', () => {
    open();
    el().querySelector<HTMLButtonElement>('.support-popover-close')!.click();
    fixture.detectChanges();
    expect(popover()).toBeNull();

    open();
    open();
    expect(popover()).toBeNull();

    open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(popover()).toBeNull();

    open();
    document.body.click();
    fixture.detectChanges();
    expect(popover()).toBeNull();
  });

  it('stays open for a click inside it', () => {
    open();

    (popover() as HTMLElement).click();
    fixture.detectChanges();

    expect(popover()).toBeTruthy();
  });
});
