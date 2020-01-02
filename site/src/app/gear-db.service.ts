import { Injectable } from '@angular/core';

import { Item } from './item';

import itemsList from 'src/assets/items.json';

@Injectable({
  providedIn: 'root'
})
export class GearDbService {
  private gear: Map<string, Array<Item>>;
  affixToBonusTypes: Map<string, Set<string>>;

  constructor() {
    this.filterByLevelRange(1, 30);
  }

  filterByLevelRange(minLevel: number, maxLevel: number) {
    this.gear = new Map<string, Array<Item>>();
    this.affixToBonusTypes = new Map<string, Set<string>>();

    for (const item of itemsList) {
      if (Number(item.ml) < minLevel || Number(item.ml) > maxLevel) {
        continue;
      }

      if (!this.gear.has(item.slot)) {
        this.gear.set(item.slot, new Array<Item>());
      }
      this.gear.get(item.slot).push(new Item(item));
    }

    for (const items of this.gear.values()) {
      for (const item of items) {
        for (const affix of item.affixes) {
          if (!this.affixToBonusTypes.has(affix.name)) {
            this.affixToBonusTypes.set(affix.name, new Set<string>());
          }

          this.affixToBonusTypes.get(affix.name).add(affix.type);
        }
      }
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

  findGearWithAffixAndType(affixName, bonusType) {
    const results = [];
    for (const items of this.gear.values()) {
      for (const item of items) {
        for (const affix of item.affixes) {
          if (affix.name === affixName && affix.type === bonusType) {
            results.push(item);
            break;
          }
        }
      }
    }

    return results;
  }

  getAllAffixes() {
    return this.affixToBonusTypes.keys();
  }
}
