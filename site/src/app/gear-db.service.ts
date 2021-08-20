import { Injectable } from '@angular/core';

import { CannithService } from './cannith.service';
import { FiltersService } from './filters.service';
import { QuestService } from './quest.service';

import { Item } from './item';
import { ItemFilters } from './item-filters';
import { Affix } from './affix';
import { Craftable } from './craftable';
import { CraftableOption } from './craftable-option';

import itemsList from 'src/assets/items.json';
import craftingListOrig from 'src/assets/crafting.json';
import cannithList from 'src/assets/cannith.json';
import setList from 'src/assets/sets.json';

@Injectable({
  providedIn: 'root'
})
export class GearDbService {
  private gear: Map<string, Array<Item>>;
  private allGear: Map<string, Array<Item>>;
  private craftingList;

  affixToBonusTypes: Map<string, Map<string, number>>;
  bestValues: Map<any, number>;

  constructor(
    public cannith: CannithService,
    public filters: FiltersService,
    public quests: QuestService
  ) {
    this._buildAugmentOptions();
    this.gear = new Map<string, Array<Item>>();
    this.allGear = this._loadAllItems();

    this.filters.getItemFilters().subscribe(itemFilters => {
      this.gear = this.applyItemFilters(itemFilters);
    });
  }

  _mergeAugmentLists(left, right) {
    left = left + ' Augment Slot';
    right = right + ' Augment Slot';

    if (!this.craftingList[left]) {
      this.craftingList[left] = { '*': [], 'hiddenFromAffixSearch': true };
    }

    this.craftingList[left]['*'] = this.craftingList[left]['*'].concat(this.craftingList[right]['*']);
  }

  private _sortAugmentList(name) {
    name = name + ' Augment Slot';
    this.craftingList[name]['*'] = this.craftingList[name]['*'].sort((a, b) => {
      const aStr = a.name ? a.name : a.affixes[0].name;
      const bStr = b.name ? b.name : b.affixes[0].name;
      return aStr.localeCompare(bStr);
    });
  }

  private _buildAugmentOptions() {
    this.craftingList = craftingListOrig;

    this._mergeAugmentLists('Purple', 'Blue');
    this._mergeAugmentLists('Purple', 'Red');
    this._mergeAugmentLists('Purple', 'Colorless');

    this._mergeAugmentLists('Orange', 'Yellow');
    this._mergeAugmentLists('Orange', 'Red');
    this._mergeAugmentLists('Orange', 'Colorless');

    this._mergeAugmentLists('Green', 'Yellow');
    this._mergeAugmentLists('Green', 'Blue');
    this._mergeAugmentLists('Green', 'Colorless');

    this._mergeAugmentLists('Blue', 'Colorless');
    this._mergeAugmentLists('Red', 'Colorless');
    this._mergeAugmentLists('Yellow', 'Colorless');

    ['Blue', 'Yellow', 'Red', 'Green', 'Purple', 'Orange', 'Colorless'].map(e => this._sortAugmentList(e));
  }

  _loadAllItems() {
    const gear = new Map<string, Array<Item>>();

    for (const item of itemsList) {
      if (item.slot === 'Ring') {
        item.slot = 'Ring1';
      }

      if (!gear.has(item.slot)) {
        gear.set(item.slot, new Array<Item>());
      }

      const newItem = new Item(item);
      if (newItem.rawCrafting) {
        const craftingOptions = new Array<Craftable>();
        for (const craftingSystem of newItem.rawCrafting) {
          if (craftingSystem && this.craftingList[craftingSystem]) {
            const newOptions = [];
            let options = this.craftingList[craftingSystem][item.name];
            if (!options) {
              options = this.craftingList[craftingSystem]['*'];
            }
            if (options) {
              for (const option of options) {
                newOptions.push(new CraftableOption(option));
              }

              craftingOptions.push(new Craftable(craftingSystem, newOptions, this.craftingList[craftingSystem]['hiddenFromAffixSearch']));
            }
          } else {
            // Not-yet-implemented crafting systems
            craftingOptions.push(new Craftable(craftingSystem, [], false));
          }
        }
        newItem.crafting = craftingOptions;
      }

      gear.get(item.slot).push(newItem);
    }

    const ring2 = [];
    for (const item of gear.get('Ring1')) {
      const newItem = new Item(item);
      newItem.slot = 'Ring2';
      ring2.push(newItem);
    }
    gear.set('Ring2', ring2);

    return gear;
  }

  applyItemFilters(filters: ItemFilters) {
    const minLevel = filters.levelRange[0];
    const maxLevel = filters.levelRange[1];
    const showRaidItems = filters.showRaidItems;

    const gear = new Map<string, Array<Item>>();

    this.affixToBonusTypes = new Map<string, Map<string, number>>();

    for (const [slot, items] of this.allGear.entries()) {
      const myItems = items.filter(i => 
        Number(i.ml) >= minLevel &&
        Number(i.ml) <= maxLevel &&
        (showRaidItems || !i.quests || i.quests.some(quest => !this.quests.isRaid(quest))));
      gear.set(slot, myItems);
    }

    this._buildCannithItems(gear, maxLevel);


    //// FIXME!! Move this to its own function, attach it to the level range change so that affixes update with level range
    for (const items of gear.values()) {
      for (const item of items) {
        this._addAffixesToMap(item.affixes);
      }
    }

    for (const setName of Object.getOwnPropertyNames(setList)) {
      for (const threshold of setList[setName]) {
        this._addAffixesToMap(threshold.affixes);
      }
    }

    for (const system of Object.values(this.craftingList)) {
      for (const item of Object.values(system)) {
        for (const option of Object.values(item)) {
          if (option['ml'] && option['ml'] > maxLevel) {
            continue;
          }
          if (option['affixes']) {
            for (const affix of Object.values(option['affixes'])) {
              this._addAffixesToMap([new Affix(affix)]);
            }
          }
        }
      }
    }

    const cannithAffixes = this.cannith.getAllAffixesForML(maxLevel);
    this._addAffixesToMap(cannithAffixes);

    return gear;
  }

