import { Injectable } from '@angular/core';

import { Item } from './item';
import { Affix } from './affix';
import { Craftable } from './craftable';
import { CraftableOption } from './craftable-option';

import cannithList from 'src/assets/cannith.json';

@Injectable({
  providedIn: 'root'
})
export class CannithService {
  levels: Array<number>;

  constructor() {
    this.levels = [];
    for (let ml = 34; ml >= 1; ml--) {
      this.levels.push(ml);
    }
  }

  setItemToML(item: Item, ml: number) {
    const indexes = [];
    for(const craftable of item.crafting) {
      indexes.push(craftable.options.findIndex(a => a === craftable.selected));
    }

    item.ml = ml;
    item.crafting = this.getValuesForML(item.slot, ml);

    for(let i = 0; i < indexes.length; i++) {
      const craftable = item.crafting[i];
      craftable.selected = craftable.options[indexes[i]];
    }
  }

  getValuesForML(itemType: string, ml: number) {
    const craftingOptions = new Array<Craftable>();

    //JAK: FIXME!! Hack - Weapon and Offhand will have the same issue, but aren't as trivial to fix
    if (itemType === 'Ring1' || itemType === 'Ring2') {
      itemType = 'Ring';
    }

    const locations = cannithList['itemTypes'][itemType];

    for (const location of ['Prefix', 'Suffix', 'Extra']) {
      const newOptions = [];
      for (let affix of locations[location]) {
        const option = new CraftableOption(null);
        const value = cannithList['progression'][affix][ml - 1];
        let type = 'Enhancement';
        if (affix.startsWith('Insightful')) {
          affix = affix.replace('Insightful ', '');
          type = 'Insight';
        } else {
          const bonusType = cannithList['bonusTypes'][affix];
          if (bonusType) {
            type = bonusType;
          }

        }
        option.affixes.push(new Affix({ name: affix, value, type }));
        newOptions.push(new CraftableOption(option));
      }
      craftingOptions.push(new Craftable(location, newOptions));
    }

    return craftingOptions;
  }
}
