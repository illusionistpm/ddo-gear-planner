import { Injectable } from '@angular/core';

import items from '../assets/items.json';

@Injectable({
  providedIn: 'root'
})
export class GearDbService {
  private gear: Map<string, Array<object>>;

  constructor(
  ) {
  }

  getGearList() {
    if (!this.gear) {
      this.gear = new Map<string, Array<object>>();
    }
    if (!this.gear.size) {
      for (const item of items) {
        if (!this.gear.has(item.category)) {
          this.gear.set(item.category, new Array<object>());
        }
        this.gear.get(item.category).push(item);
      }

    }
    return this.gear;
  }

  getGearByType(type) {
    return this.gear[type];
  }
}
