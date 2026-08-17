import { Injectable } from '@angular/core';

import { BehaviorSubject } from 'rxjs';
import { Item } from './item';

import { ItemFilters } from './item-filters';

import { QueryParamsService } from './query-params.service';
import { perfMeasure } from './perf-trace';


@Injectable({
  providedIn: 'root'
})
export class FiltersService {
  static readonly NO_PACK_FILTER = '__NO_PACK__';

  private params: BehaviorSubject<any>;

  private itemFilters = new BehaviorSubject<ItemFilters>(new ItemFilters());
  private maxLevel = 30;

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

  setShowRareItems(bShow: boolean) {
    const newFilters = new ItemFilters(this.itemFilters.getValue());

    if (bShow == newFilters.showRareItems) {
      return;
    }

    newFilters.showRareItems = bShow;
    this.itemFilters.next(newFilters);

    this._updateRouterState();
  }

  setMaxLevel(max: number) {
    this.maxLevel = max;
    this.setLevelRange(ItemFilters.MIN_LEVEL(), this.maxLevel);
  }

  setLevelRange(min: number, max: number) {
    const newFilters = new ItemFilters(this.itemFilters.getValue());

    if (min == newFilters.levelRange[0] && max == newFilters.levelRange[1]) {
      return;
    }

    const curMin = newFilters.levelRange[0];

    min = Math.max(ItemFilters.MIN_LEVEL(), min);
    max = Math.max(ItemFilters.MIN_LEVEL(), max);

    // Ensure the min is less than / equal to the max, and vice versa    
    min = Math.min(this.maxLevel, min);
    max = Math.min(this.maxLevel, max);

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

  setHiddenTypes(hiddenTypes: Set<string>) {
    const newFilters = new ItemFilters(this.itemFilters.getValue());
    if (this.areSetsEqual(hiddenTypes, newFilters.hiddenItemTypes)) {
      return;
    }

    newFilters.hiddenItemTypes = hiddenTypes;
    this.itemFilters.next(newFilters);
    this._updateRouterState();
  }

  setHiddenPacks(hiddenPacks: Set<string>) {
    const newFilters = new ItemFilters(this.itemFilters.getValue());
    if (this.areSetsEqual(hiddenPacks, newFilters.hiddenPacks)) {
      return;
    }

    newFilters.hiddenPacks = hiddenPacks;
    this.itemFilters.next(newFilters);
    this._updateRouterState();
  }

  private areSetsEqual(left: Set<string>, right: Set<string>) {
    if (left.size !== right.size) {
      return false;
    }

    for (const value of left) {
      if (!right.has(value)) {
        return false;
      }
    }

    return true;
  }

  updateFromParams(params: any) {
    return perfMeasure('FiltersService.updateFromParams', () => {
      const levelRangeParam = params.get('levelrange');
      if (levelRangeParam) {
        const vals = levelRangeParam.split(',');
        const min = Number(vals[0]);
        const max = Number(vals[1]);
        if (!Number.isNaN(min) && !Number.isNaN(max)) {
          this.setLevelRange(min, max);
        }
      } else {
        this.setLevelRange(ItemFilters.MIN_LEVEL(), this.maxLevel);
      }

      const raidsParam = params.get('raids');
      this.setShowRaidItems(raidsParam === null ? true : raidsParam === 'true');

      const rareParam = params.get('rare');
      this.setShowRareItems(rareParam === null ? true : rareParam === 'true');

      const hiddenTypes = new Set<string>();
      const hiddenTypesParam = params.get('hiddentypes');
      if (hiddenTypesParam) {
        hiddenTypesParam.split(',')
          .filter((element: string) => element)
          .forEach((element: string) => {
            hiddenTypes.add(element);
          });
      }
      this.setHiddenTypes(hiddenTypes);

      const hiddenPacks = new Set<string>();
      const hiddenPacksParam = params.get('hiddenpacks');
      if (hiddenPacksParam) {
        hiddenPacksParam.split(',')
          .filter((element: string) => element)
          .forEach((element: string) => {
            hiddenPacks.add(element);
          });
      }
      this.setHiddenPacks(hiddenPacks);
    });
  }

  _updateRouterState() {
    const params: Record<string, string | boolean> = {};
    params['levelrange'] = this.itemFilters.getValue().levelRange.join(',');
    params['raids'] = this.itemFilters.getValue().showRaidItems;
    params['rare'] = this.itemFilters.getValue().showRareItems;
    params['hiddentypes'] = Array.from(this.itemFilters.getValue().hiddenItemTypes).join(',');
    params['hiddenpacks'] = Array.from(this.itemFilters.getValue().hiddenPacks).join(',');
    this.params.next(params);
  }
}
