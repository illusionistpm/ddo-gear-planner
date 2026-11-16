import { Injectable, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';

import { AnalyticsService } from '../shared/analytics.service';
import { EquippedService } from '../planner/equipped.service';
import { UndoService } from './undo.service';

/**
 * Undo for taking a build goal off the list. The undo puts the whole list
 * back as it was, so it is withdrawn when the list changes again: it never
 * discards a later edit.
 */
@Injectable({
  providedIn: 'root'
})
export class GoalUndoService implements OnDestroy {
  private watching?: Subscription;

  constructor(
    private equipped: EquippedService,
    private undo: UndoService,
    private analytics: AnalyticsService
  ) { }

  remove(affixName: string): void {
    const before = Array.from(this.equipped.getImportantAffixes());
    this.equipped.removeImportantAffix(affixName);
    // A copy: the service hands out its own set, which later edits change.
    const after = new Set(this.equipped.getImportantAffixes());
    if (after.size === before.length) {
      return;
    }

    this.watching?.unsubscribe();
    const withdraw = this.undo.offer({
      message: `Removed goal: ${affixName}`,
      undo: () => {
        this.watching?.unsubscribe();
        this.equipped.setImportantAffixes(before);
        this.analytics.track('planner_undo', { undo_kind: 'goal' });
      }
    });
    // Replays the list as it is now, then tells of any later change.
    this.watching = this.equipped.getImportantAffixesObservable().subscribe(goals => {
      if (goals.size !== after.size || [...goals].some(goal => !after.has(goal))) {
        withdraw();
      }
    });
  }

  ngOnDestroy(): void {
    this.watching?.unsubscribe();
  }
}
