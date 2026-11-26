import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { NewBuildService } from '../start/new-build.service';

export const START_PATH = '/start';
/** Starting a new build: the start page's guided setup, past its landing. */
export const NEW_BUILD_URL = `${START_PATH}#role`;

/**
 * A visit to the bare site - nothing in the URL - starts on the start page:
 * your builds, or a guided new one. Only the page load itself: the app's own
 * navigations to "/" (Blank build, a deleted build) mean the planner, and so
 * does any URL carrying a build or a sign-in callback. A viewer can ask for
 * the planner every time (NewBuildService.prefersPlanner).
 */
export const startRedirectGuard: CanActivateFn = route => {
  const router = inject(Router);
  // A fragment is a view on the planner (#shopping-list): a reload of it stays there.
  if (router.navigated || Object.keys(route.queryParams).length || route.fragment
    || inject(NewBuildService).prefersPlanner()) {
    return true;
  }
  return router.createUrlTree([START_PATH]);
};
