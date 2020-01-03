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

      const slot = item.slot === 'Ring' ? 'Ring1' : item.slot;

      if (!this.gear.has(slot)) {
        this.gear.set(slot, new Array<Item>());
      }
      this.gear.get(slot).push(new Item(item));
    }

    this.gear.set('Ring2', this.gear.get('Ring1'));

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

  private getSortIndex(slot: string) {
    switch(slot) {
      case 'Weapon': return 1;
      case 'Offhand': return 2;
      default: return 3;
    }
  }

  getSlots() {
    return Array.from(this.gear.keys()).sort((a, b) => {
      const idxA = this.getSortIndex(a);
      const idxB = this.getSortIndex(b);

      if(idxA === idxB) {
        return a.localeCompare(b);
      } else {
        return idxA - idxB;
      }

    });
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
