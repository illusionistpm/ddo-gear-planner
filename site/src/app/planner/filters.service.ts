import { Injectable } from '@angular/core';

import { BehaviorSubject } from 'rxjs';

import { ItemFilters } from '../gear/item-filters';

import { ParamsAdapter, QueryParamsListener, QueryParamsService } from '../build/query-params.service';
import { QueryParamRecord } from '../build/query-param-types';
import {
  HIDDEN_PACKS_KEY, HIDDEN_TYPES_KEY, LEVEL_RANGE_KEY, RAIDS_KEY, RARE_KEY
} from '../build/build-param-keys';
import { perfMeasure } from '../shared/perf-trace';


@Injectable({
  providedIn: 'root'
})
export class FiltersService implements QueryParamsListener {

  private params: BehaviorSubject<QueryParamRecord | null>;

  /** The filters the gear, effects and shopping list are built from. */
  private itemFilters = new BehaviorSubject<ItemFilters>(new ItemFilters());
  /**
   * The filters as the filter controls show them. The same as itemFilters, except while
   * changes are held: then the controls move at once and the gear catches up on release.
   */
  private editedFilters = new BehaviorSubject<ItemFilters>(this.itemFilters.getValue());
  private holding = false;
  private maxLevel = 30;

  constructor(
    private queryParams: QueryParamsService
  ) {
    this.params = new BehaviorSubject<QueryParamRecord | null>(null);

    this.setLevelRange(ItemFilters.MIN_LEVEL(), ItemFilters.MAX_LEVEL());

    this.queryParams.register(this, this.params);
    this.queryParams.subscribe(this);
  }

  getItemFilters() {
    return this.itemFilters.asObservable();
  }

  /** What the filter controls show: the filters, including any changes being held. */
  getEditedFilters() {
    return this.editedFilters.asObservable();
  }

  /**
   * Holds filter changes back from everything built on the filters until
   * applyHeldChanges. Every change rebuilds the filtered gear and what depends on it,
   * which takes a noticeable moment; the filter sheet covers the planner, so it holds
   * them while open and the planner rebuilds once, when it closes.
   */
  holdChanges() {
    this.holding = true;
  }

  applyHeldChanges() {
    this.holding = false;
    this.commit();
  }

  private edit(change: (filters: ItemFilters) => boolean) {
    const newFilters = new ItemFilters(this.editedFilters.getValue());
    if (!change(newFilters)) {
      return;
    }
    this.editedFilters.next(newFilters);
    if (!this.holding) {
      this.commit();
    }
  }

  private commit() {
    const edited = this.editedFilters.getValue();
    if (edited === this.itemFilters.getValue()) {
      return;
    }
    this.itemFilters.next(edited);
    this._updateRouterState();
  }

  getMaxLevel() {
    return this.maxLevel;
  }

  setShowRaidItems(bShow: boolean) {
    this.edit(filters => {
      if (bShow == filters.showRaidItems) {
        return false;
      }
      filters.showRaidItems = bShow;
      return true;
    });
  }

  setShowRareItems(bShow: boolean) {
    this.edit(filters => {
      if (bShow == filters.showRareItems) {
        return false;
      }
      filters.showRareItems = bShow;
      return true;
    });
  }

  setMaxLevel(max: number) {
    this.maxLevel = max;
    this.setLevelRange(ItemFilters.MIN_LEVEL(), this.maxLevel);
  }

  setLevelRange(min: number, max: number) {
    this.edit(filters => {
      if (min == filters.levelRange[0] && max == filters.levelRange[1]) {
        return false;
      }

      const curMin = filters.levelRange[0];

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

      filters.levelRange = [min, max];
      return true;
    });
  }

  setHiddenTypes(hiddenTypes: Set<string>) {
    this.edit(filters => {
      if (this.areSetsEqual(hiddenTypes, filters.hiddenItemTypes)) {
        return false;
      }
      filters.hiddenItemTypes = hiddenTypes;
      return true;
    });
  }

  setHiddenPacks(hiddenPacks: Set<string>) {
    this.edit(filters => {
      if (this.areSetsEqual(hiddenPacks, filters.hiddenPacks)) {
        return false;
      }
      filters.hiddenPacks = hiddenPacks;
      return true;
    });
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

  updateFromParams(params: ParamsAdapter) {
    // A navigation (a build loaded, history) replaces the filters outright, held
    // changes included, and applies at once.
    const wasHolding = this.holding;
    this.holding = false;
    try {
      this.applyParams(params);
    } finally {
      this.holding = wasHolding;
    }
  }

  private applyParams(params: ParamsAdapter) {
    return perfMeasure('FiltersService.updateFromParams', () => {
      const levelRangeParam = params.get(LEVEL_RANGE_KEY);
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

      const raidsParam = params.get(RAIDS_KEY);
      this.setShowRaidItems(raidsParam === null ? true : raidsParam === 'true');

      const rareParam = params.get(RARE_KEY);
      this.setShowRareItems(rareParam === null ? true : rareParam === 'true');

      const hiddenTypes = new Set<string>();
      const hiddenTypesParam = params.get(HIDDEN_TYPES_KEY);
      if (hiddenTypesParam) {
        hiddenTypesParam.split(',')
          .filter((element: string) => element)
          .forEach((element: string) => {
            hiddenTypes.add(element);
          });
      }
      this.setHiddenTypes(hiddenTypes);

      const hiddenPacks = new Set<string>();
      const hiddenPacksParam = params.get(HIDDEN_PACKS_KEY);
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
    const params: Record<string, string> = {};
    params[LEVEL_RANGE_KEY] = this.itemFilters.getValue().levelRange.join(',');
    // Stringified, not raw booleans: updateFromParams above does a strict
    // === 'true' string comparison. Round-tripping through an actual URL
    // (or BuildUrlCodecService) coerces this automatically, but
    // QueryParamsService.getCombinedParams()'s raw snapshot - reapplied
    // directly by CurrentBuildService.canonicalParamsCache, e.g. right
    // after an in-place Save navigates back to the build's own canonical
    // URL - doesn't. A real boolean here silently flipped showRaidItems/
    // showRareItems to false after every save (true !== 'true').
    params[RAIDS_KEY] = String(this.itemFilters.getValue().showRaidItems);
    params[RARE_KEY] = String(this.itemFilters.getValue().showRareItems);
    params[HIDDEN_TYPES_KEY] = Array.from(this.itemFilters.getValue().hiddenItemTypes).join(',');
    params[HIDDEN_PACKS_KEY] = Array.from(this.itemFilters.getValue().hiddenPacks).join(',');
    this.params.next(params);
  }
}
