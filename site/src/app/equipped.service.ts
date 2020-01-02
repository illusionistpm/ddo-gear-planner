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
  private importantAffixes: Set<string>;

  private coveredAffixes: BehaviorSubject<Map<string, Array<any>>>; // affix -> [{bonusType, value}]

  constructor(
    private gearList: GearDbService
  ) {
    this.coveredAffixes = new BehaviorSubject<Map<string, Array<any>>>(new Map<string, Array<any>>());

    this.importantAffixes = new Set(['Constitution', 'Intelligence', 'Nullification', 'Spell Penetration']);


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
      this.loadDefaults();
    }
  }

  loadDefaults() {
    let item = this.gearList.findGearBySlot('Cloak', 'Accomplice');
    this.set('Cloak', item);

    item = this.gearList.findGearBySlot('Offhand', 'Legendary Stygian Wrath');
    this.set('Offhand', item);
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

  getImportantAffixes() {
    const important = new Map<string, Set<string>>();
    for (const affixName of this.importantAffixes) {
      important.set(affixName, this.gearList.affixToBonusTypes.get(affixName));
    }
    return important;
  }

  addImportantAffix(affix) {
    this.importantAffixes.add(affix);
    this.updateCoveredAffixes();
  }

  removeImportantAffix(affix) {
    this.importantAffixes.delete(affix);
    this.updateCoveredAffixes();
  }

  private updateCoveredAffixes() {
    const newMap = new Map<string, Array<any>>();

    const importantAffixes = this.getImportantAffixes();
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
