import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';

// 'main' and 'affixes' were canonical routes while hash-routed (#/main,
// #/affixes) - now that they're visible path segments, redirect to the
// clean root instead of surfacing them. A plain string `redirectTo` does
// NOT preserve query params in Angular's router, so redirect explicitly via
// a guard that carries them over.
export const redirectLegacyRouteToRootGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  return inject(Router).createUrlTree(['/'], { queryParams: route.queryParams });
};
