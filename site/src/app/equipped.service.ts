import { Injectable, NgZone } from '@angular/core';
import { Observable, BehaviorSubject, Subject } from 'rxjs';

import { Item } from './item';
import { Affix } from './affix';
import { AffixRank } from './affix-rank.enum';

import { GearDbService, SetBonusThreshold } from './gear-db.service';
import { canonicalizeCraftingSystemName } from './gear-db.service';
import { ParamsAdapter, QueryParamRecord, QueryParamsListener, QueryParamsService } from './query-params.service';
import {
  getStoredActiveTab,
  getStoredCollapsedTrackedAffixGroups,
  getStoredTrackedAffixGroupMode,
  storeActiveTab,
  storeCollapsedTrackedAffixGroups,
  storeTrackedAffixGroupMode
} from './planner-view-state-storage';
import { getMlSlotFromKey, isCraftKey, isMlKey, parseCraftKey } from './build-param-keys';
import { AffixService } from './affix.service';
import { AffixAvailabilityService } from './affix-availability.service';
import { EssenceCraftingService } from './essence-crafting.service';
import { perfCount, perfMeasure, perfStart } from './perf-trace';
import { CoveredBonusType, moderateValueThreshold } from './tracked-affix-derivation';
import { ExternalAffixEntry, isExternalAffixEntry } from './external-affix';

const TRACKED_AFFIX_COMPANIONS = new Map<string, Array<string>>([
  ['Armor Class', ['Armor Class (%)']],
  ['False Life', ['False Life (%)']],
]);

/** Minimal shape of the browser's IdleDeadline, used without a lib.dom dependency. */
interface IdleWorkDeadline {
  timeRemaining(): number;
}

/**
 * Runs `work` when the browser is idle (falling back to setTimeout on
 * engines without requestIdleCallback, e.g. Safari) rather than as soon as
 * possible, so it never competes with rendering the way a chain of
 * setTimeout(0) calls can. Given a timeout, the browser runs it anyway once
 * that long has passed without a genuine idle period, so a busy page doesn't
 * indefinitely starve the warmup of the chance to ever make progress. `work`
 * gets the real IdleDeadline (or a synthetic one good for ~5ms on the
 * setTimeout fallback) so callers can drain as much as actually fits in the
 * slice instead of assuming a fixed batch size.
 */
function scheduleIdleWork(work: (deadline: IdleWorkDeadline) => void, timeoutMs = 50): void {
  const w = window as unknown as {
    requestIdleCallback?: (cb: (deadline: IdleWorkDeadline) => void, opts?: { timeout: number }) => number
  };
  if (w.requestIdleCallback) {
    w.requestIdleCallback(work, { timeout: timeoutMs });
  } else {
    const deadline = performance.now() + 5;
    setTimeout(() => work({ timeRemaining: () => Math.max(0, deadline - performance.now()) }), 0);
  }
}

// Bonus per equipped piece of a set that is the *only* source of an uncovered
// tracked need. Small on purpose: it should reorder pieces within a slot, not
// swamp the affix-value signal.
const SET_PIECE_NUDGE = 0.6;

export interface VisibleSetBonus {
  setName: string;
  pieces: number;
  tiers: Array<SetBonusThreshold>;
}

export interface AffixSource {
  kind: 'item' | 'set' | 'external';
  slot: string;
  itemName: string;
  affixName: string;
  bonusType: string;
  value: number;
}

export interface EquippedItemEvent {
  slot: string;
  itemName: string;
}

export type TrackedAffixGroupMode = 'category' | 'slots';

export interface TrackedAffixViewState {
  groupMode: TrackedAffixGroupMode;
  collapsed: string[];
}

export type PlannerTab = 'equipment' | 'affixes';

@Injectable({
  providedIn: 'root'
})
export class EquippedService implements QueryParamsListener {
  private slots: Map<string, BehaviorSubject<Item>>;
  private importantAffixes: Set<string>;
  private externalAffixes: ExternalAffixEntry[] = [];
  private externalAffixesSubject = new BehaviorSubject<ExternalAffixEntry[]>([]);
  private nextExternalAffixId = 1;

