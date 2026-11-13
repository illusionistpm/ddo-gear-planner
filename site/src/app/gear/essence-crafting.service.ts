import { Injectable } from '@angular/core';

import { Item } from './item';
import { Affix } from '../affixes/affix';
import { Craftable } from './craftable';
import { CraftableOption } from './craftable-option';

import { GameDataService } from './game-data.service';

@Injectable({
  providedIn: 'root'
})
export class EssenceCraftingService {
  levels: Array<number>;
  maxLevel: number;

  constructor(private gameData: GameDataService) {
    this.maxLevel = Number(this.gameData.essenceCrafting.maxLevel ?? 34);
    this.levels = [];
    for (let ml = this.maxLevel; ml >= 1; ml--) {
      this.levels.push(ml);
    }
  }

  setItemToML(item: Item, ml: number) {
    const selections = [];
    const extraCrafting = [];
    for(const craftable of item.crafting) {
      if (['Prefix', 'Suffix', 'Extra'].includes(craftable.name)) {
        selections.push(craftable.getSelectedParamDescription());
      } else {
        extraCrafting.push(craftable);
      }
    }

    item.ml = ml;
    item.crafting = this.getValuesForML(this.getEssenceCraftingItemType(item), ml).concat(extraCrafting);

    for(let i = 0; i < selections.length; i++) {
      const craftable = item.crafting[i];
      if (craftable && selections[i]) {
        craftable.selectByParamDescription(selections[i]);
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
    const itemTypes = Object.keys(this.gameData.essenceCrafting.itemTypes);
    for (const itemType of itemTypes) {
      const craftables = this._getOptionsForItemType(itemType, ml);
      affixes = affixes.concat(craftables.reduce((accum: Array<Affix>, a: Craftable) =>
        accum.concat(a.options.reduce((innerAccum: Array<Affix>, b: CraftableOption) =>
          innerAccum.concat(b.affixes),
          [] as Array<Affix>)), [] as Array<Affix>));
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
    const essenceCraftingData = this.gameData.essenceCrafting;
    const affixList = essenceCraftingData.itemTypes[itemType]?.[essenceCraftingSlot] ?? [];
    const cappedMl = Math.min(Math.max(ml, 1), this.maxLevel);
    
    const slotOptions: Array<CraftableOption> = [];
    for (const optionName of affixList) {
      const compound = essenceCraftingData.compounds?.[optionName];
      if (compound) {
        // Named as the crafting device names it, so the player knows what to make; the
        // option's details tooltip lists its affixes. A name also carries it in build URLs.
        const affixes = Object.entries(compound.affixes).map(([affix, progression]) =>
          this._buildAffix(optionName, affix, progression[cappedMl - 1] ?? 0));
        slotOptions.push(new CraftableOption({ name: compound.name, affixes }));
        continue;
      }
      const affixes = this._getOptionAffixNames(optionName).map(affix =>
        this._buildAffix(optionName, affix, essenceCraftingData.progression[optionName]?.[cappedMl - 1] ?? 0));
      slotOptions.push(new CraftableOption({ affixes }));
    }

    return new Craftable(essenceCraftingSlot, slotOptions);
  }

  private _getOptionAffixNames(optionName: string): string[] {
    const mappedAffixes = this.gameData.essenceCrafting.affixes?.[optionName] ?? optionName;
    return Array.isArray(mappedAffixes) ? mappedAffixes : [mappedAffixes];
  }

  private _buildAffix(optionName: string, affix: string, value: number): Affix {
    if (optionName.startsWith('Insightful')) {
      return new Affix({ name: affix.replace('Insightful ', ''), value, type: 'Insight' });
    }
    return new Affix({ name: affix, value, type: this.gameData.essenceCrafting.bonusTypes[affix] || 'Enhancement' });
  }
}
