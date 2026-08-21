import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';

import { Item } from './item';
import { Affix } from './affix';
import { AffixRank } from './affix-rank.enum';

import { GearDbService, SetBonusThreshold } from './gear-db.service';
import { canonicalizeCraftingSystemName } from './gear-db.service';
import { QueryParamsService } from './query-params.service';
import { AffixService } from './affix.service';
import { EssenceCraftingService } from './essence-crafting.service';
import { perfCount, perfMeasure, perfStart } from './perf-trace';

const TRACKED_AFFIX_COMPANIONS = new Map<string, Array<string>>([
  ['Armor Class', ['Armor Class (%)']],
  ['False Life', ['False Life (%)']],
]);

export interface VisibleSetBonus {
  setName: string;
  pieces: number;
  tiers: Array<SetBonusThreshold>;
}

export interface AffixSource {
  kind: 'item' | 'set';
  slot: string;
  itemName: string;
  affixName: string;
  bonusType: string;
  value: number;
}

@Injectable({
  providedIn: 'root'
})
export class EquippedService {
  private slots: Map<string, BehaviorSubject<Item>>;
  private importantAffixes: Set<string>;

  private unlockedSlots: Set<string>;

  private coveredAffixes: BehaviorSubject<Map<string, Array<any>>>; // affix -> [{bonusType, value}]
  private activeSetBonuses = new BehaviorSubject<Array<[string, Array<Affix>]>>([]);
  private visibleSetBonuses = new BehaviorSubject<Array<VisibleSetBonus>>([]);
  private importantAffixesSubject = new BehaviorSubject<Set<string>>(new Set<string>());
  private batchingDerivedStateUpdates = false;
  private derivedStateDirty = false;
  private importantAffixesDirty = false;

  private params: BehaviorSubject<any>;

  constructor(
    private gearList: GearDbService,
    private queryParams: QueryParamsService,
    private affixSvc: AffixService,
    private essenceCrafting: EssenceCraftingService
  ) {
    this.unlockedSlots = new Set(gearList.getSlots());
    this.coveredAffixes = new BehaviorSubject<Map<string, Array<any>>>(new Map<string, Array<any>>());

    this.importantAffixes = new Set();

    this.slots = new Map<string, BehaviorSubject<Item>>();
    for (const slot of gearList.getSlots()) {
      this.slots.set(slot, new BehaviorSubject<Item>(new Item(null)));
    }

    this.params = new BehaviorSubject<any>(null);

    this.queryParams.register(this, this.params);
    this.queryParams.subscribe(this);

    for (const slot of this.slots) {
      slot[1].subscribe(() => {
        this.refreshDerivedStateAfterSlotChange();
      });
    }
  }

