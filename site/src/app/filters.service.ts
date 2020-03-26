import { Injectable } from '@angular/core';

import { BehaviorSubject } from 'rxjs';

import { QueryParamsService } from './query-params.service';

@Injectable({
  providedIn: 'root'
})
export class FiltersService {
  private params: BehaviorSubject<any>;

  private levelRange: BehaviorSubject<[number, number]>;

  private showRaidItems: BehaviorSubject<boolean>;

  private MIN_LEVEL = 1;
  private MAX_LEVEL = 30;

  constructor(
    private queryParams: QueryParamsService
  ) {
    this.levelRange = new BehaviorSubject<[number, number]>([this.MIN_LEVEL, this.MAX_LEVEL]);
    this.params = new BehaviorSubject<any>(null);
    this.showRaidItems = new BehaviorSubject<boolean>(true);

    this.setLevelRange(this.MIN_LEVEL, this.MAX_LEVEL);

    this.queryParams.register(this, this.params);
    this.queryParams.subscribe(this);
  }

  getLevelRange() {
    return this.levelRange.asObservable();
  }

  getShowRaidItems() {
    return this.showRaidItems.asObservable();
  }

  setShowRaidItems(bShow: boolean) {
    this.showRaidItems.next(bShow);

    this._updateRouterState();
  }

  setLevelRange(min: number, max: number) {
    const curMin = this.levelRange.getValue()[0];
    const curMax = this.levelRange.getValue()[1];

    min = Math.max(this.MIN_LEVEL, min);
    max = Math.min(this.MAX_LEVEL, max);

    // Fix backwards ranges by bringing the one that didn't move to the one that did.
    if (min > max) {
      if (min !== curMin) {
        max = min;
      } else {
        min = max;
      }
    }

    this.levelRange.next([min, max]);

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
    params['levelrange'] = this.levelRange.getValue().join(',');
    params['raids'] = this.showRaidItems.getValue();
    this.params.next(params);
  }
}
