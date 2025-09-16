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
import craftingListRaw from 'src/assets/crafting.json';
import cannithList from 'src/assets/cannith.json';
import setList from 'src/assets/sets.json';
import { AffixService } from './affix.service';

const groupBy = <T, K extends keyof any>(arr: T[], key: (i: T) => K) =>
  arr.reduce((groups, item) => {
    (groups[key(item)] ||= []).push(item);
    return groups;
  }, {} as Record<K, T[]>);

@Injectable({
  providedIn: 'root'
})
export class GearDbService {
  private gear: Map<string, Array<Item>>;
  private allGear: Map<string, Array<Item>>;
  private craftingList: Map<string, Map<string, Craftable>>;

  affixToBonusTypes: Map<string, Map<string, number>>;
  bestValues: Map<any, number>;

  constructor(
    public cannith: CannithService,
    public filters: FiltersService,
    public quests: QuestService,
    private affixSvc: AffixService
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

    // Remove the empty item from the RHS so we don't end up with 2 of them
    const rhsOptions = this.craftingList.get(right).get('*').options.slice(1)

    this.craftingList.get(left).get('*').options = this.craftingList.get(left).get('*').options.concat(rhsOptions);
  }

  private _sortAugmentList(name) {
    name = name + ' Augment Slot';
    this.craftingList.get(name).get('*').options = this.craftingList.get(name).get('*').options.sort((a, b) => {

      const aStr = a.name ? a.name : a.affixes[0] ? a.affixes[0].name : '';
      const bStr = b.name ? b.name : b.affixes[0] ? b.affixes[0].name : '';

      // regex instruction to grab the beginning of a string up to and including the first plus
      const regexBeforePlus = /(.*\+)/

      // regex instruction to grab all digits in string found immediately after the first plus
      const regexNumberAfterPlus = /.*\+([0-9]+)/

      // if a plus is found in the string, insert some zeros at the beginning of the number for sorting purposes
      const aStrPadded = aStr.match(regexBeforePlus) ? aStr.match(regexBeforePlus)[1] + aStr.match(regexNumberAfterPlus)[1].padStart(4, '0') : aStr
      const bStrPadded = bStr.match(regexBeforePlus) ? bStr.match(regexBeforePlus)[1] + bStr.match(regexNumberAfterPlus)[1].padStart(4, '0') : bStr

      return aStrPadded.localeCompare(bStrPadded);

    });
  }

