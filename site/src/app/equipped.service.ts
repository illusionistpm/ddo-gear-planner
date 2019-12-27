import { Injectable, isDevMode } from '@angular/core';

import { Item } from './item';

import { GearDbService } from './gear-db.service';
import { BehaviorSubject } from 'rxjs';
import { Affix } from './affix';

@Injectable({
  providedIn: 'root'
})
export class EquippedService {
  private slots: Map<string, BehaviorSubject<Item>>;
  private dummyItem: Item;

  private coveredAffixes: BehaviorSubject<Map<string, Array<any>>>; // affix -> [{bonusType, value}]

  constructor(
    private gearList: GearDbService
  ) {
    this.coveredAffixes = new BehaviorSubject<Map<string, Array<any>>>(new Map<string, Array<any>>());

    this.dummyItem = new Item(null);
    this.slots = new Map();
    for (const slot of gearList.getSlots()) {
      this.slots.set(slot, new BehaviorSubject(null));
    }

    for (const slot of this.slots) {
      slot[1].subscribe(v => { this.updateCoveredAffixes(); });
    }

    // TEST CODE
    if (isDevMode()) {
      let item = this.gearList.findGearBySlot('Cloak', 'Accomplice');
      this.set('Cloak', item);

      item = this.gearList.findGearBySlot('Offhand', 'Legendary Stygian Wrath');
      this.set('Offhand', item);
    }
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

  getCoveredAffixes() {
    return this.coveredAffixes.asObservable();
  }

  private getBestValue(affixName: string, bonusType: string) {
    let max = null;
    for (const slot of this.slots) {
      if (slot[1].getValue()) {
        for (const affix of slot[1].getValue().affixes) {
          if (affix.name === affixName && affix.type === bonusType) {
            if (affix.value > max) {
              max = affix.value;
            }
            break;
          }
        }
      }
    }
    return max;
  }

  private updateCoveredAffixes() {
    const newMap = new Map<string, Array<any>>();

    const importantAffixes = this.gearList.getImportantAffixes();
    for (const affix of importantAffixes) {
      const affixName = affix[0];
      const affixTypes = affix[1];

      const array = new Array<object>();
      for (const type of affixTypes) {
        const bestVal = this.getBestValue(affixName, type);
        array.push({bonusType: type, value: bestVal});
      }
      newMap.set(affixName, array);
    }

    this.coveredAffixes.next(newMap);
  }
}
