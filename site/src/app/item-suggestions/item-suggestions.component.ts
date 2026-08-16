import { Component, OnInit, Input, ChangeDetectionStrategy } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Observable } from 'rxjs';

import { GearDbService } from '../gear-db.service';
import { EquippedService } from '../equipped.service';
import { Item } from '../item';
import { UserGearService, UserItemLocation } from '../user-gear.service';
import { AnalyticsService } from '../analytics.service';

@Component({
    selector: 'app-item-suggestions',
    templateUrl: './item-suggestions.component.html',
    styleUrls: ['./item-suggestions.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ItemSuggestionsComponent implements OnInit {
  @Input() slot!: string;

  current: Observable<Item> | null = null;
  gear: Array<Item> = [];
  filteredGear: Array<Item> = [];
  essenceCrafting: Array<Item> = [];

  constructor(
    public gearDB: GearDbService,
    public equipped: EquippedService,
    private modalService: NgbModal,
    public userGear: UserGearService,
    private analytics: AnalyticsService
  ) { }

  userOwnsItem(item: Item): boolean {
    return !!item?.name && this.userGear.hasItem(item.name);
  }

  getUserItemLocations(item: Item): UserItemLocation[] | undefined {
    return item?.name ? this.userGear.getItemLocations(item.name) : undefined;
  }

  ngOnInit() {
    this.current = this.equipped.getSlot(this.slot);

    const shortlist: Array<Item> = [];
    this.filteredGear = this.gearDB.getFilteredGearBySlot(this.slot) || [];
    for (const gear of this.filteredGear) {
      shortlist.push(gear);
    }

    shortlist.sort((a, b) => this.equipped.getScore(b) - this.equipped.getScore(a));

    this.gear = shortlist.slice(0, 20);

    this.essenceCrafting = this.filteredGear.filter(item => item.isEssenceCrafted());
  }

  clearSlot() {
    if (this.gear.length > 0) {
      this.equipped.clearSlot(this.gear[0].slot);
      this.analytics.track('planner_clear_slot', {
        slot: this.gear[0].slot,
        clear_source: 'slot_suggestions'
      });
    }
    this.modalService.dismissAll();
  }

  equipItem(item: Item) {
    this.equipped.set(item);
    this.analytics.track('planner_equip_item', {
      equip_source: 'slot_suggestions',
      slot: item.slot,
      crafted: !!item.isEssenceCrafted()
    });
    this.modalService.dismissAll();
  }

  onChange(slot: string) {
    return (newVal: any) => {
      if (newVal instanceof Item) {
        this.gear = [newVal];
      } else {
        const found = this.filteredGear.find(item => item.name === newVal);
        if (found) {
          this.gear = [found];
        } else {
          this.gear = [];
        }
      }
    };
  }

  close() {
    this.modalService.dismissAll();
  }
}
