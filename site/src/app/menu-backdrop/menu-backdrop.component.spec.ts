import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MenuBackdropComponent } from './menu-backdrop.component';

@Component({
  template: `
    @if (open) {
      <div class="menu">Menu</div>
      <app-menu-backdrop label="Close the menu" (dismiss)="open = false; dismissed = dismissed + 1"></app-menu-backdrop>
    }
  `,
  imports: [MenuBackdropComponent]
})
class HostComponent {
  open = true;
  dismissed = 0;
}

describe('MenuBackdropComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  const el = () => fixture.nativeElement as HTMLElement;
  const backdrop = () => el().querySelector<HTMLButtonElement>('.menu-backdrop');
  const pressEscape = () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    fixture.detectChanges();
  };

  beforeEach(() => {
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('closes the menu on a click anywhere else', () => {
    expect(backdrop()!.getAttribute('aria-label')).toBe('Close the menu');

    backdrop()!.click();
    fixture.detectChanges();

    expect(el().querySelector('.menu')).toBeNull();
    expect(fixture.componentInstance.dismissed).toBe(1);
  });

  it('closes the menu on Escape, once', () => {
    pressEscape();
    expect(el().querySelector('.menu')).toBeNull();

    pressEscape();
    expect(fixture.componentInstance.dismissed).toBe(1);
  });

  it('stops handling Escape once the menu has closed another way', () => {
    backdrop()!.click();
    fixture.detectChanges();

    pressEscape();

    expect(fixture.componentInstance.dismissed).toBe(1);
  });
});
