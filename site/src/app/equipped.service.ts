import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';

import { Item } from './item';
import { Affix } from './affix';
import { AffixRank } from './affix-rank.enum';

import { GearDbService } from './gear-db.service';
import { QueryParamsService } from './query-params.service';

@Injectable({
  providedIn: 'root'
})
export class EquippedService {
  private slots: Map<string, BehaviorSubject<Item>>;
  private importantAffixes: Set<string>;

  private unlockedSlots: Set<string>;

  private coveredAffixes: BehaviorSubject<Map<string, Array<any>>>; // affix -> [{bonusType, value}]

  private params: BehaviorSubject<any>;

  constructor(
    private gearList: GearDbService,
    private queryParams: QueryParamsService
  ) {
    this.unlockedSlots = new Set(gearList.getSlots());
    this.coveredAffixes = new BehaviorSubject<Map<string, Array<any>>>(new Map<string, Array<any>>());

    this.importantAffixes = new Set();

    this.slots = new Map();
    for (const slot of gearList.getSlots()) {
      this.slots.set(slot, new BehaviorSubject(null));
    }

    this.params = new BehaviorSubject<any>(null);

    this.queryParams.register(this, this.params);
    this.queryParams.subscribe(this);
  }

  updateFromParams(params) {
    const craftingParams = new Array<any>();

    for (const key of params.keys) {
      if (key === 'tracked') {
        this.setImportantAffixes(params.getAll(key));
      } else if (key.startsWith('craft_')) {
        const parts = key.split('_');
        if (parts.length !== 3) {
          console.log('Bad crafting key: ' + key);
          continue;
        }
        const index = Number(parts[1]);
        if (craftingParams.length <= index) {
          craftingParams.length = index + 1;
        }
        let craftingParam = craftingParams[index];
        if (!craftingParam) {
          craftingParam = new Object();
          craftingParams[index] = craftingParam;
        }
        craftingParam[parts[2]] = params.get(key);


      } else if (this.gearList.getSlots().find(v => v === key)) {
        const itemName = params.get(key);
        const item = this.gearList.findGearBySlot(key, itemName);
        if (item) {
          this._set(item);
        } else {
          console.log('Can\'t find ' + itemName + ' for slot ' + key);
        }
      }
    }

    for (const craftingParam of craftingParams) {
      const itemSubj = this.slots.get(craftingParam['slot']);
      const item = itemSubj.getValue();
      if (!item) {
        console.log('Couldn\'t set craftable. No item in ' + craftingParam['slot']);
        continue;
      }
      const crafting = item.getCraftingByName(craftingParam['system']);
      if (!crafting) {
        console.log('Couldn\'t set craftable. No system called ' + craftingParam['system']);
        continue;
      }
      if(!crafting.selectByFirstAffixName(craftingParam['selected'])) {
        console.log('Couldn\'t set craftable. Couldn\'t find affix called ' + craftingParam['selected']);
        continue;
      }
    }

    for (const lockedSlot of params.getAll('locked')) {
      this.setLock(lockedSlot, true);
    }

    // Don't subscribe until after we've parsed the URL; otherwise we just overwrite what the user gave us.
    for (const slot of this.slots) {
      slot[1].subscribe(v => { this._updateCoveredAffixes(); });
    }
  }

  _updateRouterState() {
    const params = {};
    let craftingIdx = 0;
    for (const kv of this.slots) {
      const slot = kv[0];
      const item = kv[1].getValue();
      if (item) {
        params[slot] = item.name;

        if (item.crafting) {
          for (const crafting of item.crafting) {
            if (crafting.selected.affixes.length) {
              params['craft_' + craftingIdx + "_slot"] = slot;
              params['craft_' + craftingIdx + "_system"] = crafting.name;
              params['craft_' + craftingIdx + "_selected"] = crafting.selected.affixes[0].name;
              craftingIdx++;
            }
          }
        }
      }
    }

    params['locked'] = this.getLockedSlots();

    params['tracked'] = Array.from(this.importantAffixes);

    this.params.next(params);
  }

