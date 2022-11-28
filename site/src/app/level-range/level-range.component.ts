import { Component, OnInit } from '@angular/core';

import { FiltersService } from '../filters.service';

import itemTypesList from 'src/assets/item-types.json';

@Component({
  selector: 'app-level-range',
  templateUrl: './level-range.component.html',
  styleUrls: ['./level-range.component.css']
})
export class LevelRangeComponent implements OnInit {
  minLevel: number;
  maxLevel: number;
  showRaidItems: boolean;
  hiddenTypes: Set<string>;

  constructor(
    public filters: FiltersService,
  ) {
    filters.getItemFilters().subscribe(itemFilters => {
      this.minLevel = itemFilters.levelRange[0];
      this.maxLevel = itemFilters.levelRange[1];
      this.showRaidItems = itemFilters.showRaidItems;
      this.hiddenTypes = itemFilters.hiddenItemTypes;
    });
  }

  ngOnInit() {
  }

  onChangeLevelRange() {
    this.filters.setLevelRange(this.minLevel, this.maxLevel);
  }
  
  getTypesWithAttribute(searchAttributes: Array<string>) {
    const types = [];
    
    for (let type in itemTypesList) {
      const attributes = itemTypesList[type]['attributes'];
      if (searchAttributes.every(e => attributes.includes(e))) {
        types.push(type);
      }
    }

    return types;
  }

  onChangeFilteredTypes() {
    this.filters.setHiddenTypes(this.hiddenTypes);
  }

  onChangeShowRaidItems() {
    this.filters.setShowRaidItems(this.showRaidItems);
  }
}
