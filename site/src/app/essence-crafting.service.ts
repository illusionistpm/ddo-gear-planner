import { Injectable } from '@angular/core';

import { Item } from './item';
import { Affix } from './affix';
import { Craftable } from './craftable';
import { CraftableOption } from './craftable-option';

import essenceCraftingList from 'src/assets/essence-crafting.json';

@Injectable({
  providedIn: 'root'
})
export class EssenceCraftingService {
  levels: Array<number>;
  maxLevel: number;

  constructor() {
    const essenceCraftingData = essenceCraftingList as Record<string, any>;
    this.maxLevel = Number(essenceCraftingData['maxLevel'] ?? 34);
    this.levels = [];
    for (let ml = this.maxLevel; ml >= 1; ml--) {
      this.levels.push(ml);
    }
  }

  setItemToML(item: Item, ml: number) {
    const indexes = [];
    for(const craftable of item.crafting) {
      indexes.push(craftable.options.findIndex(a => a === craftable.selected));
    }

    item.ml = ml;
    item.crafting = this.getValuesForML(this.getEssenceCraftingItemType(item), ml);

    for(let i = 0; i < indexes.length; i++) {
      const craftable = item.crafting[i];
      if (craftable && indexes[i] >= 0 && craftable.options[indexes[i]]) {
        craftable.selected = craftable.options[indexes[i]];
      }
    }
  }

  private getEssenceCraftingItemType(item: Item): string {
    const rawCrafting = item.rawCrafting || [];
    const essenceCraftingSystem = rawCrafting.find(system => system.startsWith('Essence Crafting: '));
    const systemMatch = essenceCraftingSystem?.match(/^Essence Crafting: (.+) - (?:Prefix|Suffix|Extra)$/);
    if (systemMatch) {
      return systemMatch[1];
    }

    const blankMatch = item.name?.match(/^Essence Crafting (.+)$/);
    if (blankMatch) {
      return blankMatch[1];
    }

    if (item.slot === 'Ring1' || item.slot === 'Ring2') {
      return 'Ring';
    }

    return item.slot;
  }

  getValuesForML(itemType: string, ml: number) {
    //JAK: FIXME!! Hack - Weapon and Offhand will have the same issue, but aren't as trivial to fix
    if (itemType === 'Ring1' || itemType === 'Ring2') {
      itemType = 'Ring';
    }

    const craftingOptions = this._getOptionsForItemType(itemType, ml);
    return craftingOptions;
  }

  getValuesForSlotML(itemType: string, essenceCraftingSlot: string, ml: number): Craftable {
    return this._getOptionsForItemSlot(itemType, essenceCraftingSlot, ml);
  }

  getAllAffixesForML(ml: number): Array<Affix> {
    let affixes: Array<Affix> = [];
    const itemTypes = Object.keys(essenceCraftingList['itemTypes'] as Record<string, any>);
    for (const itemType of itemTypes) {
      const craftables = this._getOptionsForItemType(itemType, ml);
      affixes = craftables.reduce((accum: Array<Affix>, a: Craftable) =>
        accum.concat(a.options.reduce((innerAccum: Array<Affix>, b: CraftableOption) =>
          innerAccum.concat(b.affixes),
          [] as Array<Affix>)), [] as Array<Affix>);
    }
    return affixes;
  }

  private _getOptionsForItemType(itemType: string, ml: number) {
    const craftingOptions = new Array<Craftable>();

    for (const essenceCraftingSlot of ['Prefix', 'Suffix', 'Extra']) {
      craftingOptions.push(this._getOptionsForItemSlot(itemType, essenceCraftingSlot, ml));
    }

    return craftingOptions;
  }

  private _getOptionsForItemSlot(itemType: string, essenceCraftingSlot: string, ml: number): Craftable {
    const essenceCraftingData = essenceCraftingList as Record<string, any>;
    const affixList = (essenceCraftingData['itemTypes']?.[itemType]?.[essenceCraftingSlot] ?? []) as Array<string>;
    const cappedMl = Math.min(Math.max(ml, 1), this.maxLevel);
    
    const slotOptions: Array<CraftableOption> = [];
    for (const optionName of affixList) {
      const option = new CraftableOption(null);
      const progression = essenceCraftingData['progression'] as Record<string, Array<number>>;
      const value = (progression[optionName]?.[cappedMl - 1] ?? 0) as number;
      const affixNames = (essenceCraftingData['affixes'] ?? {}) as Record<string, string | Array<string>>;
      const mappedAffixes = affixNames[optionName] ?? optionName;
      const optionAffixes = Array.isArray(mappedAffixes) ? mappedAffixes : [mappedAffixes];
      const bonusTypes = essenceCraftingData['bonusTypes'] as Record<string, string>;

      for (let affix of optionAffixes) {
        let type = 'Enhancement';
        
        if (optionName.startsWith('Insightful')) {
          affix = affix.replace('Insightful ', '');
          type = 'Insight';
        } else {
          const bonusType = bonusTypes[affix];
          if (bonusType) {
            type = bonusType;
          }
        }

        option.affixes.push(new Affix({ name: affix, value, type }));
      }
      slotOptions.push(new CraftableOption(option));
    }

    return new Craftable(essenceCraftingSlot, slotOptions, false);
  }
}
