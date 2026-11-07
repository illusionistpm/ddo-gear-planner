import { Component, ChangeDetectionStrategy, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';

import { AffixBuilderDrawerService } from './affix-builder-drawer.service';
import { EquippedService } from '../planner/equipped.service';
import { CloseRequestRelease, CloseRequestService } from '../shared/close-request.service';

@Component({
  selector: 'app-affix-builder-drawer',
  templateUrl: './affix-builder-drawer.component.html',
  styleUrls: ['./affix-builder-drawer.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class AffixBuilderDrawerComponent implements OnDestroy {
  trackedCount = 0;

  private subscription = new Subscription();
  private releaseCloseRequest: CloseRequestRelease | null = null;

  constructor(
    public drawer: AffixBuilderDrawerService,
    equipped: EquippedService,
    closeRequests: CloseRequestService
  ) {
    this.subscription.add(equipped.getImportantAffixesObservable()
      .subscribe(affixes => this.trackedCount = affixes.size));

    // An overlay while open, so it claims Escape and the back gesture.
    this.subscription.add(drawer.isOpen$.subscribe(open => {
      if (open && !this.releaseCloseRequest) {
        this.releaseCloseRequest = closeRequests.listen(() => this.close());
      } else if (!open) {
        this.release();
      }
    }));
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
