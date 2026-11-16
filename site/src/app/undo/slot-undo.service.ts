import { Injectable, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';

import { AnalyticsService } from '../shared/analytics.service';
import { EquippedService } from '../planner/equipped.service';
import { Item } from '../gear/item';
import { slotLabel } from '../gear/slot-display';
import { UndoService } from './undo.service';

/** The equipped gear before an edit, to tell afterwards what the edit took away. */
export type SlotsBefore = Map<string, Item | null>;

/**
 * Undo for edits that take an item off the build: clearing a slot, or
 * equipping over one (which can also empty the offhand, when the new weapon
 * is two-handed). Take `before()` ahead of the edit and call `offerUndo`
 * after it; nothing is offered when no item was lost.
 *
 * The undo puts back the items as they were, with their crafting choices.
 * It is withdrawn as soon as one of the slots it would restore changes
 * again, since putting the old items back over a later edit could leave gear
 * that can't be worn together.
 */
@Injectable({
  providedIn: 'root'
})
export class SlotUndoService implements OnDestroy {
  private watching: Subscription[] = [];

  constructor(
    private equipped: EquippedService,
    private undo: UndoService,
    private analytics: AnalyticsService
  ) { }

  before(): SlotsBefore {
    return this.equipped.getSlotsSnapshot();
  }

  offerUndo(before: SlotsBefore): void {
    const after = this.equipped.getSlotsSnapshot();
    const changed = [...before.keys()].filter(slot => before.get(slot) !== after.get(slot));
    const lost = changed.filter(slot => {
      const was = before.get(slot);
      return !!was && was.name !== after.get(slot)?.name;
    });
    if (!lost.length) {
      return;
    }

    this.stopWatching();
    const withdraw = this.undo.offer({
      message: this.describe(lost, before, after),
      undo: () => {
        this.stopWatching();
        this.equipped.restoreSlots(changed.map(slot => [slot, before.get(slot) ?? null]));
        this.analytics.track('planner_undo', { undo_kind: 'gear', slots: changed.length });
      }
    });
    // Each slot replays what it holds now, then tells of any later change.
    for (const slot of changed) {
      const held = this.equipped.getSlot(slot);
      if (held) {
        this.watching.push(held.subscribe(item => {
          if (item !== after.get(slot)) {
            withdraw();
          }
        }));
      }
    }
  }

  ngOnDestroy(): void {
    this.stopWatching();
  }

  private stopWatching(): void {
    for (const subscription of this.watching) {
      subscription.unsubscribe();
    }
    this.watching = [];
  }

  /** "Cleared Helm: X", or "Replaced X with Y", and any other slot the edit emptied. */
  private describe(lost: string[], before: SlotsBefore, after: SlotsBefore): string {
    const parts = lost.map((slot, index) => {
      const was = before.get(slot)!.name;
      const now = after.get(slot);
      if (now) {
        return `Replaced ${was} with ${now.name}`;
      }
      return index === 0 ? `Cleared ${slotLabel(slot)}: ${was}` : `cleared ${slotLabel(slot)}: ${was}`;
    });
    // The slot that was equipped into reads first, ahead of one it emptied.
    parts.sort((a, b) => Number(b.startsWith('Replaced')) - Number(a.startsWith('Replaced')));
    return parts.join(', and ');
  }
}
