import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { SuggestionDrawerService } from '../suggestion-drawer/suggestion-drawer.service';

/** The drawer's view of a filigree set, opened from its card under the gear list. */
@Component({
  selector: 'app-filigree-set-drawer',
  template: `
    <div class="modal-body">
      <div class="drawer-heading-row">
        @if (drawer.canGoBack) {
          <button type="button" class="drawer-back-button" (click)="drawer.back()">
            <span aria-hidden="true">&lsaquo;</span> Back
          </button>
        }
        <h1 class="drawer-heading-title">{{setName}}</h1>
        <button type="button" class="custom-close" aria-label="Close" (click)="drawer.close()">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
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

  constructor(public drawer: SuggestionDrawerService) { }
}
