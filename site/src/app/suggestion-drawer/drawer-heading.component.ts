import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { SuggestionDrawerService } from './suggestion-drawer.service';

/** A drawer view's title row: Back while there's a view to go back to, the title, and close. */
@Component({
  selector: 'app-drawer-heading',
  template: `
    <div class="drawer-heading-row">
      @if (drawer.canGoBack) {
        <button type="button" class="drawer-back-button" (click)="drawer.back()">
          <span aria-hidden="true">&lsaquo;</span> Back
        </button>
      }
      <h1 class="drawer-heading-title">{{title}}</h1>
      <button type="button" class="custom-close" aria-label="Close" (click)="drawer.close()">
        <span aria-hidden="true">&times;</span>
      </button>
    </div>
  `,
  styles: [':host { display: block; }'],
  // canGoBack is the drawer's own state, which no input reflects.
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class DrawerHeadingComponent {
  @Input({ required: true }) title!: string;

  constructor(public drawer: SuggestionDrawerService) { }
}
