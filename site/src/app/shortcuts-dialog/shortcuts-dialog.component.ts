import { ChangeDetectionStrategy, Component, EventEmitter, Output } from '@angular/core';

import { ListDialogComponent } from '../shopping-list/list-dialog.component';
import { KEYBOARD_SHORTCUTS, isMacPlatform } from '../shared/keyboard-shortcuts';

/** The keyboard shortcuts sheet: "?" anywhere on the planner, or the account menu's row. */
@Component({
  selector: 'app-shortcuts-dialog',
  templateUrl: './shortcuts-dialog.component.html',
  styleUrls: ['./shortcuts-dialog.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ListDialogComponent]
})
export class ShortcutsDialogComponent {
  @Output() readonly closed = new EventEmitter<void>();

  readonly groups = KEYBOARD_SHORTCUTS;
  private readonly mac = isMacPlatform();

  keyLabel(key: string): string {
    if (key === 'Mod') {
      return this.mac ? '⌘' : 'Ctrl';
    }
    if (key === 'Shift' && this.mac) {
      return '⇧';
    }
    return key;
  }
}