  private unlockedSlots: Set<string>;

  private coveredAffixes: BehaviorSubject<Map<string, CoveredBonusType[]>>;
  private activeSetBonuses = new BehaviorSubject<Array<[string, Array<Affix>]>>([]);
  private visibleSetBonuses = new BehaviorSubject<Array<VisibleSetBonus>>([]);
  private importantAffixesSubject = new BehaviorSubject<Set<string>>(new Set<string>());
  private equippedItemSubject = new Subject<EquippedItemEvent>();

  // Planner view state, persisted in localStorage - see planner-view-state-storage.ts.
  private activeMainTab: PlannerTab = 'equipment';
  private plannerTabSubject = new BehaviorSubject<PlannerTab>('equipment');
  private trackedAffixGroupMode: TrackedAffixGroupMode = 'category';
  private collapsedTrackedAffixGroups = new Set<string>();
  private trackedAffixViewSubject = new BehaviorSubject<TrackedAffixViewState>({
    groupMode: 'category',
    collapsed: [],
  });
  private batchingDerivedStateUpdates = false;
  private derivedStateDirty = false;
  private importantAffixesDirty = false;

  private params: BehaviorSubject<QueryParamRecord | null>;

  private setOnlyUncoveredSets?: Set<string>;
  private openAugmentSlotsCache = new Map<string, Set<string>>();
  private availabilityWarmupToken = 0;

  constructor(
    private gearList: GearDbService,
    private queryParams: QueryParamsService,
    private affixSvc: AffixService,
    private essenceCrafting: EssenceCraftingService,
    private availability: AffixAvailabilityService,
    private ngZone: NgZone
  ) {
    this.unlockedSlots = new Set(gearList.getSlots());
    this.coveredAffixes = new BehaviorSubject<Map<string, CoveredBonusType[]>>(new Map<string, CoveredBonusType[]>());

    this.importantAffixes = new Set();

    this.slots = new Map<string, BehaviorSubject<Item>>();
    for (const slot of gearList.getSlots()) {
      this.slots.set(slot, new BehaviorSubject<Item>(new Item(null)));
    }

    this.params = new BehaviorSubject<QueryParamRecord | null>(null);

    this.activeMainTab = getStoredActiveTab();
    this.plannerTabSubject.next(this.activeMainTab);
    this.trackedAffixGroupMode = getStoredTrackedAffixGroupMode();
    this.collapsedTrackedAffixGroups = getStoredCollapsedTrackedAffixGroups();
    this._emitTrackedAffixViewState();

    this.queryParams.registerOwnedSlots(gearList.getSlots());
    this.queryParams.register(this, this.params);
    this.queryParams.subscribe(this);

    for (const slot of this.slots) {
      slot[1].subscribe(() => {
        this.refreshDerivedStateAfterSlotChange();
      });
    }
  }

