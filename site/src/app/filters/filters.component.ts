import { Component, OnInit } from '@angular/core';

import { FiltersService } from '../filters.service';

@Component({
    selector: 'app-filters',
    templateUrl: './filters.component.html',
    styleUrls: ['./filters.component.css'],
    standalone: false
})
export class FiltersComponent implements OnInit {
  minLevel: number;
  maxLevel: number;
  showRaidItems: boolean;

  constructor(
    public filters: FiltersService,
  ) {
    filters.getItemFilters().subscribe(itemFilters => {
      this.minLevel = itemFilters.levelRange[0];
      this.maxLevel = itemFilters.levelRange[1];
      this.showRaidItems = itemFilters.showRaidItems;
    });
  }

  ngOnInit() {
  }

  onChangeLevelRange() {
    this.filters.setLevelRange(this.minLevel, this.maxLevel);
  }
  
  onChangeShowRaidItems() {
    this.filters.setShowRaidItems(this.showRaidItems);
  }
}
