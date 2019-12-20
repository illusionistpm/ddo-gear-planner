import { Injectable } from '@angular/core';

import { Item } from './item';

import { GearDbService } from './gear-db.service';

@Injectable({
  providedIn: 'root'
})
export class EquippedService {
  private slots: Map<string, Item>;

  constructor(
    private gearList: GearDbService
  ) {
    this.slots = new Map();
    for (const slot of gearList.getSlots()) {
      this.slots.set(slot, undefined);
    }
  }

  set(slot: string, item: Item) {
    this.slots.set(slot, item);
  }

  getSlot(slot: string) {
    return this.slots.get(slot);
  }
}
