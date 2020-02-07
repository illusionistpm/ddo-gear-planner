import { Component, OnInit, Input } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { GearDbService } from '../gear-db.service';
import { EquippedService } from '../equipped.service';
import { Item } from '../item';
import { Affix } from '../affix';

import { ItemsInSetComponent } from './../items-in-set/items-in-set.component';

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

  sets: Array<[string, number, number]>;

  setMatches: Array<[string, Array<Affix>, Array<Item>]>;

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

    // JAK: FIXME!! I need to add sets to the bonus type list
    this.sets = this.gearDB.findSetsWithAffixAndType(this.affixName, this.bonusType);

    this.matches = this._sortByValue(this.matches);
    this.lockedMatches = this._sortByValue(this.lockedMatches);
  }

  isRealType(bonusType) {
    return Affix.isRealType(bonusType);
  }

  _sortByValue(array: Array<Item>) {
    return array.sort((a, b) =>
      Number(b.getValue(this.affixName, this.bonusType)) - Number(a.getValue(this.affixName, this.bonusType)));
  }

  findMatchingValue(item: Item) {
    const ret = item.getMatchingBonusType(this.affixName, this.bonusType);
    let crafting = ret[0] || '';
    if (crafting) {
      crafting = ' (' + crafting + ')';
    }
    const value = ret[1] || '';

    return [crafting, value];
  }

  equipItem(item: Item) {
    // Apply the relevant crafting option, if any
    item.selectMatchingBonusType(this.affixName, this.bonusType);

    this.equipped.set(item);
    this.modalService.dismissAll();
  }

  // Duplicated from gear-craftingList
  showItemsInSet(setName: string) {
    const dlg = this.modalService.open(ItemsInSetComponent, { ariaLabelledBy: 'modal-basic-title' });

    dlg.componentInstance.setName = setName;

    dlg.result.then((result) => {
      // this.closeResult = `Closed with: ${result}`;
    }, (reason) => {
      // this.closeResult = `Dismissed ${this.getDismissReason(reason)}`;
    });
  }

  close() {
    this.modalService.dismissAll();
  }

}
