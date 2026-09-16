import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';

import { isBuildShortIdRoute } from './build-route';
import { CurrentBuildService } from './current-build.service';
import { MainComponent } from './main/main.component';

// Covers navigating in-app away from MainComponent to a different route.
// Browser-chrome navigation (closing the tab, a hard refresh, typing a new
// URL) is covered separately by AppComponent's beforeunload listener, which
// can't be reused here since a CanDeactivate guard runs for Angular
// navigation, not browser-level unload.
//
// Note this does NOT cover switching between two builds while staying on
// the same route config (e.g. /build/:shortId -> /build/:otherShortId, as
// MyBuildsComponent's row-click does) - Angular's default RouteReuseStrategy
// reuses the component instance for that rather than deactivating it, so
// CanDeactivate never fires. That path checks isDirty itself instead - see
// MyBuildsComponent.open().
export const unsavedChangesGuard: CanDeactivateFn<MainComponent> = (_component, _currentRoute, _currentState, nextState) => {
  const currentBuild = inject(CurrentBuildService);
  if (!currentBuild.value.isDirty) {
    return true;
  }

  // Every route in app-routing.module.ts resolves to this same
  // MainComponent - '' and build/:shortId(/:slug) are only different route
  // *configs* (so Angular deactivates/reactivates across them instead of
  // reusing the component, per RouteReuseStrategy's default same-object
  // comparison), not different destinations a user could meaningfully
  // "leave" the build editor for. QueryParamsService's navigateWithParams
  // crosses exactly this boundary on purpose, dropping/restoring a loaded
  // build's shortId from the URL as it goes dirty/clean - confirming on
  // every single edit would defeat the point. Only prompt when the
  // destination is genuinely outside that set (there isn't one today, but
  // this keeps the guard meaningful if one's ever added).
  const nextPath = nextState.url.split('?')[0];
  if (nextPath === '' || nextPath === '/' || isBuildShortIdRoute(nextPath)) {
    return true;
  }

  return window.confirm('You have unsaved changes. Leave without saving?');
};
