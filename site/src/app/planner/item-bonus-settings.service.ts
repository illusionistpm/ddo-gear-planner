import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

import { ITEM_BONUS_KINDS, ItemBonusKind } from '../gear/item-bonus';
import { getStoredItemBonusKinds, storeItemBonusKinds } from './planner-view-state-storage';

/** What the planner calls each system, where the player switches it on and on the cards. */
export const ITEM_BONUS_KIND_LABELS: Readonly<Record<ItemBonusKind, string>> = {
  mythic: 'Mythic',
  reaper: 'Reaper',
  curse: 'Curse',
};

/**
 * Which of the Mythic Boost, Reaper bonus and Curse systems the player plans with. All off by default:
 * most players don't chase them, so until one is switched on the planner behaves as if it didn't exist -
 * no row on the equipment cards, no bonus type in the build goals. The exception is a build that already
 * carries one (a shared link): the gear shows what it has, since it counts towards the totals.
 *
 * A preference of the player, not part of a build: remembered per browser, never in a URL.
 */
@Injectable({
  providedIn: 'root'
})
export class ItemBonusSettingsService {
  private enabled = new BehaviorSubject<ReadonlySet<ItemBonusKind>>(getStoredItemBonusKinds());

  /** The systems switched on, in ITEM_BONUS_KINDS order. Emits the current set on subscribe. */
  getEnabledKinds(): Observable<ReadonlySet<ItemBonusKind>> {
    return this.enabled.asObservable();
  }

  getEnabledKindsSnapshot(): ReadonlySet<ItemBonusKind> {
    return this.enabled.getValue();
  }

  isEnabled(kind: ItemBonusKind): boolean {
    return this.enabled.getValue().has(kind);
  }

  setEnabled(kind: ItemBonusKind, enabled: boolean) {
    if (this.isEnabled(kind) === enabled) {
      return;
    }
    const kinds = new Set(ITEM_BONUS_KINDS.filter(each => each === kind ? enabled : this.isEnabled(each)));
    storeItemBonusKinds(kinds);
    this.enabled.next(kinds);
  }
}
