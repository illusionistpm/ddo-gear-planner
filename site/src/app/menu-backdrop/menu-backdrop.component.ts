import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnDestroy, Output, inject } from '@angular/core';

import { CloseRequestService } from '../shared/close-request.service';

/**
 * How an open dropdown menu closes: a click anywhere else lands on this
 * transparent backdrop, and Escape or the back gesture arrive through
 * CloseRequestService. Render it inside the menu's `@if`, so it exists
 * exactly while the menu is open, and close the menu on `dismiss`.
 *
 * The backdrop takes the click rather than letting it through, so clicking
 * another control while a menu is open only closes the menu. The menu
 * itself needs a z-index above the backdrop's 30.
 */
@Component({
  selector: 'app-menu-backdrop',
  template: '<button type="button" class="menu-backdrop" [attr.aria-label]="label" (click)="dismiss.emit()"></button>',
  styleUrls: ['./menu-backdrop.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MenuBackdropComponent implements OnDestroy {
  @Input() label = 'Close';
  @Output() readonly dismiss = new EventEmitter<void>();

  private readonly releaseCloseRequest = inject(CloseRequestService).listen(() => this.dismiss.emit());

  ngOnDestroy(): void {
    this.releaseCloseRequest();
  }
}
