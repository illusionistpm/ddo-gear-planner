import { Injectable, isDevMode } from '@angular/core';
import { Router } from '@angular/router';

import { Item } from './item';

import { GearDbService } from './gear-db.service';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class EquippedService {
  private slots: Map<string, BehaviorSubject<Item>>;
  private dummyItem: Item;
  private importantAffixes: Set<string>;

  private coveredAffixes: BehaviorSubject<Map<string, Array<any>>>; // affix -> [{bonusType, value}]

  constructor(
    private gearList: GearDbService,
    private readonly router: Router
  ) {
    this.coveredAffixes = new BehaviorSubject<Map<string, Array<any>>>(new Map<string, Array<any>>());

    this.importantAffixes = new Set(['Constitution', 'Intelligence', 'Nullification', 'Spell Penetration']);

    this.dummyItem = new Item(null);
    this.slots = new Map();
    for (const slot of gearList.getSlots()) {
      this.slots.set(slot, new BehaviorSubject(null));
    }

    for (const slot of this.slots) {
      slot[1].subscribe(v => { this._updateCoveredAffixes(); });
    }
  }

  loadDefaults() {
    let item = this.gearList.findGearBySlot('Cloak', 'Accomplice');
    this.set(item);

    item = this.gearList.findGearBySlot('Offhand', 'Legendary Stygian Wrath');
    this.set(item);
  }

  updateFromParams(params) {
    for (const key of Object.keys(params)) {
      if (key === 'tracked') {
        this.setImportantAffixes(params[key]);
      } else {
        const itemName = params[key];
        const item = this.gearList.findGearBySlot(key, itemName);
        if (item) {
          this._set(item);
        } else {
          console.log('Can\'t find ' + itemName + ' for slot ' + key);
        }
      }
    }
  }

  _set(item: Item) {
    this.slots.get(item.slot).next(item);
  }

  _updateRouterState() {
    const params = {};
    for (const kv of this.slots) {
      if (kv[1].getValue()) {
        params[kv[0]] = kv[1].getValue().name;
      }
    }

    params['tracked'] = Array.from(this.importantAffixes);

    this.router.navigate([], { queryParams: params });
  }

  set(item: Item) {
    this._set(item);

    this._updateRouterState();
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

  setImportantAffixes(affixes) {
    this.importantAffixes = new Set(affixes);
    this._updateCoveredAffixes();
  }

  addImportantAffix(affix) {
    this.importantAffixes.add(affix);
    this._updateCoveredAffixes();
  }

  removeImportantAffix(affix) {
    this.importantAffixes.delete(affix);
    this._updateCoveredAffixes();
  }

  private _updateCoveredAffixes() {
    const newMap = new Map<string, Array<any>>();

    const importantAffixes = this.getImportantAffixes();
    for (const affix of importantAffixes) {
      const affixName = affix[0];
      const affixTypes = affix[1];

      const array = new Array<object>();
      for (const type of affixTypes) {
        const bestVal = this.getBestValue(affixName, type);
        array.push({ bonusType: type, value: bestVal });
      }
      newMap.set(affixName, array);
    }

    this.coveredAffixes.next(newMap);
    this._updateRouterState();
  }
}
