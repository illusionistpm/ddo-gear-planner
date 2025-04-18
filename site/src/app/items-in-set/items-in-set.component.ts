import { Component, OnInit, Input } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { GearDbService } from '../gear-db.service';
import { EquippedService } from '../equipped.service';
import { Item } from '../item';

@Component({
    selector: 'app-items-in-set',
    templateUrl: './items-in-set.component.html',
    styleUrls: ['./items-in-set.component.css'],
    standalone: false
})
export class ItemsInSetComponent implements OnInit {
  @Input() setName: string;

  matches: Array<Item>;
  lockedMatches: Array<Item>;

  constructor(
    public gearDB: GearDbService,
    public equipped: EquippedService,
    private modalService: NgbModal
  ) { }

  ngOnInit() {
    this.matches = [];
    this.lockedMatches = [];

    const matchingGear = this.gearDB.findGearInSet(this.setName);
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
    this.equipped.set(item);
  }

  close() {
    this.modalService.dismissAll();
  }
}
