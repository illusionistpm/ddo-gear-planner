import { Injectable } from '@angular/core';

import { Affix } from './affix';
import { Item } from './item';

import affixGroupsList from 'src/assets/affix-groups.json';

@Injectable({
  providedIn: 'root'
})
export class AffixService {
  affixGroups = new Map<string, Array<string>>();

  constructor() {
    for (const group of affixGroupsList) {
      const affixNames = [];
      for (const affix of group['affixes']) {
        affixNames.push(affix);
      }
      this.affixGroups.set(group['name'], affixNames);
    }
  }

  ungroupAffix(affixGroup: Affix) {
    const affixes = [];
    const affixNames = this.affixGroups.get(affixGroup.name);
    if (affixNames) {
      for (const affixName of affixNames) {
        // Copy all properties from the affix group (mainly type and value)
        const affix = new Affix(affixGroup);
        affix.name = affixName;
        affixes.push(affix);
      }
    } else {
      affixes.push(affixGroup);
    }
    return affixes;
  }

  flattenAffixGroups(affixes: Array<Affix>, includeOriginal: boolean = false) {
    let flattened = [];
    for (const affix of affixes) {
      const ungroup = this.ungroupAffix(affix);
      if (ungroup) {
        if (includeOriginal) {
          flattened.push(affix);
        }
        flattened = flattened.concat(ungroup);
      } else {
        flattened.push(affix);
      }
    }
    return flattened;
  }

  isAffixGroup(affix: Affix) {
    const affixNames = this.affixGroups.get(affix.name);
    return affixNames != undefined;
  }

  getActiveAffixes(item: Item) {
    const affixes = item.getActiveAffixes();
    return this.flattenAffixGroups(affixes, true);
  }
}
