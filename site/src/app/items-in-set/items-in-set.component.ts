import { Component, OnInit, Input, ChangeDetectionStrategy } from '@angular/core';

import { GearDbService } from '../gear-db.service';
import { EquippedService } from '../equipped.service';
import { Item } from '../item';
import { AnalyticsService } from '../analytics.service';
import { SuggestionDrawerService } from '../suggestion-drawer/suggestion-drawer.service';

@Component({
    selector: 'app-items-in-set',
    templateUrl: './items-in-set.component.html',
    styleUrls: ['./items-in-set.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ItemsInSetComponent implements OnInit {
  @Input() setName!: string;

  matches!: Array<Item>;
  lockedMatches!: Array<Item>;

  constructor(
    public gearDB: GearDbService,
    public equipped: EquippedService,
    private analytics: AnalyticsService,
    private suggestionDrawer: SuggestionDrawerService
  ) { }

  ngOnInit() {
    this.matches = [];
    this.lockedMatches = [];

    const matchingGear = this.equipped.getCompatibleGear(this.gearDB.findGearInSet(this.setName));
    for (const item of matchingGear) {
      if (this.equipped.getUnlockedSlots().has(item.slot)) {
        this.matches.push(item);
      } else {
        this.lockedMatches.push(item);
      }
    }

    this.matches = this._sortBySlot(this.matches);
    this.lockedMatches = this._sortBySlot(this.lockedMatches);
  }

  _sortBySlot(array: Array<Item>) {
    return array.sort((a, b) =>
      a.slot.localeCompare(b.slot));
  }

  equipItem(item: Item) {
    if (!this.equipped.canEquip(item)) {
      return;
    }

    this.equipped.set(item);
    this.analytics.track('planner_equip_item', {
      equip_source: 'set_modal',
      slot: item.slot
    });
    this.suggestionDrawer.close();
  }

  close() {
    this.suggestionDrawer.close();
  }
}
