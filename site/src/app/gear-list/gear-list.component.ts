import { Component, OnInit } from '@angular/core';

import { GearDbService } from '../gear-db.service';
import { EquippedService } from '../equipped.service';
import { Item } from '../item';

@Component({
  selector: 'app-gear-list',
  templateUrl: './gear-list.component.html',
  styleUrls: ['./gear-list.component.css']
})
export class GearListComponent implements OnInit {

  constructor(
    public gearList: GearDbService,
    public equipped: EquippedService
  ) {
  }

  ngOnInit() {
  }

  onChange(slot) {
    return (newVal: any) => {
      if (newVal instanceof Item) {
        this.equipped.set(slot, newVal);
      } else {
        const item = this.gearList.findGearBySlot(slot, newVal);
        this.equipped.set(slot, item);
      }
    };
  }
}