  updateFromParams(params: ParamsAdapter) {
    return perfMeasure('EquippedService.updateFromParams', () => {
      this.beginDerivedStateBatch();
      const craftingParams = [];
      const minLevels = new Map<string, number>();

      try {
        this.setImportantAffixes(params.getAll('tracked'));
        this._restoreExternalAffixesFromParam(params.get('nongear'));

        for (const slot of this.gearList.getSlots()) {
          if (!params.get(slot)) {
            const dummy = new Item(null);
            dummy.slot = slot;
            this._set(dummy);
          }
        }

        for (const key of params.keys) {
          if (key === 'tracked' || key === 'nongear') {
            continue;
          } else if (isCraftKey(key)) {
            const { index, field } = parseCraftKey(key)!;
            if (craftingParams.length <= index) {
              craftingParams.length = index + 1;
            }
            let craftingParam = craftingParams[index] as Record<string, string> | undefined;
            if (!craftingParam) {
              craftingParam = {};
              craftingParams[index] = craftingParam;
            }
            // key comes from params.keys, so get() finds it
            craftingParam[field] = params.get(key) ?? '';

          } else if (this.gearList.getSlots().find(v => v === key)) {
            const itemName = params.get(key);
            if (!itemName) {
              // Already handled by the clearing loop above (a slot key
              // present with a falsy value means "empty", same as the key
              // being absent) - nothing to look up. Also guards against ever
              // passing null/'' into findGearBySlot -> canonicalizeGenerated-
              // CraftedItemName, which assumes a real string.
              continue;
            }
            const item = this.gearList.findGearBySlot(key, itemName);
            if (item) {
              this._set(item);
            } else {
              console.log('Can\'t find ' + itemName + ' for slot ' + key);
            }
          } else if (isMlKey(key)) {
            minLevels.set(getMlSlotFromKey(key)!, Number(params.get(key)));
          } else if (key.startsWith('craft_')) {
            console.log('Bad crafting key: ' + key);
          } else if (key.startsWith('ml_')) {
            console.log('Bad ml key: ' + key);
          }
        }

        for (const entries of minLevels.entries()) {
          const slotSubject = this.slots.get(entries[0]);
          const item = slotSubject ? slotSubject.getValue() : null;
          // An empty slot's Item(null) placeholder is truthy (see
          // isValid()'s other call sites in this file) - without this check,
          // an ml_<slot> param for a never-equipped slot mutated and
          // re-published that placeholder with a stray .ml value stuck onto
          // it instead of being a no-op.
          if (item && item.isValid()) {
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
          // Same isValid() reasoning as the minLevels loop above - this was
          // already harmless in practice only because getCraftingByName()
          // happens to no-op on an invalid item's always-undefined
          // .crafting, which is fragile to rely on rather than checking here.
          if (!item || !item.isValid()) {
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
    // Active set bonuses must be recomputed first: covered affix values are
    // derived from them (a set can supply an affix-group bonus like
    // "Spell Critical Damage" that resolves onto tracked member affixes).
    this._updateActiveSetBonuses();
    this._updateCoveredAffixes(false);
  }

  _updateRouterState() {
    const done = perfStart('EquippedService._updateRouterState');
    const params: Record<string, string | number | Array<string>> = {};
    let craftingIdx = 0;
    for (const kv of this.slots) {
      const slot = kv[0];
      const item = kv[1].getValue();
      // An empty slot still holds a real Item(null) placeholder object (see
      // clearSlot), which is truthy - checking isValid() too (name !==
      // undefined) is what actually distinguishes "has an equipped item"
      // from "cleared". Without it, every empty slot wrote `params[slot] =
      // undefined` here, which a plain object spread (unlike JSON.stringify)
      // still preserves as a real key - getCombinedParams() would then hand
      // that key back out with value `undefined`, coerced to `null` by
      // paramsAdapterFromRecord. Re-applying that (e.g. the "already this
      // shortId" cache reapply in MainComponent.loadBuildFromRoute, right
      // after an in-place Save) fed that null straight into
      // canonicalizeGeneratedCraftedItemName(null), which throws - an
      // uncaught error inside route.paramMap's subscribe callback silently
      // kills that whole subscription, so the app never reacts to a route
      // change again until a hard reload recreates it.
      if (item && item.isValid()) {
        params[slot] = item.name;

        if (item.isEssenceCrafted()) {
          params["ml_" + slot] = item.ml;
        }

        if (item.crafting) {
          for (const crafting of item.crafting) {
            if (crafting.selected.affixes.length || crafting.selected.set || crafting.selected.name || crafting.selectedCraftingSystemName) {
              params['craft_' + craftingIdx + "_slot"] = slot;
              params['craft_' + craftingIdx + "_system"] = crafting.name;
              params['craft_' + craftingIdx + "_selected"] = crafting.getSelectedParamDescription();
              craftingIdx++;
            }
          }
        }
      }
    }

    //params['locked'] = this.getLockedSlots();

    params['tracked'] = Array.from(this.importantAffixes);

    if (this.externalAffixes.length) {
      params['nongear'] = JSON.stringify(this.externalAffixes);
    }

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
    this.equippedItemSubject.next({ slot: item.slot, itemName: item.name });
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

  getEquippedItemEvents() {
    return this.equippedItemSubject.asObservable();
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

      // isValid(), not bare truthiness - an empty slot's Item(null)
      // placeholder is truthy, and this only avoided crashing here because
      // getSets() happens to return undefined (falsy) for one instead of
      // throwing - the same fragile-by-incidence pattern already fixed
      // elsewhere in this file.
      if (item && item.isValid() && item.getSets()) {
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

    for (const entry of this.externalAffixes) {
      if (entry.kind === 'value' && entry.affixName === affixName && entry.bonusType === bonusType) {
        values.push({ slot: 'Non-gear', value: entry.value });
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

    for (const entry of this.externalAffixes) {
      if (entry.kind === 'value' && entry.affixName === affixName && entry.bonusType === bonusType && entry.value === bestValue) {
        sources.push({
          kind: 'external',
          slot: 'Non-gear',
          itemName: entry.label,
          affixName: entry.affixName,
          bonusType: entry.bonusType,
          value: entry.value
        });
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
    // Slots still open to gear, plus the one this candidate would take. Scarcity
    // is measured against these so filled keystone slots stop counting and the
    // suggestions converge on a final set.
    const openSlots = this.getUnlockedSlots();
    openSlots.add(item.slot);
    const equippedSetCounts = this.getActiveSets();

    for (const affix of this.affixSvc.getActiveAffixes(item)) {
      if (this.importantAffixes.has(affix.name)) {

        const dummyItem = new Item(null);
        dummyItem.slot = item.slot;

        const valWithNewItem = this._getTotalValueForAffixTestingItem(affix.name, item);
        const valWithCurItem = this._getTotalValueForAffixTestingItem(affix.name, dummyItem);

        const improvement = valWithNewItem - valWithCurItem;

        const bestVal = this.gearList.getBestValueForAffix(affix.name);

        const affixWeight = this.gearList.getAffixWeight(affix.name, bestVal);

        // Once equipped gear already covers this bonus type to the moderate
        // threshold, stop letting scarcity boost yet another source of it.
        const scarcity = this._isAffixTypeSufficient(affix.name, affix.type)
          ? 1
          : this.availability.getScarcityWeight(
              affix.name, affix.type, openSlots, equippedSetCounts,
              this.getSlotsWithOpenAugmentForAffixType(affix.name, affix.type)
            );

        score += improvement / bestVal * affixWeight * scarcity;
      }
    }

    score += this._getSetCoverageNudge(item);

    return score;
  }

  /**
   * True once currently equipped gear supplies at least 3/4 of the best
   * available value for this affix + bonus type — matching the effects table's
   * "moderate value" threshold. Past that point the need is handled.
   */
  private _isAffixTypeSufficient(affixName: string, bonusType: string): boolean {
    const best = this.gearList.getBestValueForAffixType(affixName, bonusType);
    if (best <= 0) {
      return false;
    }
    return this.getCurrentValueForAffixType(affixName, bonusType) >= moderateValueThreshold(best);
  }

  /**
   * Rewards a candidate for belonging to a set that is the only source of a
   * still-uncovered tracked need, so set pieces surface in slot suggestions even
   * though the set bonus itself never appears among the item's own affixes.
   */
  private _getSetCoverageNudge(item: Item): number {
    const sets = item.getSets();
    if (!sets || !sets.length) {
      return 0;
    }
    const setOnly = this._getSetOnlyUncoveredSets();
    if (!setOnly.size) {
      return 0;
    }
    let matches = 0;
    for (const setName of sets) {
      if (setOnly.has(setName)) {
        matches++;
      }
    }
    return Math.min(matches, 2) * SET_PIECE_NUDGE;
  }

  private _getSetOnlyUncoveredSets(): Set<string> {
    if (this.setOnlyUncoveredSets) {
      return this.setOnlyUncoveredSets;
    }
    const result = new Set<string>();
    const openSlots = this.getUnlockedSlots();
    const equippedSetCounts = this.getActiveSets();
    for (const [affixName, types] of this.coveredAffixes.getValue()) {
      for (const entry of types) {
        if (entry.value || entry.bonusType === 'Bool') {
          continue;
        }
        // Remaining-slot aware: a bonus type whose last item slot just got
        // filled now counts as set-only too — and only if that set can still
        // reach its threshold.
        const info = this.availability.getRemainingAvailability(
          affixName, entry.bonusType, openSlots, equippedSetCounts,
          this.getSlotsWithOpenAugmentForAffixType(affixName, entry.bonusType)
        );
        if (info.tier === 'set-only') {
          for (const source of info.setSources) {
            result.add(source.setName);
          }
        }
      }
    }
    this.setOnlyUncoveredSets = result;
    return result;
  }

  /**
   * Slots whose currently-equipped item still has a free augment slot able to
   * host an augment granting (affixName, bonusType). Filling a gear slot does
   * not consume its augment slots, so these stay available even though the slot
   * is "locked". Memoised until the next equipped-gear change.
   */
  getSlotsWithOpenAugmentForAffixType(affixName: string, bonusType: string): Set<string> {
    const key = affixName + '\0' + bonusType;
    const cached = this.openAugmentSlotsCache.get(key);
    if (cached) {
      return cached;
    }

    const augmentNames = new Set<string>();
    for (const craftable of this.gearList.findAugmentsWithAffixAndType(affixName, bonusType)) {
      if (craftable.options && craftable.options.length) {
        augmentNames.add(craftable.name);
      }
    }

    const slots = new Set<string>();
    if (augmentNames.size) {
      for (const [slotName, subject] of this.slots) {
        const item = subject.getValue();
        if (!item || !item.crafting) {
          continue;
        }
        for (const craftable of item.crafting) {
          if (craftable.selected && craftable.selected.affixes.length !== 0) {
            continue; // already committed to something
          }
          const canHost = augmentNames.has(craftable.name) ||
            (craftable.hasCraftingSystemOptions() &&
              craftable.craftingSystemOptions.some(name => augmentNames.has(name)));
          if (canHost) {
            slots.add(slotName);
            break;
          }
        }
      }
    }

    this.openAugmentSlotsCache.set(key, slots);
    return slots;
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

  getActiveMainTab() {
    return this.plannerTabSubject.asObservable();
  }

  setActiveMainTab(tab: PlannerTab) {
    if (this.activeMainTab === tab) {
      return;
    }
    this.activeMainTab = tab;
    this.plannerTabSubject.next(tab);
    storeActiveTab(tab);
  }

  getTrackedAffixViewState() {
    return this.trackedAffixViewSubject.asObservable();
  }

  setTrackedAffixGroupMode(mode: TrackedAffixGroupMode) {
    if (this.trackedAffixGroupMode === mode) {
      return;
    }
    this.trackedAffixGroupMode = mode;
    this._emitTrackedAffixViewState();
    storeTrackedAffixGroupMode(mode);
  }

  toggleTrackedAffixGroupCollapsed(key: string) {
    if (this.collapsedTrackedAffixGroups.has(key)) {
      this.collapsedTrackedAffixGroups.delete(key);
    } else {
      this.collapsedTrackedAffixGroups.add(key);
    }
    this._emitTrackedAffixViewState();
    storeCollapsedTrackedAffixGroups(this.collapsedTrackedAffixGroups);
  }

  private _emitTrackedAffixViewState() {
    this.trackedAffixViewSubject.next({
      groupMode: this.trackedAffixGroupMode,
      collapsed: Array.from(this.collapsedTrackedAffixGroups),
    });
  }

  private getTrackedAffixFamily(affix: string) {
    const canonicalAffix = this.affixSvc.getCanonicalName(affix);
    const trackedAffixes = new Set<string>([
      canonicalAffix,
      ...(TRACKED_AFFIX_COMPANIONS.get(canonicalAffix) || [])
    ]);

    return Array.from(trackedAffixes);
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

  private _restoreExternalAffixesFromParam(raw: string | null) {
    let entries: ExternalAffixEntry[] = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          entries = parsed.filter((entry): entry is ExternalAffixEntry => isExternalAffixEntry(entry));
        }
      } catch {
        console.log('Bad ext param, ignoring external affix entries: ' + raw);
      }
    }

    this.externalAffixes = entries;
    this.nextExternalAffixId = entries.reduce((max, entry) => Math.max(max, Number(entry.id) || 0), 0) + 1;
    this.externalAffixesSubject.next(this.externalAffixes);
  }

  addImportantAffix(affix: string) {
    return this.addImportantAffixes([affix]);
  }

  /** Tracks several affixes (and their companions) with a single recompute, rather than one per affix. */
  addImportantAffixes(affixes: Iterable<string>) {
    const addedAffixes = Array.from(this.expandTrackedAffixes(affixes))
      .filter(trackedAffix => !this.importantAffixes.has(trackedAffix));
    if (addedAffixes.length) {
      for (const trackedAffix of addedAffixes) {
        this.importantAffixes.add(trackedAffix);
      }
      this.importantAffixesSubject.next(new Set(this.importantAffixes));
      this._updateCoveredAffixes();
    }
    return addedAffixes;
  }

  removeImportantAffix(affix: string) {
    return this.removeImportantAffixes([affix]);
  }

  removeImportantAffixes(affixes: Iterable<string>) {
    const removedAffixes = Array.from(this.expandTrackedAffixes(affixes))
      .filter(trackedAffix => this.importantAffixes.has(trackedAffix));
    if (removedAffixes.length) {
      for (const trackedAffix of removedAffixes) {
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

  getExternalAffixesObservable(): Observable<ExternalAffixEntry[]> {
    return this.externalAffixesSubject.asObservable();
  }

  getExternalAffixesSnapshot(): ExternalAffixEntry[] {
    return this.externalAffixes;
  }

  getExternalAffixesForType(affixName: string, bonusType: string): ExternalAffixEntry[] {
    return this.externalAffixes.filter(entry => entry.affixName === affixName && entry.bonusType === bonusType);
  }

  addExternalAffixValue(affixName: string, bonusType: string, value: number, label: string): string {
    return this._addExternalAffix({
      id: String(this.nextExternalAffixId++),
      affixName,
      bonusType,
      kind: 'value',
      value,
      label
    });
  }

  addExternalAffixIgnored(affixName: string, bonusType: string, label: string): string {
    return this._addExternalAffix({
      id: String(this.nextExternalAffixId++),
      affixName,
      bonusType,
      kind: 'ignored',
      value: 0,
      label
    });
  }

  private _addExternalAffix(entry: ExternalAffixEntry): string {
    // Only one external entry per (affixName, bonusType) - a new one replaces
    // whatever was there before rather than stacking up duplicates.
    this.externalAffixes = [
      ...this.externalAffixes.filter(existing => existing.affixName !== entry.affixName || existing.bonusType !== entry.bonusType),
      entry
    ];
    this._emitExternalAffixesChanged();
    return entry.id;
  }

  removeExternalAffix(id: string) {
    const before = this.externalAffixes.length;
    this.externalAffixes = this.externalAffixes.filter(entry => entry.id !== id);
    if (this.externalAffixes.length !== before) {
      this._emitExternalAffixesChanged();
    }
  }

  isAffixTypeIgnored(affixName: string, bonusType: string): boolean {
    return this.externalAffixes.some(entry =>
      entry.affixName === affixName && entry.bonusType === bonusType && entry.kind === 'ignored');
  }

  private _emitExternalAffixesChanged() {
    this.externalAffixesSubject.next(this.externalAffixes);
    this._updateCoveredAffixes();
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
    this.setOnlyUncoveredSets = undefined;
    this.openAugmentSlotsCache.clear();
    const newMap = new Map<string, CoveredBonusType[]>();

    const importantAffixes = this._getImportantAffixesToTypes();
    for (const affix of importantAffixes) {
      const affixName = affix[0];
      const affixTypes = affix[1];

      const array: CoveredBonusType[] = [];
      for (const type of affixTypes.keys()) {
        const bestVal = this._getBestValueForAffixType(affixName, type);
        array.push({ bonusType: type, value: bestVal });
      }
      newMap.set(affixName, array);
    }

    this.coveredAffixes.next(newMap);
    // Warm AffixAvailabilityService's per-(affix, bonusType) cache off the
    // critical path (URL restore / toggling a tracked affix), instead of
    // letting getScore() pay for the first-ever lookup synchronously mid-click
    // when a slot's suggestions are scored.
    this._scheduleAvailabilityWarmup(importantAffixes);
    if (updateRouterState) {
      this._updateRouterState();
    }
  }

  /**
   * Populates AffixAvailabilityService's per-(affix, bonusType) cache, so URL
   * restore / toggling a tracked affix doesn't block a long synchronous task
   * (the page can still paint) while still (usually) finishing well before
   * the player opens a slot. Each idle slice drains pairs while genuine idle
   * time remains rather than doing a fixed batch size - now that
   * GearDbService answers each pair from a precomputed index, a single pair
   * is cheap enough that one-per-callback would just leave most of a typical
   * idle slice unused and take many more ticks (and more wall-clock time) to
   * finish than necessary; but a pair's cost isn't zero (findSetsWithAffixAndType
   * / findAugmentsWithAffixAndType aren't indexed), so it's still checked
   * per-pair rather than assumed away. A newer call supersedes an in-flight
   * one via the token, so a rapid affix toggle doesn't pile up redundant work.
   */
  private _scheduleAvailabilityWarmup(importantAffixes: Map<string, Map<string, number>>) {
    const pairs: Array<[string, string]> = [];
    for (const [affixName, types] of importantAffixes) {
      for (const type of types.keys()) {
        pairs.push([affixName, type]);
      }
    }
    if (!pairs.length) {
      return;
    }

    // Fixed one-time cost (build the item/augment lookup indexes), paid up
    // front rather than left to land inside whichever pair below happens to
    // be queried first - see warmAvailabilityIndexes' doc comment.
    this.gearList.warmAvailabilityIndexes();

    const token = ++this.availabilityWarmupToken;
    let index = 0;
    const runSlice = (deadline: IdleWorkDeadline) => {
      if (token !== this.availabilityWarmupToken) {
        return;
      }
      // Always take at least one pair, deadline or not - under sustained load
      // timeRemaining() can read ~0 on every tick, and without this floor the
      // loop would keep rescheduling forever without ever making progress.
      let processedOne = false;
      while (index < pairs.length && (!processedOne || deadline.timeRemaining() > 0)) {
        const [affixName, type] = pairs[index++];
        this.availability.getAvailability(affixName, type);
        processedOne = true;
      }
      if (index < pairs.length) {
        scheduleIdleWork(runSlice);
      }
    };
    // Run outside Angular's zone: each getAvailability call is plain reads with
    // no UI-bound state change, but requestIdleCallback is zone-patched, so
    // without this every single idle tick would otherwise trigger a full
    // change-detection pass over the whole gear list / tracked-affix sidebar -
    // dozens of ticks' worth of avoidable re-rendering was the majority of the
    // remaining "paint after URL restore" stall.
    this.ngZone.runOutsideAngular(() => scheduleIdleWork(runSlice));
  }

  public getGearDescription() {
    let msg = '';
    for (const [slot, itemSubj] of this.slots) {
      const item = itemSubj && itemSubj.getValue();
      if (item) {
        // An empty slot is still a real Item(null) placeholder (truthy) -
        // isValid() (name !== undefined) is what actually distinguishes
        // "equipped" from "empty". Without it this printed "<slot>:
        // undefined" for every unequipped slot. Label from the map key, not
        // item.slot: a never-touched slot's Item(null) never had .slot set
        // either (only clearSlot() and a real equip set it), so item.slot
        // is itself undefined until the slot has been interacted with once.
        msg += slot + ': ' + (item.isValid() ? item.name : 'empty') + "\n";
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
