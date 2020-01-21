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

  constructor(
    public gearList: GearDbService,
    public equipped: EquippedService,
    private modalService: NgbModal
  ) {
  }

  ngOnInit() {
  }

  onChange(slot) {
    return (newVal: any) => {
      if (newVal instanceof Item) {
        this.equipped.set(newVal);
      } else {
        const item = this.gearList.findGearBySlot(slot, newVal);
        this.equipped.set(item);
      }
    };
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
}
