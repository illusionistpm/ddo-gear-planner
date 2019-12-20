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
      if (!this.gear.has(item.category)) {
        this.gear.set(item.category, new Array<Item>());
      }
      this.gear.get(item.category).push(new Item(item));
    }
  }

  getGearList() {
    return this.gear;
  }

  getGearBySlot(type) {
    return this.gear[type];
  }

  getSlots() {
    return Array.from(this.gear.keys());
  }
}
