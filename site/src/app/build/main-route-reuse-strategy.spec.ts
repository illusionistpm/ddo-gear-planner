import { ActivatedRouteSnapshot, Route } from '@angular/router';

import { GroupRunPageComponent } from '../group-run-page/group-run-page.component';
import { MainComponent } from '../main/main.component';
import { MainRouteReuseStrategy } from './main-route-reuse-strategy';

const root: Route = { path: '', component: MainComponent };
const build: Route = { path: 'build/:shortId', component: MainComponent };
const list: Route = { path: 'list/:shortId', component: GroupRunPageComponent };

function snapshot(routeConfig: Route, params: Record<string, string> = {}): ActivatedRouteSnapshot {
  return { routeConfig, params } as unknown as ActivatedRouteSnapshot;
}

describe('MainRouteReuseStrategy', () => {
  const strategy = new MainRouteReuseStrategy();

  it('keeps the planner across its own routes and builds', () => {
    expect(strategy.shouldReuseRoute(snapshot(build, { shortId: 'a' }), snapshot(build, { shortId: 'b' }))).toBe(true);
    expect(strategy.shouldReuseRoute(snapshot(root), snapshot(build, { shortId: 'a' }))).toBe(true);
  });

  it('makes another list a page of its own, keeping the page for the same list', () => {
    expect(strategy.shouldReuseRoute(snapshot(list, { shortId: 'a' }), snapshot(list, { shortId: 'a' }))).toBe(true);
    expect(strategy.shouldReuseRoute(snapshot(list, { shortId: 'b' }), snapshot(list, { shortId: 'a' }))).toBe(false);
  });

  it('never keeps a page across different routes', () => {
    expect(strategy.shouldReuseRoute(snapshot(list, { shortId: 'a' }), snapshot(build, { shortId: 'a' }))).toBe(false);
  });
});
