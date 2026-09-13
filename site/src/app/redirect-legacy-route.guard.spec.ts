import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, UrlTree } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';

import { redirectLegacyRouteToRootGuard } from './redirect-legacy-route.guard';

describe('redirectLegacyRouteToRootGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RouterTestingModule]
    });
  });

  it('redirects to root, preserving query params', () => {
    const router = TestBed.inject(Router);
    const route = { queryParams: { levelrange: '1,36', Weapon: 'Calamitous Battle Axe' } } as unknown as ActivatedRouteSnapshot;

    const result = TestBed.runInInjectionContext(() => redirectLegacyRouteToRootGuard(route, {} as any)) as UrlTree;

    expect(result instanceof UrlTree).toBeTrue();
    expect(result.toString()).toBe(router.createUrlTree(['/'], {
      queryParams: { levelrange: '1,36', Weapon: 'Calamitous Battle Axe' }
    }).toString());
  });

  it('preserves multi-value query params', () => {
    const route = { queryParams: { tracked: ['Strength', 'Constitution'] } } as unknown as ActivatedRouteSnapshot;

    const result = TestBed.runInInjectionContext(() => redirectLegacyRouteToRootGuard(route, {} as any)) as UrlTree;

    expect(result.queryParamMap.getAll('tracked')).toEqual(['Strength', 'Constitution']);
  });
});
