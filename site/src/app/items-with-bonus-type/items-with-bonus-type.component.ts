import { Component, OnInit, Input } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { GearDbService } from '../gear-db.service';
import { EquippedService } from '../equipped.service';
import { Item } from '../item';

@Component({
  selector: 'app-items-with-bonus-type',
  templateUrl: './items-with-bonus-type.component.html',
  styleUrls: ['./items-with-bonus-type.component.css']
})
export class ItemsWithBonusTypeComponent implements OnInit {

  @Input() affixName: string;
  @Input() bonusType: string;

  matches: Array<Item>;
  lockedMatches: Array<Item>;

  constructor(
    public gearDB: GearDbService,
    public equipped: EquippedService,
    private modalService: NgbModal
  ) {
  }

  ngOnInit() {
    this.matches = [];
    this.lockedMatches = [];

    const matchingGear = this.gearDB.findGearWithAffixAndType(this.affixName, this.bonusType);
    for (const item of matchingGear) {
      if (this.equipped.getUnlockedSlots().has(item.slot)) {
        this.matches.push(item);
      } else {
        this.lockedMatches.push(item);
      }
    }

    this.matches = this.matches.sort((a, b) => Number(b.getValue(this.affixName, this.bonusType)) - Number(a.getValue(this.affixName, this.bonusType)));
    this.lockedMatches = this.lockedMatches.sort((a, b) => b.ml - a.ml);
  }

  findMatchingValue(item: Item) {
    const ret = item.getMatchingBonusType(this.affixName, this.bonusType);
    let crafting = ret[0] || '';
    if(crafting) {
      crafting = " (" + crafting + ")";
    }
    let value = ret[1] || '';

    return [crafting, value];
  }

  viewItem(item: Item) {

  }

  equipItem(item: Item) {
    this.equipped.set(item);
    this.modalService.dismissAll();
  }

  close() {
    this.modalService.dismissAll();
  }

}
