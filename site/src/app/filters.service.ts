import { Injectable } from '@angular/core';

import { BehaviorSubject } from 'rxjs';

import { ItemFilters } from './item-filters';

import { QueryParamsService } from './query-params.service';


@Injectable({
  providedIn: 'root'
})
export class FiltersService {
  private params: BehaviorSubject<any>;

  private itemFilters = new BehaviorSubject<ItemFilters>(new ItemFilters());

  constructor(
    private queryParams: QueryParamsService
  ) {
    this.params = new BehaviorSubject<any>(null);

    this.setLevelRange(ItemFilters.MIN_LEVEL(), ItemFilters.MAX_LEVEL());

    this.queryParams.register(this, this.params);
    this.queryParams.subscribe(this);
  }

  getItemFilters() {
    return this.itemFilters.asObservable();
  }

  setShowRaidItems(bShow: boolean) {
    const newFilters = new ItemFilters(this.itemFilters.getValue());

    if (bShow == newFilters.showRaidItems) {
      return;
    }

    newFilters.showRaidItems = bShow;
    this.itemFilters.next(newFilters);

    this._updateRouterState();
  }

  setLevelRange(min: number, max: number) {
    const newFilters = new ItemFilters(this.itemFilters.getValue());

    if (min == newFilters.levelRange[0] && max == newFilters.levelRange[1]) {
      return;
    }

    const curMin = newFilters.levelRange[0];

    min = Math.max(ItemFilters.MIN_LEVEL(), min);
    max = Math.min(ItemFilters.MAX_LEVEL(), max);

    // Fix backwards ranges by bringing the one that didn't move to the one that did.
    if (min > max) {
      if (min !== curMin) {
        max = min;
      } else {
        min = max;
      }
    }

    newFilters.levelRange = [min, max];

    this.itemFilters.next(newFilters);

    this._updateRouterState();
  }

  updateFromParams(params) {
    for (const key of params.keys) {
      if (key === 'levelrange') {
        const vals = params.get(key).split(',');
        this.setLevelRange(vals[0], vals[1]);
      } else if (key === 'raids') {
        this.setShowRaidItems(params.get(key) === 'true');
      }
    }
  }

  _updateRouterState() {
    const params = {};
    params['levelrange'] = this.itemFilters.getValue().levelRange.join(',');
    params['raids'] = this.itemFilters.getValue().showRaidItems;
    this.params.next(params);
  }
}
