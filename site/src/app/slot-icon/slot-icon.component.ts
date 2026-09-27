import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { slotIcon } from '../gear/slot-display';
import { SLOT_ICON_PATHS } from './slot-icon-paths';

/**
 * A slot's silhouette, drawn in the current text colour. Renders nothing for a slot without one.
 * Cards that aren't a slot (non-gear, set bonuses) name their icon directly with `icon`.
 */
@Component({
  selector: 'app-slot-icon',
  template: `
    @if (path) {
      <svg viewBox="0 0 512 512" aria-hidden="true" focusable="false"><path fill="currentColor" [attr.d]="path"></path></svg>
    }
  `,
  styles: [`
    :host {
      display: inline-flex;
      flex: none;
    }

    svg {
      height: 1.15em;
      width: 1.15em;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false
})
export class SlotIconComponent {
  @Input() slot?: string;
  @Input() icon?: string;

  get path(): string | undefined {
    const key = this.icon ?? (this.slot ? slotIcon(this.slot) : undefined);
    return key ? SLOT_ICON_PATHS[key]?.d : undefined;
  }
}
