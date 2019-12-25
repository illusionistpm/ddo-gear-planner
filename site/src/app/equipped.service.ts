import { Injectable } from '@angular/core';

import { Item } from './item';

import { GearDbService } from './gear-db.service';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class EquippedService {
  private slots: Map<string, BehaviorSubject<Item>>;
  private dummyItem: Item;

  constructor(
    private gearList: GearDbService
  ) {
    this.dummyItem = new Item(null);
    this.slots = new Map();
    for (const slot of gearList.getSlots()) {
      this.slots.set(slot, new BehaviorSubject(null));
    }

    // TEST CODE
    const item = this.gearList.findGearBySlot('Cloak', 'Accomplice');
    this.set('Cloak', item);
  }

  set(slot: string, item: Item) {
    this.slots.get(slot).next(item);
  }

  getSlot(slot: string) {
    const val = this.slots.get(slot);
    if (val) {
      return val.asObservable();
    }

    return null;
  }
}
