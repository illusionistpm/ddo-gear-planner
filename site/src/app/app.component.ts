import { Component, ChangeDetectionStrategy, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription, filter } from 'rxjs';

import { environment } from '../environments/environment';
import { AuthService } from './shared/auth.service';
import { EquippedService } from './planner/equipped.service';
import { FiltersService } from './planner/filters.service';
import { QueryParamsService } from './build/query-params.service';
import { CurrentBuildService } from './build/current-build.service';
import { isBuildShortIdRoute } from './build/build-route';
import { perfAfterFrames, perfStart } from './shared/perf-trace';

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
  private buildNameSubscription?: Subscription;

  constructor(
    private readonly router: Router,
    private readonly queryParams: QueryParamsService,
    private readonly equipped: EquippedService,
    private readonly filters: FiltersService,
    private readonly currentBuild: CurrentBuildService,
    private readonly auth: AuthService,
    private readonly titleService: Title
  ) {}

  ngOnInit() {
    this.routerEventsSubscription = this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd)
    ).subscribe(() => this.updateFromLocation());

    this.buildNameSubscription = this.currentBuild.state$.subscribe(state => {
      this.titleService.setTitle(state.name ? `${state.name} - ${this.title}` : this.title);
    });
  }

  ngOnDestroy() {
    this.routerEventsSubscription?.unsubscribe();
    this.buildNameSubscription?.unsubscribe();
  }

  // Covers the browser-chrome paths a router guard can't (closing the tab,
  // a hard refresh, typing a new URL) - in-app navigation away is instead
  // covered by unsaved-changes.guard.ts's CanDeactivate, which can show a
  // real confirm dialog instead of the browser's generic one. Excludes a
  // sign-in/sign-out redirect specifically (see AuthService.
  // isRedirectingAwayForAuth) - both round-trip back to this exact build,
  // so the browser's generic warning there is a pure false alarm. Also off in
  // dev builds: ng serve's live reload triggers a full page reload on every
  // rebuild, and since the URL already carries the whole edit state nothing
  // is lost across it - a pure false alarm there too.
  warnOnUnload = environment.production;

  @HostListener('window:beforeunload', ['$event'])
  warnOnUnsavedChanges(event: BeforeUnloadEvent) {
    if (this.warnOnUnload && this.currentBuild.value.isDirty && !this.auth.isRedirectingAwayForAuth) {
      event.preventDefault();
      event.returnValue = true;
    }
  }

  private updateFromLocation() {
    const done = perfStart('AppComponent.updateFromLocation');
    if (this.queryParams.consumeAppUrlWrite()) {
      done({ skipped: 'appUrlWrite' });
      perfAfterFrames('paint after skipped app navigation');
      return;
    }

    const routePath = this.router.url.split('?')[0];
    const queryParamMap = this.router.parseUrl(this.router.url).queryParamMap;
    if (isBuildShortIdRoute(routePath) && !queryParamMap.has('b')) {
      // A bare /build/:shortId(/:slug) URL (no b= at all) is a fresh load -
      // MainComponent fetches and decodes the canonical saved build by
      // shortId itself. Applying an empty param set here would race that
      // async fetch and clobber it.
      //
      // A b= param IS meaningful on this route shape, though: editing a
      // loaded build accumulates one here as you go (see
      // BuildActionsComponent's comment on saveInPlace) precisely so
      // browser back/forward through those edits has something to restore -
      // this is what actually reads it back into EquippedService/
      // FiltersService. Skipping unconditionally here (as this used to)
      // left every back/forward through an edit session's URL changes
      // updating the address bar with no visible effect, since nothing
      // downstream of the URL ever re-applied it.
      done({ skipped: 'buildShortIdRouteWithoutCompactParam' });
      return;
    }

    this.queryParams.updateFromParams(queryParamMap);
    done({ applied: true });
    perfAfterFrames('paint after URL restore');
  }
}
