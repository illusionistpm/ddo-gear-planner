import { Observable, BehaviorSubject } from 'rxjs';
import { Component, OnInit } from '@angular/core';

import { FiltersService } from '../filters.service';

import itemTypesList from 'src/assets/item-types.json';

@Component({
  selector: 'app-filters',
  templateUrl: './filters.component.html',
  styleUrls: ['./filters.component.css']
})
export class FiltersComponent implements OnInit {
  minLevel: number;
  maxLevel: number;
  showRaidItems: boolean;
  typeToGroup = new Map<string, string>();
  hiddenTypesMap = new Map<string, Array<string>>();
  groupsMap = new Map<string, BehaviorSubject<Array<string>>>();

  constructor(
    public filters: FiltersService,
  ) {
    filters.getItemFilters().subscribe(itemFilters => {
      this.minLevel = itemFilters.levelRange[0];
      this.maxLevel = itemFilters.levelRange[1];
      this.showRaidItems = itemFilters.showRaidItems;

      const groups = this.splitTypeSetIntoGroups(itemFilters.hiddenItemTypes);
      for (let key of groups.keys()) {
        if (this.groupsMap.has(key)) {
          this.groupsMap.get(key).next(groups.get(key))
        }
      }
    });
  }

  ngOnInit() {
  }

  onChangeLevelRange() {
    this.filters.setLevelRange(this.minLevel, this.maxLevel);
  }
  
  getTypesWithAttribute(searchAttributes: Array<string>) {
    const key = searchAttributes.sort().join(' ');

    const types = new Array<string>();
    
    for (let type in itemTypesList) {
      const attributes = itemTypesList[type]['attributes'];
      if (searchAttributes.every(e => attributes.includes(e))) {
        types.push(type);
      }
    }

    // Build a mapping of type ("long sword") back to group ("one-handed melee")
    types.forEach(t => this.typeToGroup.set(t, key));

    return types;
  }

  onChangeFilteredTypes(event: Set<string>, groupName: string) {
    const combinedItems = new Set<string>();

    this.hiddenTypesMap.set(groupName, Array.from(event));
    
    for (let key of this.hiddenTypesMap.keys()) {
        this.hiddenTypesMap.get(key).forEach(e => combinedItems.add(e));
    }

    this.filters.setHiddenTypes(combinedItems);
  }

  onChangeShowRaidItems() {
    this.filters.setShowRaidItems(this.showRaidItems);
  }

  splitTypeSetIntoGroups(list: Set<string>) {
    const out = new Map<string, Array<string>>();

    list.forEach(e => {
      const group = this.typeToGroup.get(e);

      if (!out.has(group)) {
        out.set(group, new Array<string>());
      }

      out.get(group).push(e);
    });

    return out;
  }
}
