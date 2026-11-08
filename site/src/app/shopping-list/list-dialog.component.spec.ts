import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListDialogComponent } from './list-dialog.component';

@Component({
  imports: [ListDialogComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `@if (open) {
    <app-list-dialog heading="Add builds" (closed)="open = false"><p class="inside">Your builds</p></app-list-dialog>
  }`
})
class HostComponent {
  open = true;
}

describe('ListDialogComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  const dialog = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLDialogElement>('dialog');

  beforeEach(() => {
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('opens over the page, headed and labelled, with what it\'s given', () => {
    expect(dialog()!.open).toBe(true);
    expect(dialog()!.getAttribute('aria-label')).toBe('Add builds');
    expect(dialog()!.querySelector('.list-dialog-header')?.textContent).toContain('Add builds');
    expect(dialog()!.querySelector('.inside')?.textContent).toBe('Your builds');
  });

  it('closes by its button, a click outside its panel, Escape, or the browser\'s own cancel - but not a click inside', () => {
    const closes: (() => void)[] = [
      () => dialog()!.querySelector<HTMLButtonElement>('.list-dialog-close')!.click(),
      () => dialog()!.click(),
      () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })),
      () => dialog()!.dispatchEvent(new Event('cancel', { cancelable: true }))
    ];
    for (const close of closes) {
      fixture.componentInstance.open = true;
      fixture.detectChanges();
      dialog()!.querySelector<HTMLElement>('.inside')!.click();
      fixture.detectChanges();
      expect(dialog()).toBeTruthy();

      close();
      fixture.detectChanges();
      expect(dialog()).toBeNull();
    }
  });
});
