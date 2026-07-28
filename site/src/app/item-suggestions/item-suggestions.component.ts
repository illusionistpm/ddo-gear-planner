import { Component, OnInit, Input, ChangeDetectionStrategy } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Observable } from 'rxjs';

import { GearDbService } from '../gear-db.service';
import { EquippedService } from '../equipped.service';
import { Item } from '../item';
import { UserGearService, UserItemLocation } from '../user-gear.service';

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
  cannith: Array<Item> = [];

  constructor(
    public gearDB: GearDbService,
    public equipped: EquippedService,
    private modalService: NgbModal,
    public userGear: UserGearService
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
    const filtered = this.gearDB.getFilteredGearBySlot(this.slot) || [];
    for (const gear of filtered) {
      shortlist.push(gear);
    }

    shortlist.sort((a, b) => this.equipped.getScore(b) - this.equipped.getScore(a));

    this.gear = shortlist.slice(0, 20);

    this.cannith = filtered.filter(item => item.isCannithCrafted());
  }

  clearSlot() {
    if (this.gear.length > 0) {
      this.equipped.clearSlot(this.gear[0].slot);
    }
    this.modalService.dismissAll();
  }

  equipItem(item: Item) {
    this.equipped.set(item);
    this.modalService.dismissAll();
  }

  onChange(slot: string) {
    return (newVal: any) => {
      if (newVal instanceof Item) {
        this.gear = [newVal];
      } else {
        const found = this.gearDB.findGearBySlot(slot, newVal);
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
