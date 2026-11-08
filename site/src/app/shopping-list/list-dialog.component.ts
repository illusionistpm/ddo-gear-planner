import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild, inject
} from '@angular/core';

import { CloseRequestService } from '../shared/close-request.service';

/**
 * A dialog over a shopping list: Add builds and Invite friends on your own
 * list, Add builds on a list of several. A heading, a close button, and
 * whatever it's given; closed by its button, a click outside it, or a close
 * request (Escape, the back gesture). Render it inside the `@if` that opens
 * it, and close it on `closed`.
 *
 * A modal <dialog>, so it's in the top layer: your own list's actions sit
 * inside the list, whose wide-screen `container-type` would otherwise make
 * it the box a fixed dialog is placed in.
 */
@Component({
  selector: 'app-list-dialog',
  templateUrl: './list-dialog.component.html',
  styleUrls: ['./list-dialog.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ListDialogComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) heading = '';
  @Output() readonly closed = new EventEmitter<void>();
  @ViewChild('dialog', { static: true }) private dialog!: ElementRef<HTMLDialogElement>;

  private readonly releaseCloseRequest = inject(CloseRequestService).listen(() => this.closed.emit());

  ngAfterViewInit(): void {
    const dialog = this.dialog.nativeElement;
    try {
      dialog.showModal();
    } catch {
      // No modal dialogs here (jsdom, an old browser): open in place, over the page all the same.
      dialog.setAttribute('open', '');
    }
  }

  ngOnDestroy(): void {
    this.releaseCloseRequest();
  }

  /** A click on the dialog itself, not its panel, is a click outside the panel. */
  clickedOutside(event: MouseEvent): void {
    if (event.target === this.dialog.nativeElement) {
      this.closed.emit();
    }
  }

  /** The browser's own Escape: closed as any other close request, by whoever opened it. */
  cancelled(event: Event): void {
    event.preventDefault();
    this.closed.emit();
  }
}
