import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';

import { UndoService } from './undo.service';
import { modKeyLabel } from '../shared/keyboard-shortcuts';

/**
 * What the last edit took away, with Undo, for a few seconds at the foot of
 * the planner. Always in the DOM, so a screen reader announces what goes into
 * it; it takes no room until then.
 */
@Component({
  selector: 'app-undo-strip',
  template: `
    <div class="undo-strip" role="status" aria-live="polite" [class.active]="!!(undo.offer$ | async)">
      @if (undo.offer$ | async; as offer) {
        <span class="undo-strip-message">{{offer.message}}</span>
        <button type="button" class="undo-strip-action" [title]="'Undo (' + modKey + '+Z)'" (click)="undo.undo()">Undo<span
          class="kbd-hint undo-strip-kbd" aria-hidden="true"><kbd>{{modKey}}</kbd><kbd>Z</kbd></span></button>
        <button type="button" class="undo-strip-dismiss" aria-label="Dismiss" (click)="undo.dismiss()">
          <span aria-hidden="true">&times;</span>
        </button>
      }
    </div>
  `,
  styleUrls: ['./undo-strip.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [AsyncPipe]
})
export class UndoStripComponent {
  /** Ctrl, or ⌘ on a Mac: Ctrl+Z takes the same change back. */
  readonly modKey = modKeyLabel();

  constructor(public undo: UndoService) { }
}
