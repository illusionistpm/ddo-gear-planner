import { Component, ChangeDetectionStrategy, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';

import { SuggestionDrawerService } from './suggestion-drawer.service';
import { CloseRequestRelease, CloseRequestService } from '../shared/close-request.service';

@Component({
  selector: 'app-suggestion-drawer',
  templateUrl: './suggestion-drawer.component.html',
  styleUrls: ['./suggestion-drawer.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class SuggestionDrawerComponent implements OnDestroy {
  private releaseCloseRequest: CloseRequestRelease | null = null;
  private readonly subscription: Subscription;

  constructor(public drawer: SuggestionDrawerService, closeRequests: CloseRequestService) {
    // Back gesture / Escape closes the drawer outright (not a step back
    // through its own view history), the same as the backdrop does.
    this.subscription = drawer.state$.subscribe(state => {
      if (state && !this.releaseCloseRequest) {
        this.releaseCloseRequest = closeRequests.listen(() => this.close());
      } else if (!state) {
        this.release();
      }
    });
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
    this.release();
  }

  close() {
    this.drawer.close();
  }

  private release() {
    this.releaseCloseRequest?.();
    this.releaseCloseRequest = null;
  }
}
