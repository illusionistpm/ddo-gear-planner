import { Component, ChangeDetectionStrategy, HostListener, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';

import { AffixBuilderDrawerService } from './affix-builder-drawer.service';
import { EquippedService } from '../equipped.service';

@Component({
  selector: 'app-affix-builder-drawer',
  templateUrl: './affix-builder-drawer.component.html',
  styleUrls: ['./affix-builder-drawer.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class AffixBuilderDrawerComponent implements OnDestroy {
  trackedCount = 0;

  private subscription: Subscription;

  constructor(
    public drawer: AffixBuilderDrawerService,
    equipped: EquippedService
  ) {
    this.subscription = equipped.getImportantAffixesObservable()
      .subscribe(affixes => this.trackedCount = affixes.size);
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    // In setup mode the primary "Start planning" action is the way out, but Escape
    // is still a harmless fallback.
    this.close();
  }

  close() {
    this.drawer.close();
  }
}