  _set(item: Item) {
    this.slots.get(item.slot).next(item);
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

  getSlots() {
    const slots = new Map<string, Observable<Item>>();
    for (const pair of this.slots.entries()) {
      slots.set(pair[0], pair[1].asObservable());
    }

    return slots;
  }

  getSlotNames() {
    const slots = new Array<string>();
    for (const slot of this.slots.keys()) {
      slots.push(slot);
    }

    return slots;
  }

  getCoveredAffixes() {
    return this.coveredAffixes.asObservable();
  }

  getActiveSets() {
    const setCounts = new Map<string, number>();
    for (const slot of this.slots.values()) {
      const item = slot.getValue();
      if (item && item.set) {
        let val = setCounts.get(item.set);
        if (!val) {
          val = 0;
        }
        setCounts.set(item.set, val + 1);
      }
    }
    return setCounts;
  }

  getActiveSetBonuses() {
    const setToAffixes = new Array<[string, Array<Affix>]>();
    for (const pair of this.getActiveSets().entries()) {
      const aff = this.gearList.getSetBonus(pair[0], pair[1]);
      setToAffixes.push([pair[0], aff]);
    }

    return setToAffixes;
  }

  private getValuesForAffixType(affixName: string, bonusType: string) {
    const values = [];
    for (const slot of this.slots) {
      if (slot[1].getValue()) {
        for (const affix of slot[1].getValue().getActiveAffixes()) {
          if (affix.name === affixName && affix.type === bonusType) {
            values.push({ slot, value: affix.value });
          }
        }
      }
    }

    for (const setToAffixes of this.getActiveSetBonuses()) {
      for (const affix of setToAffixes[1]) {
        if (affix.name === affixName && affix.type === bonusType) {
          values.push({ slot: 'set', value: affix.value });
        }
      }
    }

    return values.sort((a, b) => b.value - a.value);
  }

  private _getBestValueForAffixType(affixName: string, bonusType: string) {
    const arr = this.getValuesForAffixType(affixName, bonusType);
    if (arr.length) {
      return arr[0].value;
    }

    return 0;
  }

  private _getTotalValueForAffixTestingItem(affixName: string, testItem: Item) {
    const map = new Map<string, number>();

    for (const slot of this.slots) {
      const item = (testItem && (slot[0] === testItem.slot)) ? testItem : slot[1].getValue();
      if (item) {
        for (const affix of item.getActiveAffixes()) {
          if (affix.name === affixName) {
            if (!map.get(affix.type) || map.get(affix.type) < affix.value) {
              map.set(affix.type, affix.value);
            }
            break;
          }
        }
      }
    }

    const total = Array.from(map.values()).reduce((acc, val) => acc + val, 0);
    return total;
  }

  isEquipped(item: Item) {
    if (!item || !this.slots.get(item.slot).getValue()) {
      return false;
    }
    return item.name === this.slots.get(item.slot).getValue().name;
  }

  setLock(slot: string, lock: boolean) {
    if (this.unlockedSlots.has(slot)) {
      if (lock) {
        this.unlockedSlots.delete(slot);
      }
    } else if (!lock) {
      this.unlockedSlots.add(slot);
    }
    
    this._updateRouterState();
  }

  toggleLock(slot: string) {
    if (this.unlockedSlots.has(slot)) {
      this.unlockedSlots.delete(slot);
    } else {
      this.unlockedSlots.add(slot);
    }
    
    this._updateRouterState();
  }

  isLocked(slot: string) {
    return !this.unlockedSlots.has(slot);
  }

  getLockedSlots() {
    const lockedSlots = [];
    for (const slot of this.getSlotNames()) {
      if (!this.unlockedSlots.has(slot)) {
        lockedSlots.push(slot);
      }
    }
    return lockedSlots;
  }

  getUnlockedSlots() {
    return this.unlockedSlots;
  }

  getScore(item: Item) {
    let score = 0;
    for (const affix of item.getActiveAffixes()) {
      if (this.importantAffixes.has(affix.name)) {

        const dummyItem = new Item(null);
        dummyItem.slot = item.slot;

        const valWithNewItem = this._getTotalValueForAffixTestingItem(affix.name, item);
        const valWithCurItem = this._getTotalValueForAffixTestingItem(affix.name, dummyItem);

        const improvement = valWithNewItem - valWithCurItem;

        const bestVal = this.gearList.getBestValueForAffix(affix.name);
        score += improvement / bestVal;
      }
    }

    return score;
  }

  private _getImportantAffixesToTypes() {
    const important = new Map<string, Map<string, number>>();
    for (const affixName of this.importantAffixes) {
      important.set(affixName, this.gearList.affixToBonusTypes.get(affixName));
    }
    return important;
  }

  getImportantAffixes() {
    return this.importantAffixes;
  }

  setImportantAffixes(affixes) {
    this.importantAffixes = new Set(affixes);
    this._updateCoveredAffixes();
  }

  addImportantAffix(affix) {
    if (!this.importantAffixes.has(affix)) {
      this.importantAffixes.add(affix);
      this._updateCoveredAffixes();
    }
  }

  removeImportantAffix(affix) {
    if (this.importantAffixes.has(affix)) {
      this.importantAffixes.delete(affix);
      this._updateCoveredAffixes();
    }
  }

  toggleImportantAffix(affix) {
    if (this.isImportantAffix(affix)) {
      this.removeImportantAffix(affix);
    } else {
      this.addImportantAffix(affix);
    }
  }

  isImportantAffix(affix) {
    return this.importantAffixes.has(affix);
  }

  getAffixRanking(affix: Affix) {
    // The crafting guys are being passed in too, and they aren't actually affixes. Will have to sort that out.
    if (!affix) {
      return AffixRank.Irrelevant;
    }

    if (affix.type === 'Penalty') {
      return AffixRank.Penalty;
    }

    if (!this.importantAffixes.has(affix.name)) {
      return AffixRank.Irrelevant;
    }

    const values = this.getValuesForAffixType(affix.name, affix.type);

    if (values.length === 0 || affix.value > values[0].value) {
      return AffixRank.BetterThanBest;
    } else if (affix.value === values[0].value) {
      if (values.length === 1 || affix.value > values[1].value) {
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

    const importantAffixes = this._getImportantAffixesToTypes();
    for (const affix of importantAffixes) {
      const affixName = affix[0];
      const affixTypes = affix[1];

      const array = new Array<object>();
      for (const type of affixTypes.keys()) {
        const bestVal = this._getBestValueForAffixType(affixName, type);
        array.push({ bonusType: type, value: bestVal });
      }
      newMap.set(affixName, array);
    }

    this.coveredAffixes.next(newMap);
    this._updateRouterState();
  }
}