  updateFromParams(params: any) {
    return perfMeasure('EquippedService.updateFromParams', () => {
      this.beginDerivedStateBatch();
      const craftingParams = [];
      const minLevels = new Map<string, number>();

      try {
        this.setImportantAffixes(params.getAll('tracked'));

        for (const slot of this.gearList.getSlots()) {
          if (!params.get(slot)) {
            const dummy = new Item(null);
            dummy.slot = slot;
            this._set(dummy);
          }
        }

        for (const key of params.keys) {
          if (key === 'tracked') {
            continue;
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
            let craftingParam = craftingParams[index] as Record<string, string> | undefined;
            if (!craftingParam) {
              craftingParam = {};
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
          } else if (key.startsWith('ml_')) {
            const parts = key.split('_');
            if (parts.length !== 2) {
              console.log('Bad ml key: ' + key);
              continue;
            }
            minLevels.set(parts[1], +params.get(key));
          }
        }

        for (const entries of minLevels.entries()) {
          const slotSubject = this.slots.get(entries[0]);
          const item = slotSubject ? slotSubject.getValue() : null;
          if (item) {
            if (item.isEssenceCrafted()) {
              this.essenceCrafting.setItemToML(item, entries[1]);
            } else {
              item.ml = entries[1];
            }
            this._set(item);
          }
        }

        for (const craftingParam of craftingParams) {
          if (!craftingParam) {
            continue;
          }
          const itemSubj = this.slots.get(craftingParam['slot']);
          const item = itemSubj ? itemSubj.getValue() : null;
          if (!item) {
            console.log('Couldn\'t set craftable. No item in ' + craftingParam['slot']);
            continue;
          }
          const crafting = item.getCraftingByName(canonicalizeCraftingSystemName(craftingParam['system']));
          if (!crafting) {
            console.log('Couldn\'t set craftable. No system called ' + craftingParam['system']);
            continue;
          }
          if(!crafting.selectByParamDescription(craftingParam['selected'])) {
            console.log('Couldn\'t set craftable. Couldn\'t find option matching ' + craftingParam['selected']);
            continue;
          }
          this._set(item);
        }

        this._enforceOffhandCompatibility();

        // for (const lockedSlot of params.getAll('locked')) {
        //   this.setLock(lockedSlot, true);
        // }
      } finally {
        this.endDerivedStateBatch();
      }

      this._updateRouterState();
    });
  }

  private beginDerivedStateBatch() {
    this.batchingDerivedStateUpdates = true;
    this.derivedStateDirty = false;
    this.importantAffixesDirty = false;
  }

  private endDerivedStateBatch() {
    const shouldEmitImportantAffixes = this.importantAffixesDirty;
    const shouldRefreshDerivedState = this.derivedStateDirty || shouldEmitImportantAffixes;

    this.batchingDerivedStateUpdates = false;
    this.derivedStateDirty = false;
    this.importantAffixesDirty = false;

    if (shouldEmitImportantAffixes) {
      this.importantAffixesSubject.next(new Set(this.importantAffixes));
    }

    if (shouldRefreshDerivedState) {
      this.refreshDerivedState();
    }
  }

  private refreshDerivedStateAfterSlotChange() {
    if (this.batchingDerivedStateUpdates) {
      this.derivedStateDirty = true;
      return;
    }

    this.refreshDerivedState();
  }

  private emitImportantAffixesChanged() {
    if (this.batchingDerivedStateUpdates) {
      this.importantAffixesDirty = true;
      return;
    }

    this.importantAffixesSubject.next(new Set(this.importantAffixes));
    this._updateCoveredAffixes();
  }

  private refreshDerivedState() {
    this._updateCoveredAffixes(false);
    this._updateActiveSetBonuses();
  }

  _updateRouterState() {
    const done = perfStart('EquippedService._updateRouterState');
    const params: Record<string, string | number | Array<string>> = {};
    let craftingIdx = 0;
    for (const kv of this.slots) {
      const slot = kv[0];
      const item = kv[1].getValue();
      if (item) {
        params[slot] = item.name;

        if (item.isEssenceCrafted()) {
          params["ml_" + slot] = item.ml;
        }

        if (item.crafting) {
          for (const crafting of item.crafting) {
            if (crafting.selected.affixes.length || crafting.selected.set) {
              params['craft_' + craftingIdx + "_slot"] = slot;
              params['craft_' + craftingIdx + "_system"] = crafting.name;
              params['craft_' + craftingIdx + "_selected"] = crafting.selected.getParamDescription();
              craftingIdx++;
            }
          }
        }
      }
    }

    //params['locked'] = this.getLockedSlots();

    params['tracked'] = Array.from(this.importantAffixes);

    this.params.next(params);
    done({ keys: Object.keys(params).length });
  }

  _set(item: Item) {
    const slotSubject = this.slots.get(item.slot);
    if (slotSubject) {
      slotSubject.next(item);
    }
  }

  private getSlotValue(slot: string) {
    const slotSubject = this.slots.get(slot);
    return slotSubject ? slotSubject.getValue() : null;
  }

  private getMainHand() {
    return this.getSlotValue('Weapon');
  }

  private shouldEmptyOffhandForMainHand(mainHand: Item | null) {
    return !!mainHand && mainHand.isValid() && mainHand.isTwoHandedWeapon() && !mainHand.isCrossbow();
  }

  private shouldLimitOffhandToRuneArms(mainHand: Item | null) {
    return !!mainHand && mainHand.isValid() && mainHand.isTwoHandedWeapon() && mainHand.isCrossbow();
  }

  private _clearSlotWithoutRouterUpdate(slot: string) {
    const dummy = new Item(null);
    dummy.slot = slot;
    this._set(dummy);
  }

  private _enforceOffhandCompatibility() {
    const mainHand = this.getMainHand();
    const offhand = this.getSlotValue('Offhand');
    if (!offhand || !offhand.isValid()) {
      return;
    }

    if (this.shouldEmptyOffhandForMainHand(mainHand)) {
      this._clearSlotWithoutRouterUpdate('Offhand');
    } else if (this.shouldLimitOffhandToRuneArms(mainHand) && !offhand.isRuneArm()) {
      this._clearSlotWithoutRouterUpdate('Offhand');
    }
  }

  isOffhandDisabled() {
    return this.shouldEmptyOffhandForMainHand(this.getMainHand());
  }

  isOffhandRuneArmOnly() {
    return this.shouldLimitOffhandToRuneArms(this.getMainHand());
  }

  canEquip(item: Item) {
    if (!item || item.slot !== 'Offhand') {
      return true;
    }

    if (this.isOffhandDisabled()) {
      return false;
    }

    return !this.isOffhandRuneArmOnly() || item.isRuneArm();
  }

  getCompatibleGearForSlot(slot: string, gear: Array<Item>) {
    if (slot !== 'Offhand') {
      return gear;
    }

    if (this.isOffhandDisabled()) {
      return [];
    }

    if (this.isOffhandRuneArmOnly()) {
      return gear.filter(item => item.isRuneArm());
    }

    return gear;
  }

  getCompatibleGear(gear: Array<Item>) {
    return gear.filter(item => this.canEquip(item));
  }

  set(item: Item) {
    if (!this.canEquip(item)) {
      return;
    }

    const done = perfStart('EquippedService.set');
    this._set(new Item(item));
    this._enforceOffhandCompatibility();

    this._updateRouterState();
    done({ slot: item.slot, item: item.name });
  }

  clearSlot(slot: string) {
    const dummy = new Item(null);
    dummy.slot = slot;
    const slotSubject = this.slots.get(slot);
    if (slotSubject) {
      slotSubject.next(dummy);
    }
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

  getSlotsSnapshot() : Map<string, Item> {
    const slots = new Map<string, Item>();
    for (const pair of this.slots.entries()) {
      slots.set(pair[0], pair[1].value);
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
    perfCount('EquippedService.getActiveSets');
    const setCounts = new Map<string, number>();

    for (const slot of this.slots.values()) {
      const item = slot.getValue();

      if (item && item.getSets()) {
        for (const set of item.getSets()) {

          let val = setCounts.get(set);

          if (!val) {
            val = 0;
          }

          setCounts.set(set, val + 1);
        }
      }
    }

    return setCounts;
  }

  private _updateActiveSetBonuses() {
    const setToAffixes = new Array<[string, Array<Affix>]>();
    const visibleSetBonuses = new Array<VisibleSetBonus>();
    for (const pair of this.getActiveSets().entries()) {
      const aff = this.gearList.getSetBonus(pair[0], pair[1]);
      setToAffixes.push([pair[0], aff]);
      visibleSetBonuses.push({
        setName: pair[0],
        pieces: pair[1],
        tiers: this.gearList.getSetBonusThresholdDetails(pair[0], pair[1])
      });
    }
    this.activeSetBonuses.next(setToAffixes);
    this.visibleSetBonuses.next(visibleSetBonuses);
  }

  getActiveSetBonuses() {
    return this.activeSetBonuses.getValue();
  }

  getActiveSetBonusesObservable() {
    return this.activeSetBonuses.asObservable();
  }

  getVisibleSetBonusesObservable() {
    return this.visibleSetBonuses.asObservable();
  }

  private getValuesForAffixType(affixName: string, bonusType: string) {
    const values: Array<{ slot: string; value: number }> = [];
    for (const slot of this.slots) {
      const slotValue = slot[1].getValue();
      if (slotValue) {
        for (const affix of this.affixSvc.getActiveAffixes(slotValue)) {
          if (affix.name === affixName && affix.type === bonusType) {
            values.push({ slot: slot[0], value: affix.value });
          }
        }
      }
    }

    for (const setToAffixes of this.getActiveSetBonuses()) {
      for (const affix of setToAffixes[1]) {
        if (this.affixSvc.resolvesToAffix(affix.name, affixName) && affix.type === bonusType) {
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

  getCurrentValueForAffixType(affixName: string, bonusType: string) {
    return this._getBestValueForAffixType(affixName, bonusType);
  }

  getSourcesForAffixType(affixName: string, bonusType: string): AffixSource[] {
    const bestValue = this._getBestValueForAffixType(affixName, bonusType);
    if (!bestValue) {
      return [];
    }

    const sources: AffixSource[] = [];
    for (const slot of this.slots) {
      const item = slot[1].getValue();
      if (!item || !item.isValid()) {
        continue;
      }

      for (const affix of this.affixSvc.getActiveAffixes(item)) {
        if (affix.name === affixName && affix.type === bonusType && affix.value === bestValue) {
          sources.push({
            kind: 'item',
            slot: slot[0],
            itemName: item.name,
            affixName: affix.name,
            bonusType: affix.type,
            value: affix.value
          });
        }
      }
    }

    for (const setToAffixes of this.getActiveSetBonuses()) {
      for (const affix of setToAffixes[1]) {
        if (this.affixSvc.resolvesToAffix(affix.name, affixName) && affix.type === bonusType && affix.value === bestValue) {
          sources.push({
            kind: 'set',
            slot: 'Set',
            itemName: setToAffixes[0],
            affixName: affix.name,
            bonusType: affix.type,
            value: affix.value
          });
        }
      }
    }

    return sources;
  }

  private _getTotalValueForAffixTestingItem(affixName: string, testItem: Item) {
    const map = new Map<string, number>();

    for (const slot of this.slots) {
      const item = (testItem && (slot[0] === testItem.slot)) ? testItem : slot[1].getValue();
      if (item) {
        for (const affix of this.affixSvc.getActiveAffixes(item)) {
          if (this.affixSvc.resolvesToAffix(affix.name, affixName)) {
            const existing = map.get(affix.type) ?? 0;
            if (existing < affix.value) {
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

  hasItem(slot: string) {
    const slotSubject = this.slots.get(slot);
    const item = slotSubject ? slotSubject.getValue() : null;
    return item && item.isValid();
  }

  isEquipped(item: Item) {
    if (!item) {
      return false;
    }
    const slotSubject = this.slots.get(item.slot);
    const itemAtSlot = slotSubject ? slotSubject.getValue() : null;
    if (!itemAtSlot) {
      return false;
    }
    return item.name === itemAtSlot.name;
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
    //return !this.unlockedSlots.has(slot);
    return this.hasItem(slot) || (slot === 'Offhand' && this.isOffhandDisabled());
  }

  getLockedSlots() {
    const lockedSlots = [];
    for (const slot of this.getSlotNames()) {
      if (this.isLocked(slot)) {
        lockedSlots.push(slot);
      }
    }
    return lockedSlots;
  }

  getUnlockedSlots() {
    //return this.unlockedSlots;
    const unlockedSlots = new Set<string>();
    for (const slot of this.getSlotNames()) {
      if (!this.isLocked(slot)) {
        unlockedSlots.add(slot);
      }
    }
    return unlockedSlots;
  }

  getScore(item: Item) {
    let score = 0;
    for (const affix of this.affixSvc.getActiveAffixes(item)) {
      if (this.importantAffixes.has(affix.name)) {

        const dummyItem = new Item(null);
        dummyItem.slot = item.slot;

        const valWithNewItem = this._getTotalValueForAffixTestingItem(affix.name, item);
        const valWithCurItem = this._getTotalValueForAffixTestingItem(affix.name, dummyItem);

        const improvement = valWithNewItem - valWithCurItem;

        const bestVal = this.gearList.getBestValueForAffix(affix.name);

        const affixWeight = this.gearList.getAffixWeight(affix.name, bestVal);

        score += improvement / bestVal * affixWeight;
      }
    }

    return score;
  }

  private _getImportantAffixesToTypes() {
    const important = new Map<string, Map<string, number>>();
    for (const affixName of this.importantAffixes) {
      let bonusTypes = this.gearList.affixToBonusTypes.get(affixName);
      if (!bonusTypes) {
        bonusTypes = new Map<string, number>();
      }
      important.set(affixName, bonusTypes);
    }
    return important;
  }

  getImportantAffixes() {
    return this.importantAffixes;
  }

  getImportantAffixesObservable() {
    return this.importantAffixesSubject.asObservable();
  }

  private getTrackedAffixFamily(affix: string) {
    const canonicalAffix = this.affixSvc.getCanonicalName(affix);
    return [canonicalAffix, ...(TRACKED_AFFIX_COMPANIONS.get(canonicalAffix) || [])];
  }

  private expandTrackedAffixes(affixes: Iterable<string>) {
    const expanded = new Set<string>();
    for (const affix of affixes) {
      for (const trackedAffix of this.getTrackedAffixFamily(affix)) {
        expanded.add(trackedAffix);
      }
    }
    return expanded;
  }

  setImportantAffixes(affixes: Array<string>) {
    this.importantAffixes = this.expandTrackedAffixes(affixes);
    this.emitImportantAffixesChanged();
  }

  addImportantAffix(affix: string) {
    const trackedAffixes = this.getTrackedAffixFamily(affix);
    const addedAffixes = trackedAffixes.filter(trackedAffix => !this.importantAffixes.has(trackedAffix));
    if (trackedAffixes.some(trackedAffix => !this.importantAffixes.has(trackedAffix))) {
      for (const trackedAffix of trackedAffixes) {
        this.importantAffixes.add(trackedAffix);
      }
      this.importantAffixesSubject.next(new Set(this.importantAffixes));
      this._updateCoveredAffixes();
    }
    return addedAffixes;
  }

  removeImportantAffix(affix: string) {
    const trackedAffixes = this.getTrackedAffixFamily(affix);
    const removedAffixes = trackedAffixes.filter(trackedAffix => this.importantAffixes.has(trackedAffix));
    if (trackedAffixes.some(trackedAffix => this.importantAffixes.has(trackedAffix))) {
      for (const trackedAffix of trackedAffixes) {
        this.importantAffixes.delete(trackedAffix);
      }
      this.importantAffixesSubject.next(new Set(this.importantAffixes));
      this._updateCoveredAffixes();
    }
    return removedAffixes;
  }

  toggleImportantAffix(affix: string) {
    if (this.isImportantAffix(affix)) {
      this.removeImportantAffix(affix);
    } else {
      this.addImportantAffix(affix);
    }
  }

  isImportantAffix(affix: string) {
    perfCount('EquippedService.isImportantAffix');
    return this.importantAffixes.has(affix);
  }

  getAffixRanking(affix: Affix) {
    perfCount('EquippedService.getAffixRanking');
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

  private _updateCoveredAffixes(updateRouterState = true) {
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
    if (updateRouterState) {
      this._updateRouterState();
    }
  }

  public getGearDescription() {
    let msg = '';
    for (const itemSubj of this.slots.values()) {
      const item = itemSubj && itemSubj.getValue();
      if (item) {
        msg += item.slot + ': ' + item.name + "\n";
        if (item.crafting) {
          for (const crafting of item.crafting) {
            msg += ' - ' + crafting.name + ': ';
            if (crafting.selected) {
               msg += crafting.selected.describe();
            }
            msg += "\n";
          }
        }
      }
    }
    return msg;
  }
}
