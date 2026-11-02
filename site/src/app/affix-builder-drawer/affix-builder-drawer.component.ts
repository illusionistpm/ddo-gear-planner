import { Component, ChangeDetectionStrategy, HostListener, OnDestroy } from '@angular/core';
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

    // Only the edit slide-over is an overlay, so only it claims the back
    // gesture. Setup mode is the whole page on a first visit; back there
    // keeps its normal meaning (leaving), and Escape is handled below.
    this.subscription.add(drawer.mode$.subscribe(mode => {
      if (mode === 'edit' && !this.releaseCloseRequest) {
        this.releaseCloseRequest = closeRequests.listen(() => this.close());
      } else if (mode !== 'edit') {
        this.release();
      }
    }));
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
    this.release();
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    // In setup mode the primary "Start planning" action is the way out, but Escape
    // is still a harmless fallback. Edit mode's Escape arrives via CloseRequestService.
    if (this.drawer.mode === 'setup') {
      this.close();
    }
  }

  close() {
    this.drawer.close();
  }

  private release() {
    this.releaseCloseRequest?.();
    this.releaseCloseRequest = null;
  }
}
