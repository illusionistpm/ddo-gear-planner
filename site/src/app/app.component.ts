import { Component, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

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
    private readonly queryParams: QueryParamsService,
    private readonly equipped: EquippedService,
    private readonly filters: FiltersService
  ) {}

  ngOnInit() {
    this.route.queryParamMap.subscribe(params => {
      this.queryParams.updateFromParams(params);
    });
  }
}
