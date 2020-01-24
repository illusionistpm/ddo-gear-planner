import { Component, OnInit, Input } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Observable } from 'rxjs';

import { GearDbService } from '../gear-db.service';
import { EquippedService } from '../equipped.service';
import { Item } from '../item';

@Component({
  selector: 'app-item-suggestions',
  templateUrl: './item-suggestions.component.html',
  styleUrls: ['./item-suggestions.component.css']
})
export class ItemSuggestionsComponent implements OnInit {
  @Input() slot: string;

  current: Observable<Item>;
  gear: Array<Item>;

  constructor(
    public gearDB: GearDbService,
    public equipped: EquippedService,
    private modalService: NgbModal
  ) { }

  ngOnInit() {
    this.current = this.equipped.getSlot(this.slot);

    const shortlist = [];
    for (const gear of this.gearDB.getGearBySlot(this.slot)) {
      shortlist.push(gear);
    }

    shortlist.sort((a, b) => this.equipped.getScore(b) - this.equipped.getScore(a));

    this.gear = shortlist.slice(0, 20);
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
        this.gear = [this.gearDB.findGearBySlot(slot, newVal)];
      }
    };
  }

  close() {
    this.modalService.dismissAll();
  }
}
