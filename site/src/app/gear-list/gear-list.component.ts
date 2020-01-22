import { Component, OnInit } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { GearDbService } from '../gear-db.service';
import { EquippedService } from '../equipped.service';
import { Item } from '../item';

import { ItemSuggestionsComponent } from './../item-suggestions/item-suggestions.component';

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

  loadDummy() {
    this.equipped.loadDefaults();
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

  getItemName(slot: string) {
    const itemName = this.itemNameMap.get(slot);
    if (itemName) {
      return itemName;
    }

    return '';
  }
}
