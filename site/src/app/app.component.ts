import { Component, ChangeDetectionStrategy, OnDestroy, OnInit } from '@angular/core';
import { Subscription, fromEvent } from 'rxjs';

import { EquippedService } from './equipped.service';
import { FiltersService } from './filters.service';
import { QueryParamsService } from './query-params.service';
import { perfAfterFrames, perfStart } from './perf-trace';

@Component({
    selector: 'app-root',
    template: `
    <app-admin-link></app-admin-link>
    <router-outlet></router-outlet>
  `,
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'DDO Gear Planner';

  private hashChangeSubscription?: Subscription;

  constructor(
    private readonly queryParams: QueryParamsService,
    private readonly equipped: EquippedService,
    private readonly filters: FiltersService
  ) {}

  ngOnInit() {
    this.updateFromHash();
    this.hashChangeSubscription = fromEvent(window, 'hashchange').subscribe(() => this.updateFromHash());
  }

  ngOnDestroy() {
    this.hashChangeSubscription?.unsubscribe();
  }

  private updateFromHash() {
    const done = perfStart('AppComponent.updateFromHash');
    if (this.queryParams.consumeAppUrlWrite()) {
      done({ skipped: 'appUrlWrite' });
      perfAfterFrames('paint after skipped app hashchange');
      return;
    }

    this.queryParams.updateFromParams(this.getParamsFromHash());
    done({ applied: true });
    perfAfterFrames('paint after URL restore');
  }

  private getParamsFromHash() {
    const hash = window.location.hash || '';
    const queryIndex = hash.indexOf('?');
    const searchParams = queryIndex < 0
      ? new URLSearchParams()
      : new URLSearchParams(hash.slice(queryIndex + 1));

    return {
      keys: Array.from(searchParams.keys()),
      get: (key: string) => searchParams.get(key),
      getAll: (key: string) => searchParams.getAll(key)
    };
  }
}
