import { Component, ChangeDetectionStrategy, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { Subscription, filter } from 'rxjs';

import { environment } from '../environments/environment';
import { AuthService } from './shared/auth.service';
import { EquippedService } from './planner/equipped.service';
import { FiltersService } from './planner/filters.service';
import { QueryParamsService } from './build/query-params.service';
import { CurrentBuildService } from './build/current-build.service';
import { isBuildShortIdRoute, isStillNeededRoute, routePathOf, urlWithoutFragment } from './build/build-route';
import { hasUnsavedWork } from './build/unsaved-changes.guard';
import { PlannerOnboardingService } from './planner/planner-onboarding.service';
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
  // Browser back/forward replays the user's own edit history - not a link
  // they followed - so it mustn't switch the intro off mid-way through it.
  private navigationIsPopstate = false;
  // The last URL navigated to, less its fragment, to tell a navigation that
  // only changes the view apart from one that changes the build.
  private lastUrlWithoutFragment: string | null = null;

  constructor(
    private readonly router: Router,
    private readonly queryParams: QueryParamsService,
    private readonly equipped: EquippedService,
    private readonly filters: FiltersService,
    private readonly currentBuild: CurrentBuildService,
    private readonly auth: AuthService,
    private readonly onboarding: PlannerOnboardingService,
    private readonly titleService: Title
  ) {}

  ngOnInit() {
    this.routerEventsSubscription = this.router.events.pipe(
      filter((event): event is NavigationStart | NavigationEnd => event instanceof NavigationStart || event instanceof NavigationEnd)
    ).subscribe(event => {
      if (event instanceof NavigationStart) {
        this.navigationIsPopstate = event.navigationTrigger === 'popstate';
      } else {
        this.updateFromLocation();
      }
    });

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
  // is lost across it - a pure false alarm there too. "Dirty" itself means
  // hasUnsavedWork: a build with no gear never prompts.
  warnOnUnload = environment.production;

  @HostListener('window:beforeunload', ['$event'])
  warnOnUnsavedChanges(event: BeforeUnloadEvent) {
    if (this.warnOnUnload && hasUnsavedWork(this.currentBuild, this.equipped) && !this.auth.isRedirectingAwayForAuth) {
      event.preventDefault();
      event.returnValue = true;
    }
  }

  private updateFromLocation() {
    const done = perfStart('AppComponent.updateFromLocation');
    const previousUrl = this.lastUrlWithoutFragment;
    this.lastUrlWithoutFragment = urlWithoutFragment(this.router.url);
    if (this.queryParams.consumeAppUrlWrite()) {
      done({ skipped: 'appUrlWrite' });
      perfAfterFrames('paint after skipped app navigation');
      return;
    }
    if (this.lastUrlWithoutFragment === previousUrl) {
      // Only the fragment changed - Back from the shopping list, say. That's
      // the view, not the build (see shopping-list-link.ts): the build on
      // screen is already this URL's.
      done({ skipped: 'fragmentOnly' });
      return;
    }

    const routePath = routePathOf(this.router.url);
    if (isStillNeededRoute(routePath)) {
      // A friend's still-needed page reads its build itself, and leaves the
      // planner as it was - applying this URL's (empty) params would clear it.
      done({ skipped: 'stillNeededRoute' });
      return;
    }
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
    // A long build link (?b=..., or legacy flat params) - including a reload
    // of one, which is the same thing from here. A no-op when it carried no
    // gear, so a bare '/' still gets the intro.
    if (!this.navigationIsPopstate) {
      this.onboarding.bypassForBuildLink();
    }
    done({ applied: true });
    perfAfterFrames('paint after URL restore');
  }
}