  private _buildAugmentOptions() {
    // The craftables come in as raw JSON, but we'd really like them as their proper types. Build that now.
    this.craftingList = new Map<string, Map<string, Craftable>>();

    Object.keys(craftingListRaw).forEach((key) => {
      const innerMap = new Map<string, Craftable>();
      Object.keys(craftingListRaw[key]).forEach((innerKey) => {
        // HACK! I probably need to fix the JSON format to remove this
        if (innerKey === 'hiddenFromAffixSearch') {
          return;
        }

        const options = Array.prototype.map.call(craftingListRaw[key][innerKey], (option) => new CraftableOption(option));
        const craftable = new Craftable(key, options, craftingListRaw[key][innerKey]['hiddenFromAffixSearch']);
        innerMap.set(innerKey, craftable);
      });
      this.craftingList.set(key, innerMap);
    });

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

    let maxLevel = 0;

    for (const item of itemsList) {
      if (item.slot === 'Ring') {
        item.slot = 'Ring1';
      }

      if (item.ml > maxLevel) {
        maxLevel = item.ml;
      }

      if (!gear.has(item.slot)) {
        gear.set(item.slot, new Array<Item>());
      }

      const newItem = new Item(item);
      if (newItem.rawCrafting) {
        const craftingOptions = new Array<Craftable>();
        for (const craftingSystem of newItem.rawCrafting) {
          if (craftingSystem && this.craftingList.get(craftingSystem)) {
            let craftable = this.craftingList.get(craftingSystem).get(item.name);
            if (!craftable) {
              craftable = this.craftingList.get(craftingSystem).get('*');
            }
            if (craftable) {
              craftingOptions.push(new Craftable(craftable.name, craftable.options, craftable.hiddenFromAffixSearch, false));
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

    const offhand = [];
    for (const item of gear.get('Weapon')) {
      const newItem = new Item(item);
      newItem.slot = 'Offhand';
      offhand.push(newItem);
    }
    gear.set('Offhand', gear.get('Offhand').concat(offhand));

    this.filters.setMaxLevel(maxLevel);

    return gear;
  }

  applyItemFilters(filters: ItemFilters) {
    const minLevel = filters.levelRange[0];
    const maxLevel = filters.levelRange[1];
    const showRaidItems = filters.showRaidItems;
    const hiddenItemTypes = filters.hiddenItemTypes;

    const gear = new Map<string, Array<Item>>();

    this.affixToBonusTypes = new Map<string, Map<string, number>>();

    for (const [slot, items] of this.allGear.entries()) {
      const myItems = items.filter(i =>
        i.ml >= minLevel &&
        i.ml <= maxLevel &&
        (showRaidItems || !i.quests || i.quests.some(quest => !this.quests.isRaid(quest))) &&
        !hiddenItemTypes.has(i.type)
      );
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

    for (const itemNames of this.craftingList.values()) {
      for (const craftable of itemNames.values()) {
        for (const option of craftable.options) {
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
          const ml = maxLevel;
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
    this._addAffixesToMap_helper(affixes);

    for (const affix of affixes) {
      const ungroupedAffixes = this.affixSvc.ungroupAffix(affix);
      this._addAffixesToMap_helper(ungroupedAffixes);
    }
  }

  private _addAffixesToMap_helper(affixes: Array<Affix>) {
    for (const affix of affixes) {
      if (!affix.name) {
        continue;
      }

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
      case 'Quiver': return 4;
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
        if (item.canHaveBonusType(affixName, bonusType, this.affixSvc)) {
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

  findAugmentsWithAffixAndType(affixName, bonusType): Array<Craftable> {
    let results = [];
    const augmentTypes = Array.from(this.craftingList.keys()).filter(c => c.endsWith(' Augment Slot'));
    for (const augmentType of augmentTypes) {
      const augments = this.craftingList.get(augmentType).get('*').options;

      // Filter the augments to only those that have the affix and type we are looking for
      let filteredAugments = augments.filter(aug => aug.affixes.some(aff => this.affixSvc.resolvesToAffix(aff.name, affixName) && aff.type === bonusType)) as CraftableOption[];

      // Simplify the remaining augments to only the affix name and type
      filteredAugments = filteredAugments.map(aug => {
        const newAug = new CraftableOption(aug);
        newAug.affixes = aug.affixes.filter(aff => this.affixSvc.resolvesToAffix(aff.name, affixName) && aff.type === bonusType);
        return newAug;
      });

      //
      const groupsRecord = groupBy(filteredAugments, (aug => aug.affixes.map(aff => aff.name + aff.type).join(' ')));

      // We want to prune the options to include only the best of each type - we don't need Str +1, Str +2, etc.
      // It's trickier now because they all have names, so attempt to detect the less interesting ones and prune out all but the best.
      const trivialNamePrefixes = ['Diamond of ', 'Sapphire of ', 'Ruby of ', 'Topaz of '];

      // Go through the groups and keep all named entries, plus the unnamed one with the highest value
      const bestResults = [];
      for (const key in groupsRecord) {
        const group = groupsRecord[key];
        let best = null;

        for (const aug of group) {
          // Keep the augment if it has a name, unless it starts with one of the trivial prefixes
          if (aug.name && !trivialNamePrefixes.some(p => aug.name.startsWith(p))) {
            bestResults.push(aug);
          } else {
            if (!best || best.affixes[0].value < aug.affixes[0].value) {
              best = aug;
            }
          }
        }

        if (best) {
          bestResults.push(best);
        }
      }

      results = results.concat(new Craftable(augmentType, bestResults, true, false));
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

  getAffixWeight(affixName: string, bestVal: number) {
    const attributes = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'];
    const tacticalDCs = ['Stunning', 'Vertigo', 'Sundering'];
    const spellDCs = ['Evocation Focus', 'Transmutation Focus', 'Abjuration Focus', 'Conjuration Focus',
                      'Enchantment Focus', 'Illusion Focus', 'Necromancy Focus'];

    // Boolean affixes are overrepresented and are typically pretty easy to slot
    if (bestVal == 1) {
      return .5;
    } else if (attributes.includes(affixName)) {
      return 4;
    } else if (tacticalDCs.includes(affixName)) {
      return 3;
    } else if (spellDCs.includes(affixName)) {
      return 3;
    }

    return 1;
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
