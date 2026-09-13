import { Component, ChangeDetectionStrategy, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

import { EquippedService } from './equipped.service';
import { FiltersService } from './filters.service';
import { QueryParamsService } from './query-params.service';
import { perfAfterFrames, perfStart } from './perf-trace';

@Component({
    selector: 'app-root',
    template: `
    <router-outlet></router-outlet>
  `,
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'DDO Gear Planner';

  private routerEventsSubscription?: Subscription;

  constructor(
    private readonly router: Router,
    private readonly queryParams: QueryParamsService,
    private readonly equipped: EquippedService,
    private readonly filters: FiltersService
  ) {}

  ngOnInit() {
    this.routerEventsSubscription = this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd)
    ).subscribe(() => this.updateFromLocation());
  }

  ngOnDestroy() {
    this.routerEventsSubscription?.unsubscribe();
  }

  private updateFromLocation() {
    const done = perfStart('AppComponent.updateFromLocation');
    if (this.queryParams.consumeAppUrlWrite()) {
      done({ skipped: 'appUrlWrite' });
      perfAfterFrames('paint after skipped app navigation');
      return;
    }

    this.queryParams.updateFromParams(this.router.parseUrl(this.router.url).queryParamMap);
    done({ applied: true });
    perfAfterFrames('paint after URL restore');
  }
}
