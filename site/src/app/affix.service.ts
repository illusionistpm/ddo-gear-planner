import { Injectable } from '@angular/core';

import { Affix } from './affix';
import { Item } from './item';

import affixGroupsList from 'src/assets/affix-groups.json';
import affixSynonymsList from 'src/assets/affix-synonyms.json';

@Injectable({
  providedIn: 'root'
})
export class AffixService {
  affixGroups = new Map<string, Array<string>>();
  affixSynonyms = new Map<string, string>();

  constructor() {
    for (const group of affixGroupsList) {
      const affixNames = [];
      for (const affix of group['affixes']) {
        affixNames.push(affix);
      }
      this.affixGroups.set(group['name'], affixNames);
    }

    for (const synonymGroup of affixSynonymsList) {
      for (const syn of synonymGroup['synonyms']) {
        this.affixSynonyms[syn] = synonymGroup['name'];
      }
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
    }
    return affixes;
  }

  resolvesToAffix(givenAffixName, targetAffixName): boolean {
    if (givenAffixName === targetAffixName) {
      return true;
    }

    const resolvedName = this.getResolvedAffixName(givenAffixName);

    if (!this.affixGroups.has(resolvedName)) {
      return false;
    }

    const affixNames = this.affixGroups.get(resolvedName);

    for (const affixName of affixNames) {
      if (affixName === targetAffixName) {
        return true;
      }
    }

    return false;
  }

  getResolvedAffixName(affixName): string {
    return this.affixSynonyms.has(affixName) ? this.affixSynonyms.get(affixName) : affixName;
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

  getCanonicalName(affixName: string) {
    return this.affixSynonyms[affixName] || affixName;
  }
}
