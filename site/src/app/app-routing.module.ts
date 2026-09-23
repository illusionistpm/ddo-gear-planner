import { NgModule } from '@angular/core';
import { RouteReuseStrategy, RouterModule, Routes } from '@angular/router';
import { MainComponent } from './main/main.component';
import { MainRouteReuseStrategy } from './build/main-route-reuse-strategy';
import { redirectLegacyRouteToRootGuard } from './build/redirect-legacy-route.guard';
import { unsavedChangesGuard } from './build/unsaved-changes.guard';

const routes: Routes = [
  { path: '', component: MainComponent, canDeactivate: [unsavedChangesGuard] },
  // Legacy deep links: 'main' and 'affixes' (the affix builder used to be
  // its own page) were canonical routes while hash-routed (#/main,
  // #/affixes) - now that they're visible path segments, redirect to the
  // clean root instead of surfacing them. `children: []` is required: the
  // router rejects a route with neither a component nor children (NG04014),
  // even one that always redirects via a guard.
  { path: 'main', canActivate: [redirectLegacyRouteToRootGuard], children: [] },
  { path: 'affixes', canActivate: [redirectLegacyRouteToRootGuard], children: [] },
  // shortId is the canonical lookup key; slug is a cosmetic, unvalidated copy
  // of the build name kept in the URL for readability only.
  { path: 'build/:shortId', component: MainComponent, canDeactivate: [unsavedChangesGuard] },
  { path: 'build/:shortId/:slug', component: MainComponent, canDeactivate: [unsavedChangesGuard] }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { useHash: false })],
  exports: [RouterModule],
  providers: [
    { provide: RouteReuseStrategy, useClass: MainRouteReuseStrategy }
  ]
})
export class AppRoutingModule { }
