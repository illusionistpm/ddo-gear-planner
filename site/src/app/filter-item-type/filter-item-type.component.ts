import { Component, OnInit } from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';

import { FiltersService } from '../filters.service';

import itemTypesList from 'src/assets/item-types.json';

@Component({
  selector: 'app-filter-item-type',
  templateUrl: './filter-item-type.component.html',
  styleUrls: ['./filter-item-type.component.css']
})
export class FilterItemTypeComponent implements OnInit {
  typeToGroup = new Map<string, string>();
  hiddenTypesMap = new Map<string, Array<string>>();
  groupsMap = new Map<string, BehaviorSubject<Array<string>>>();

  constructor(
    public filters: FiltersService,
  ) {
    filters.getItemFilters().subscribe(itemFilters => {
      const groups = this.splitTypeSetIntoGroups(itemFilters.hiddenItemTypes);
      for (let key of groups.keys()) {
        if (this.groupsMap.has(key)) {
          this.groupsMap.get(key).next(groups.get(key))
        }
      }
    });    
   }

  ngOnInit(): void {
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
