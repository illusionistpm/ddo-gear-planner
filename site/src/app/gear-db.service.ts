import { Injectable } from '@angular/core';

import { Item } from './item';

import items from 'src/assets/items.json';

@Injectable({
  providedIn: 'root'
})
export class GearDbService {
  private gear: Map<string, Array<Item>>;

  constructor() {
    this.gear = new Map<string, Array<Item>>();

    for (const item of items) {
      if (!this.gear.has(item.slot)) {
        this.gear.set(item.slot, new Array<Item>());
      }
      this.gear.get(item.slot).push(new Item(item));
    }
  }

  getGearList() {
    return this.gear;
  }

  getGearBySlot(type: string) {
    return this.gear.get(type);
  }

  getSlots() {
    return Array.from(this.gear.keys());
  }

  findGearBySlot(type: string, name: string) {
    return this.getGearBySlot(type).find(e => e.name === name);
  }
}
