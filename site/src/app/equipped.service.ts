import { Injectable } from '@angular/core';
import { Router } from '@angular/router';

import { Item } from './item';
import { Affix } from './affix';
import { AffixRank } from './affix-rank.enum';

import { GearDbService } from './gear-db.service';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class EquippedService {
  private slots: Map<string, BehaviorSubject<Item>>;
  private importantAffixes: Set<string>;

  private unlockedSlots: Set<string>;

  private coveredAffixes: BehaviorSubject<Map<string, Array<any>>>; // affix -> [{bonusType, value}]

  constructor(
    private gearList: GearDbService,
    private readonly router: Router
  ) {
    this.unlockedSlots = new Set(gearList.getSlots());
    this.coveredAffixes = new BehaviorSubject<Map<string, Array<any>>>(new Map<string, Array<any>>());

    this.importantAffixes = new Set(['Constitution']);

    this.slots = new Map();
    for (const slot of gearList.getSlots()) {
      this.slots.set(slot, new BehaviorSubject(null));
    }
  }

  loadDefaults() {
    let item = this.gearList.findGearBySlot('Cloak', 'Accomplice');
    this.set(item);

    item = this.gearList.findGearBySlot('Offhand', 'Legendary Stygian Wrath');
    this.set(item);
  }

  updateFromParams(params) {
    for (const key of params.keys) {
      if (key === 'tracked') {
        this.setImportantAffixes(params.getAll(key));
      } else {
        const itemName = params.get(key);
        const item = this.gearList.findGearBySlot(key, itemName);
        if (item) {
          this._set(item);
        } else {
          console.log('Can\'t find ' + itemName + ' for slot ' + key);
        }
      }
    }

    // Don't subscribe until after we've parsed the URL; otherwise we just overwrite what the user gave us.
    for (const slot of this.slots) {
      slot[1].subscribe(v => { this._updateCoveredAffixes(); });
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

  private getValuesForAffixType(affixName: string, bonusType: string) {
    const values = [];
    for (const slot of this.slots) {
      if (slot[1].getValue()) {
        for (const affix of slot[1].getValue().getActiveAffixes()) {
          if (affix.name === affixName && affix.type === bonusType) {
            values.push({slot: slot, value: affix.value});
          }
        }
      }
    }
    return values.sort((a, b) => a - b);
  }

  private _getBestValue(affixName: string, bonusType: string) {
    let max = null;
    for (const slot of this.slots) {
      if (slot[1].getValue()) {
        for (const affix of slot[1].getValue().getActiveAffixes()) {
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

  toggleLock(slot: string) {
    if (this.unlockedSlots.has(slot)) {
      this.unlockedSlots.delete(slot);
    } else {
      this.unlockedSlots.add(slot);
    }

  }

  isLocked(slot: string) {
    return !this.unlockedSlots.has(slot);
  }

  getUnlockedSlots() {
    return this.unlockedSlots;
  }

  private _getImportantAffixes() {
    const important = new Map<string, Map<string, number>>();
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

  getAffixRanking(affix: Affix) {
    // The crafting guys are being passed in too, and they aren't actually affixes. Will have to sort that out.
    if(!affix) {
      return AffixRank.Irrelevant;
    }

    if (!this.importantAffixes.has(affix.name)) {
      return AffixRank.Irrelevant;
    }

    const values = this.getValuesForAffixType(affix.name, affix.type);

    if (values.length == 0 || affix.value > values[0].value) {
      return AffixRank.BetterThanBest;
    } else if (affix.value === values[0].value) {
      if (values.length === 1 || values[1] < affix.value) {
        return AffixRank.Best;
      } else {
        return AffixRank.BestTied;
      }
    } else {
      return AffixRank.Outranked;
    }
  }

  private _updateCoveredAffixes() {
    // affixName => Array of {bonusType, Array of {slot: value}}
    const newMap = new Map<string, Array<any>>();

    // for (const item of this.slots.values()) {
    //   if (item.getValue()) {
    //     for (const affix of item.getValue().affixes) {
    //       if (!newMap.has(affix.name)) {
    //         newMap.set(affix.name, []);
    //       }
    //       const bonusList = newMap.get(affix.name);
    //       if (!bonusList.includes(affix.type)) {
    //         bonusList.push({ type: affix.type, slots: [] });
    //       }
    //       let listForBonusType = bonusList.find(affix.type);
    //       if (listForBonusType.)

    //     }
    //   }
    // }

    const importantAffixes = this._getImportantAffixes();
    for (const affix of importantAffixes) {
      const affixName = affix[0];
      const affixTypes = affix[1];

      const array = new Array<object>();
      for (const type of affixTypes.keys()) {
        const bestVal = this._getBestValue(affixName, type);
        array.push({ bonusType: type, value: bestVal });
      }
      newMap.set(affixName, array);
    }

    this.coveredAffixes.next(newMap);
    this._updateRouterState();
  }
}
