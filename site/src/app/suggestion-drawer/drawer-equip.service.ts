import { Injectable } from '@angular/core';

import { AnalyticsService } from '../shared/analytics.service';
import { EquippedService } from '../planner/equipped.service';
import { Item } from '../gear/item';
import { SuggestionDrawerService } from './suggestion-drawer.service';
import { SlotUndoService } from '../undo/slot-undo.service';

/** Where in the suggestion drawer an equip came from, as reported to analytics. */
export type DrawerEquipSource =
  | 'slot_suggestions'
  | 'bonus_type_modal'
  | 'bonus_type_preview'
  | 'bonus_type_craft_into_equipped'
  | 'augment_modal'
  | 'set_modal'
  | 'set_preview';

/**
 * The one way the suggestion drawer equips an item: equip it, report it, and
 * close the drawer - offering Undo when it took another item's place. Whether the item may be equipped is the caller's check.
 */
@Injectable({
  providedIn: 'root'
})
export class DrawerEquipService {
  constructor(
    private equipped: EquippedService,
    private analytics: AnalyticsService,
    private suggestionDrawer: SuggestionDrawerService,
    private slotUndo: SlotUndoService
  ) { }

  equip(item: Item, equipSource: DrawerEquipSource) {
    const before = this.slotUndo.before();
    this.equipped.set(item);
    this.slotUndo.offerUndo(before);
    this.analytics.track('planner_equip_item', {
      equip_source: equipSource,
      slot: item.slot,
      crafted: !!item.isEssenceCrafted()
    });
    this.suggestionDrawer.close();
  }
}
