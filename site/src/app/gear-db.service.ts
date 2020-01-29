import { Injectable } from '@angular/core';

import { CannithService } from './cannith.service';
import { FiltersService } from './filters.service';

import { Item } from './item';
import { Affix } from './affix';
import { Craftable } from './craftable';
import { CraftableOption } from './craftable-option';

import itemsList from 'src/assets/items.json';
import craftingList from 'src/assets/crafting.json';
import cannithList from 'src/assets/cannith.json';
import setList from 'src/assets/sets.json';

@Injectable({
  providedIn: 'root'
})
export class GearDbService {
  private gear: Map<string, Array<Item>>;
  private allGear: Map<string, Array<Item>>;
  affixToBonusTypes: Map<string, Map<string, number>>;
  bestValues: Map<any, number>;

  constructor(
    public cannith: CannithService,
    public filters: FiltersService
  ) {
    this.gear = new Map<string, Array<Item>>();
    this.allGear = this.filterByLevelRange(1, 30);

    this.filters.getLevelRange().subscribe(val => {
      this.gear = this.filterByLevelRange(val[0], val[1])
    });
  }

  filterByLevelRange(minLevel: number, maxLevel: number) {
    const gear = new Map<string, Array<Item>>();

    this.affixToBonusTypes = new Map<string, Map<string, number>>();

    for (const item of itemsList) {
      if (Number(item.ml) < minLevel || Number(item.ml) > maxLevel) {
        continue;
      }

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
          if (craftingSystem === 'Nearly Finished' || craftingSystem === 'Almost There') {
            const newOptions = [];
            const options = craftingList[craftingSystem][item.name];
            if (options) {
              for (const option of craftingList[craftingSystem][item.name]) {
                newOptions.push(new CraftableOption(option));
              }
              craftingOptions.push(new Craftable(craftingSystem, newOptions));
            }
          } else {
            // Not-yet-implemented crafting systems
            craftingOptions.push(new Craftable(craftingSystem, []));
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

    this._buildCannithItems(gear, maxLevel);

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
          cannithSlots = ['Shield', 'Rune Arm', 'Orb'];
          break;
        default:
          cannithSlots = [slot];
      }

      for (const cannithSlot of cannithSlots) {
        const locations = cannithList['itemTypes'][cannithSlot];
        if (locations) {
          const ml = maxLevel == 30 ? 34 : maxLevel;
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

  findSetsWithAffixAndType(affixName, bonusType) {
    const results = [];

    for (const setName of Object.getOwnPropertyNames(setList)) {
      for (const threshold of setList[setName]) {
        for (const affix of threshold.affixes) {
          if (affix.name === affixName && affix.type === bonusType) {
            results.push(setName);
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
}
