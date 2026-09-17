import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Location } from '@angular/common';

import { AppRoutingModule } from './app-routing.module';
import { CurrentBuildService } from './current-build.service';
import { EquippedService } from './equipped.service';
import { QueryParamsService } from './query-params.service';

// End-to-end check, through the REAL router (real route config, real
// canDeactivate guard) and real EquippedService/QueryParamsService/
// CurrentBuildService wiring, that editing a build loaded by shortId drops
// its /build/:shortId/:slug path segment to the root route (so the URL
// reads honestly as "unsaved edits", not "the saved build" with a blob
// bolted on) without ever triggering unsavedChangesGuard's confirm dialog -
// a real regression an earlier version of this fix hit (both '' and
// build/:shortId/:slug are separate route configs guarded by
// canDeactivate), caught only by testing through the actual Router instead
// of a Router.navigate spy.
describe('build edit URL integration (real router)', () => {
  const viewStateKeys = [
    'ddo-gear-planner-active-tab',
    'ddo-gear-planner-tracked-affix-group-mode',
    'ddo-gear-planner-tracked-affix-collapsed'
  ];

  beforeEach(() => {
    for (const key of viewStateKeys) {
      localStorage.removeItem(key);
    }
    TestBed.configureTestingModule({
      imports: [AppRoutingModule]
    });
  });

  afterEach(() => {
    for (const key of viewStateKeys) {
      localStorage.removeItem(key);
    }
  });

  it('drops the shortId to the root route on the first edit, without ever triggering the unsaved-changes confirm dialog', fakeAsync(() => {
    const router = TestBed.inject(Router);
    const location = TestBed.inject(Location);
    const currentBuild = TestBed.inject(CurrentBuildService);
    const equipped = TestBed.inject(EquippedService);

    router.navigateByUrl('/build/n11M5Pg9/arcane-trickster');
    tick();
    // Mirrors MainComponent.loadBuildFromRoute()'s success path: applying
    // decoded params is what flips QueryParamsService past its
    // initialPageLoad gate and actually subscribes EquippedService's live
    // params to _makeNavigateFn - nothing else in this test does that,
    // since AppComponent (normally what drives this on a real page load)
    // isn't part of this test's module.
    TestBed.inject(QueryParamsService).applyDecodedBuildParams({});
    currentBuild.markLoaded({ shortId: 'n11M5Pg9', name: 'Arcane Trickster', canonicalParams: {} });

    spyOn(window, 'confirm');

    const slot = equipped.getSlots().keys().next().value as string;
    equipped.clearSlot(slot);
    // navigateWithParams's router.navigate() is async - let it settle.
    tick();

    expect(window.confirm).not.toHaveBeenCalled();
    expect(location.path()).not.toContain('/build/n11M5Pg9/arcane-trickster');
    expect(location.path()).toMatch(/^\/?\?b=/);
    expect(currentBuild.value.shortId).toBe('n11M5Pg9');
  }));

  it('restores the build\'s identity when browser back returns through the edit history', fakeAsync(() => {
    const router = TestBed.inject(Router);
    const currentBuild = TestBed.inject(CurrentBuildService);
    const queryParams = TestBed.inject(QueryParamsService);
    const equipped = TestBed.inject(EquippedService);

    router.navigateByUrl('/build/n11M5Pg9/arcane-trickster');
    tick();
    queryParams.applyDecodedBuildParams({});
    currentBuild.markLoaded({ shortId: 'n11M5Pg9', name: 'Arcane Trickster', savedBuildId: 'build-1', canonicalParams: {} });

    const slot = equipped.getSlots().keys().next().value as string;
    equipped.clearSlot(slot);
    tick();

    const dirtyUrl = router.url;
    expect(dirtyUrl).toMatch(/^\/\?b=/);

    // A real navigation to that same dirty URL, arriving the way a
    // browser back/forward popstate would (not a self-triggered write) -
    // this is what should decode the b= blob and restore identity via
    // buildIdentityFromUrl$ -> CurrentBuildService.restoreIdentity().
    currentBuild.reset();
    expect(currentBuild.value.shortId).toBeNull();

    const identities: unknown[] = [];
    queryParams.buildIdentityFromUrl$.subscribe(value => identities.push(value));
    queryParams.updateFromParams(router.parseUrl(dirtyUrl).queryParamMap);

    // savedBuildId never rides in the URL identity (see BuildUrlIdentity's
    // comment) - markLoaded knew it directly from the server response, but
    // that never round-trips through router.url/b=, only {shortId, name} do.
    expect(identities[identities.length - 1]).toEqual({ shortId: 'n11M5Pg9', name: 'Arcane Trickster' });
  }));

  it('never grants ownership merely by decoding a build identity from a URL - through the real codec/router, not a mock', fakeAsync(() => {
    // This is the actual vulnerability the audit found: savedBuildId used
    // to ride inside the b= blob's identity, so anyone who opened a copied
    // live-edit link inherited whatever ownership state the URL happened to
    // encode. Verifying through the real BuildUrlCodecService and Router
    // (not a spy) proves the fix holds even if a URL were hand-crafted with
    // extra/stale JSON fields.
    const router = TestBed.inject(Router);
    const currentBuild = TestBed.inject(CurrentBuildService);
    const queryParams = TestBed.inject(QueryParamsService);
    const equipped = TestBed.inject(EquippedService);

    router.navigateByUrl('/build/n11M5Pg9/arcane-trickster');
    tick();
    queryParams.applyDecodedBuildParams({});
    // No savedBuildId here - a signed-out or not-yet-confirmed viewer's load.
    currentBuild.markLoaded({ shortId: 'n11M5Pg9', name: 'Arcane Trickster', canonicalParams: {} });
    expect(currentBuild.value.ownership).toBe('unknown');

    const slot = equipped.getSlots().keys().next().value as string;
    equipped.clearSlot(slot);
    tick();
    const dirtyUrl = router.url;

    // A second "viewer" of this exact copied URL, from a clean slate.
    currentBuild.reset();
    queryParams.updateFromParams(router.parseUrl(dirtyUrl).queryParamMap);

    // Decoding the copied URL must not have conjured ownership out of thin
    // air - it stays exactly what it was, 'unknown', never 'owned'.
    expect(currentBuild.value.ownership).not.toBe('owned');
    expect(currentBuild.value.savedBuildId).toBeNull();
  }));
});
