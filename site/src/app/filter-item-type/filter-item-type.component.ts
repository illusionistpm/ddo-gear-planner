import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import { FiltersService } from '../filters.service';

import itemTypesList from 'src/assets/item-types.json';

@Component({
    selector: 'app-filter-item-type',
    templateUrl: './filter-item-type.component.html',
    styleUrls: ['./filter-item-type.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class FilterItemTypeComponent implements OnInit {
  typeToGroup = new Map<string, string>();
  hiddenTypesMap = new Map<string, Array<string>>();
  optionsMap = new Map<string, BehaviorSubject<Array<{name: string, value: boolean}>>>();
  groups = new Array<{name: string, attributes: Array<string>}>();

  constructor(
    public filters: FiltersService,
  ) {

    this.groups.push({name: "One-handed melee", attributes: ['one-handed', 'melee']});
    this.groups.push({name: "Two-handed melee", attributes: ['two-handed', 'melee']});
    this.groups.push({name: "Offhand", attributes: ['offhand']});
    this.groups.push({name: "Ranged", attributes: ['ranged']});
    this.groups.push({name: "Thrown", attributes: ['thrown']});
    this.groups.push({name: "Armor", attributes: ['armor']});

    // Preload the groups so they're ready when we need them
    for (let group of this.groups) {
      this.getTypesWithAttribute(group.attributes);
    }

    filters.getItemFilters().subscribe(itemFilters => {
      const groups = this.splitTypeSetIntoGroups(itemFilters.hiddenItemTypes);
      for (let key of groups.keys()) {
        const subject = this.getTypesWithAttribute([key]);
        const options = subject ? subject.getValue() : [];
        const groupValues = groups.get(key) || [];
        options.forEach(e => e.value = groupValues.includes(e.name));
        subject?.next(options);

        this.hiddenTypesMap.set(key, options.map(e => e.name));
      }
    });    
   }

  ngOnInit(): void {
  }

  getTypesWithAttribute(searchAttributes: Array<string>) {
    const key = searchAttributes.join(' ');

    if (this.optionsMap.has(key)) {
      return this.optionsMap.get(key);
    }

    const types = new Array<{name: string, value: boolean}>();
    
    const itemTypes = itemTypesList as Record<string, { attributes: Array<string> }>;
    for (let type in itemTypes) {
      const attributes = itemTypes[type]?.attributes || [];
      if (searchAttributes.every(e => attributes.includes(e))) {
        types.push({name: type, value: false});
      }
    }

    // Build a mapping of type ("long sword") back to group ("one-handed melee")
    types.forEach(t => this.typeToGroup.set(t.name, key));

    const subject = new BehaviorSubject<Array<{name: string, value: boolean}>>(types);
    this.optionsMap.set(key, subject);

    return subject;
  }

  makeOnChangeFn(groupName: string) {
    return (items: Array<{name: string, value: boolean}>): void => {
      const combinedItems = new Set<string>();

      this.hiddenTypesMap.set(groupName, items.filter(e => e.value).map(e => e.name));
      
      for (let key of this.hiddenTypesMap.keys()) {
          const hiddenItems = this.hiddenTypesMap.get(key);
          if (hiddenItems) {
            hiddenItems.forEach(e => combinedItems.add(e));
          }
      }
  
      this.filters.setHiddenTypes(combinedItems);
    };
  }

  splitTypeSetIntoGroups(list: Set<string>) {
    const out = new Map<string, Array<string>>();

    list.forEach(e => {
      const group = this.typeToGroup.get(e);
      if (group === undefined) {
        return;
      }

      if (!out.has(group)) {
        out.set(group, new Array<string>());
      }

      const groupItems = out.get(group);
      if (groupItems) {
        groupItems.push(e);
      }
    });

    return out;
  }
}
