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

  @Input() effectName: string;
  @Input() bonusType: string;

  matches: Array<Item>;

  constructor(
    public gearDB: GearDbService,
    public equipped: EquippedService,
    private modalService: NgbModal
  ) {
  }

  ngOnInit() {
    this.matches = this.gearDB.findGearWithAffixAndType(this.effectName, this.bonusType);
  }

  viewItem(item: Item) {

  }

  equipItem(item: Item) {
    this.equipped.set(item.slot, item);
    this.modalService.dismissAll();
  }

}