  private _buildCannithItems(gear, maxLevel) {
    for (const slot of gear.keys()) {
      let cannithSlots = null;
      switch (slot) {
        case 'Ring1':
        case 'Ring2':
          cannithSlots = ['Ring'];
          break;
        case 'Weapon':
          cannithSlots = ['Melee', 'Ranged'];
          break;
        case 'Offhand':
          cannithSlots = ['Melee', 'Ranged', 'Shield', 'Rune Arm', 'Orb'];
          break;
        default:
          cannithSlots = [slot];
      }

      for (const cannithSlot of cannithSlots) {
        const locations = cannithList['itemTypes'][cannithSlot];
        if (locations) {
          const ml = maxLevel === 30 ? 34 : maxLevel;
          const craftingOptions = this.cannith.getValuesForML(cannithSlot, ml);

          const cannithBlank = new Item(null);
          cannithBlank.ml = ml;
          cannithBlank.slot = slot;
          cannithBlank.name = 'Cannith ' + cannithSlot;
          cannithBlank.crafting = craftingOptions;
          gear.get(cannithBlank.slot).push(cannithBlank);
        }
      }
    }
  }

  private _addAffixesToMap(affixes: Array<Affix>) {
    for (const affix of affixes) {
      if (!this.affixToBonusTypes.has(affix.name)) {
        this.affixToBonusTypes.set(affix.name, new Map<string, number>());
      }

      const typeMap = this.affixToBonusTypes.get(affix.name);

      const bestVal = typeMap.get(affix.type);
      if (!bestVal || bestVal < affix.value) {
        typeMap.set(affix.type, Number(affix.value));
      }
    }
  }

  getGearList() {
    return this.gear;
  }

  getFilteredGearBySlot(type: string) {
    return this.gear.get(type);
  }

  getGearBySlot(type: string) {
    return this.allGear.get(type);
  }

  private getSortIndex(slot: string) {
    switch (slot) {
      case 'Weapon': return 1;
      case 'Offhand': return 2;
      default: return 3;
    }
  }

  getSlots() {
    return Array.from(this.gear.keys()).sort((a, b) => {
      const idxA = this.getSortIndex(a);
      const idxB = this.getSortIndex(b);

      if (idxA === idxB) {
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
        if (item.canHaveBonusType(affixName, bonusType)) {
          results.push(item);
        }
      }
    }

    return results;
  }

  findGearInSet(setName: string) {
    const results = [];

    if (!setName) {
      return results;
    }

    for (const items of this.gear.values()) {
      for (const item of items) {
        if (item.getSets() && item.getSets().includes(setName)) {
          results.push(item);
        }
      }
    }

    return results;
  }

  findSetsWithAffixAndType(affixName, bonusType) {
    const results = [];

    for (const setName of Object.getOwnPropertyNames(setList)) {
      for (const threshold of setList[setName]) {
        for (const affix of threshold.affixes) {
          if (affix.name === affixName && affix.type === bonusType) {
            results.push([setName, threshold.threshold, affix.value]);
          }
        }
      }
    }

    return results;
  }

  getAllAffixes() {
    return Array.from(this.affixToBonusTypes.keys());
  }

  getTypesForAffix(affixName: string) {
    return Array.from(this.affixToBonusTypes.get(affixName).keys());
  }

  getBestValueForAffixType(affixName: string, affixType: string) {
    const outermap = this.affixToBonusTypes.get(affixName);
    if (!outermap) {
      return 0;
    }
    return outermap.get(affixType);
  }

  getBestValueForAffix(affixName: string) {
    const outermap = this.affixToBonusTypes.get(affixName);
    if (!outermap) {
      return 0;
    }

    let totalVal = 0;
    for (const type of outermap.keys()) {
      const val = this.getBestValueForAffixType(affixName, type);
      if (val > 0) {
        totalVal += val;
      }
    }

    return totalVal;
  }

  getSetBonus(set: string, numPieces: number) {
    const bonuses = new Array<Affix>();
    if (setList[set]) {
      for (const data of setList[set]) {
        if (Number(data.threshold) <= numPieces) {
          for (const affix of data.affixes) {
            bonuses.push(new Affix(affix));
          }
        }
      }
    }
    return bonuses;
  }

  getSetBonusThresholds(set: string) {
    const thresholds = new Array<number>();
    if (setList[set]) {
      for (const data of setList[set]) {
        thresholds.push(data.threshold);
      }
      thresholds.sort((a, b) => a - b);
    }
    return thresholds;
  }
}
