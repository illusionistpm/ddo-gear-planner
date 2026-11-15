import { Injectable } from '@angular/core';

import { RawCraftingData, RawEssenceCraftingData, RawFiligreeData, RawItem, RawItemBonusData, RawSetData } from './game-data-types';

/** A dynamically imported JSON module's value, whether or not the bundler wraps it in `default`. */
function jsonModuleValue<T>(module: { default?: T }): T {
  return module.default ?? (module as T);
}

/**
 * Loads the large game-data JSON files (items, crafting, essence crafting, sets, filigree, item bonuses) via
 * dynamic import so they land in their own lazy chunks instead of being inlined into
 * the initial bundle. Call load() once during app startup (see APP_INITIALIZER in
 * app.module.ts) before anything reads the data fields below.
 */
@Injectable({
  providedIn: 'root'
})
export class GameDataService {
  items!: RawItem[];
  crafting!: RawCraftingData;
  essenceCrafting!: RawEssenceCraftingData;
  sets!: RawSetData;
  filigree!: RawFiligreeData;
  itemBonuses!: RawItemBonusData;

  private loadPromise?: Promise<void>;

  load(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = Promise.all([
        import('@data/items.json'),
        import('@data/crafting.json'),
        import('@data/essence-crafting.json'),
        import('@data/sets.json'),
        import('@data/filigree.json'),
        import('@data/item-bonuses.json'),
      ]).then(([items, crafting, essenceCrafting, sets, filigree, itemBonuses]) => {
        this.items = jsonModuleValue<RawItem[]>(items);
        this.crafting = jsonModuleValue<RawCraftingData>(crafting);
        this.essenceCrafting = jsonModuleValue<RawEssenceCraftingData>(essenceCrafting);
        this.sets = jsonModuleValue<RawSetData>(sets);
        this.filigree = jsonModuleValue<RawFiligreeData>(filigree);
        this.itemBonuses = jsonModuleValue<RawItemBonusData>(itemBonuses);
      });
    }
    return this.loadPromise;
  }
}
