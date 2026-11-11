import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/** The drawer's view of a filigree set, opened from its card under the gear list. */
@Component({
  selector: 'app-filigree-set-drawer',
  template: `
    <div class="modal-body">
      <app-drawer-heading [title]="setName"></app-drawer-heading>
    </div>
    <div class="modal-body">
      <app-filigree-set-details [setNames]="[setName]"></app-filigree-set-details>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false
})
export class FiligreeSetDrawerComponent {
  @Input({ required: true }) setName!: string;
}
