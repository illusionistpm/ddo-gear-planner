import { Injectable, OnDestroy } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

import { isGroupRunRoute, isStillNeededRoute, routePathOf, urlWithoutFragment } from './build-route';
import { SHOPPING_LIST_FRAGMENT } from './shopping-list-link';

/**
 * Where a shopping list's page goes back to: the planner as it last was,
 * build and all, without the open list's fragment. The planner's services
 * are root, so the build is still there when it's back; only its URL needs
 * remembering. MainComponent injects this, so it's watching from the first
 * planner page on. A list page reached straight from a link has none, and
 * goes to a new build.
 */
@Injectable({ providedIn: 'root' })
export class ListReturnService implements OnDestroy {
  private plannerUrl: string | null = null;
  private readonly subscription: Subscription;

  constructor(router: Router) {
    // Before the first navigation ends, router.url is '/' whatever the page.
    if (router.navigated) {
      this.remember(router.url);
    }
    this.subscription = router.events.pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(event => this.remember(event.urlAfterRedirects));
  }

  /** The planner's URL to go back to. */
  get url(): string {
    return this.plannerUrl ?? '/';
  }

  /** Whether the planner was shown before, so there's a build to go back to. */
  get hasPlanner(): boolean {
    return this.plannerUrl !== null;
  }

  /** The planner's URL with its build's shopping list open. */
  get listUrl(): string {
    return `${this.url}#${SHOPPING_LIST_FRAGMENT}`;
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  private remember(url: string): void {
    const path = routePathOf(url);
    if (!isGroupRunRoute(path) && !isStillNeededRoute(path)) {
      this.plannerUrl = urlWithoutFragment(url);
    }
  }
}
