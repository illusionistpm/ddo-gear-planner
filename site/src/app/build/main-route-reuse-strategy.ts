import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, DetachedRouteHandle, RouteReuseStrategy } from '@angular/router';

import { MainComponent } from '../main/main.component';

// Angular's default strategy only reuses a component across navigations
// whose ActivatedRouteSnapshot.routeConfig is the SAME object - so '' and
// 'build/:shortId(/:slug)' count as different destinations even though they
// all render MainComponent, and every navigation between them destroys and
// recreates it. That's deliberate for guarding *actual* navigation away
// from the build editor (see unsavedChangesGuard's comment), but it also
// means the one transition QueryParamsService.navigateWithParams makes on
// purpose - dropping/restoring a loaded build's shortId as it goes
// dirty/clean - tears down and rebuilds the whole page each time, along
// with every bit of transient view state that isn't explicitly persisted
// elsewhere (scroll position was the reported case).
//
// This reuses MainComponent across any pair of its own routes, the same
// way the default strategy already reuses it across two different shortId
// values on 'build/:shortId' - MainComponent's own ngOnInit comment
// documents relying on exactly that. Every other page is reused only on
// the same route with the same params: those pages read their params once,
// so /list/a -> /list/b reusing the page left it showing list a.
@Injectable({ providedIn: 'root' })
export class MainRouteReuseStrategy implements RouteReuseStrategy {
  shouldDetach(): boolean {
    return false;
  }

  store(): void {
    // No detached routes are ever offered to store - shouldDetach is
    // always false - so there's nothing to do here.
  }

  shouldAttach(): boolean {
    return false;
  }

  retrieve(): DetachedRouteHandle | null {
    return null;
  }

  shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    if (this.isMainRoute(future) && this.isMainRoute(curr)) {
      return true;
    }
    // Any other page - a list of several builds, a friend's still-needed
    // page - reads its params once, so another list is a page of its own
    // rather than this one showing the last list's under the new URL.
    return future.routeConfig === curr.routeConfig && sameParams(future, curr);
  }

  private isMainRoute(snapshot: ActivatedRouteSnapshot): boolean {
    return snapshot.routeConfig?.component === MainComponent;
  }
}

function sameParams(a: ActivatedRouteSnapshot, b: ActivatedRouteSnapshot): boolean {
  const keys = new Set([...Object.keys(a.params), ...Object.keys(b.params)]);
  return [...keys].every(key => a.params[key] === b.params[key]);
}
