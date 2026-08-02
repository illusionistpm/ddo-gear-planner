import { Component, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { EquippedService } from './equipped.service';
import { FiltersService } from './filters.service';
import { QueryParamsService } from './query-params.service';

@Component({
    selector: 'app-root',
    template: `
    <app-admin-link></app-admin-link>
    <router-outlet></router-outlet>
  `,
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class AppComponent implements OnInit {
  title = 'DDO Gear Planner';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly queryParams: QueryParamsService,
    private readonly equipped: EquippedService,
    private readonly filters: FiltersService
  ) {}

  ngOnInit() {
    this.queryParams.updateFromParams(this.getParamsFromHash());

    this.route.queryParamMap.subscribe(params => {
      this.queryParams.updateFromParams(params);
    });
  }

  private getParamsFromHash() {
    const hash = window.location.hash || '';
    const queryIndex = hash.indexOf('?');
    if (queryIndex < 0) {
      return {
        keys: [],
        get: () => null,
        getAll: () => []
      };
    }

    const searchParams = new URLSearchParams(hash.slice(queryIndex + 1));
    return {
      keys: Array.from(searchParams.keys()),
      get: (key: string) => searchParams.get(key),
      getAll: (key: string) => searchParams.getAll(key)
    };
  }
}
