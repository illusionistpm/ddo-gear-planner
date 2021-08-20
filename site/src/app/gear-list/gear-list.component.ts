import { Component, OnInit } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { GearDbService } from '../gear-db.service';
import { EquippedService } from '../equipped.service';
import { Affix } from '../affix';
import { AffixRank } from '../affix-rank.enum';
import { Clipboard } from '../clipboard';
import { Item } from '../item';

import { ItemSuggestionsComponent } from './../item-suggestions/item-suggestions.component';
import { ItemsInSetComponent } from './../items-in-set/items-in-set.component';

@Component({
  selector: 'app-gear-list',
  templateUrl: './gear-list.component.html',
  styleUrls: ['./gear-list.component.css']
})
export class GearListComponent implements OnInit {
  itemNameMap: Map<string, string>;

  constructor(
    public gearList: GearDbService,
    public equipped: EquippedService,
    private modalService: NgbModal
  ) {
    this.itemNameMap = new Map<string, string>();
  }

  ngOnInit() {
    for (const item of this.equipped.getSlots().values()) {
      item.subscribe(newItem => {
        if (newItem) {
          this.itemNameMap.set(newItem.slot, newItem.name);
        }
      });
    }
  }

  showSuggestedItems(slot) {
    const dlg = this.modalService.open(ItemSuggestionsComponent, { ariaLabelledBy: 'modal-basic-title' });

    dlg.componentInstance.slot = slot;

    dlg.result.then((result) => {
      // this.closeResult = `Closed with: ${result}`;
    }, (reason) => {
      // this.closeResult = `Dismissed ${this.getDismissReason(reason)}`;
    });
  }

  showItemsInSet(setName: string) {
    const dlg = this.modalService.open(ItemsInSetComponent, { ariaLabelledBy: 'modal-basic-title' });

    dlg.componentInstance.setName = setName;

    dlg.result.then((result) => {
      // this.closeResult = `Closed with: ${result}`;
    }, (reason) => {
      // this.closeResult = `Dismissed ${this.getDismissReason(reason)}`;
    });
  }

  getItemName(slot: string) {
    const itemName = this.itemNameMap.get(slot);
    if (itemName) {
      return itemName;
    }

    return '';
  }

  // JAK: FIXME!! This is duplicated and awful
  getAffixValue(affix: Affix) {
    if (affix.value) {
      return (affix.value > 0 ? '+' : '') + affix.value;
    }
    return '';
  }

  // JAK: FIXME!! This is duplicated and awful
  getClassForAffix(affix: Affix) {
    const affixRank = this.equipped.getAffixRanking(affix);
    return AffixRank[affixRank];
  }

  getClassForSlot(slot: string) {
    const itemName = this.getItemName(slot);
    const item = this.gearList.findGearBySlot(slot, itemName);
    if (item && item.artifact) {
      return 'MinorArtifact';
    }
  }

  copyGearToClipboard() {
    Clipboard.copy(this.equipped.getGearDescription());
  }
}
