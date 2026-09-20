import type { MockedObject } from 'vitest';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterModule } from '@angular/router';
import { of } from 'rxjs';

import { AppComponent } from './app.component';
import { AppModule } from './app.module';
import { AuthService } from './shared/auth.service';
import { BuildUrlCodecService } from './build/build-url-codec.service';
import { BuildsService } from './build/builds.service';
import { CurrentBuildService } from './build/current-build.service';
import { EquippedService } from './planner/equipped.service';
import { FiltersService } from './planner/filters.service';
import { Item } from './gear/item';
import { QueryParamsService } from './build/query-params.service';

// Router navigation is promise-driven; wait for it (and anything it scheduled) to finish.
const settle = () => TestBed.inject(ApplicationRef).whenStable();

// Uses the real AppComponent (not a bare <router-outlet> stub) as the root:
// a build-shortId route (/build/:shortId(/:slug)) is loaded directly by
// MainComponent, but the root route with a ?b=...&__buildRef=... query
// string - what a dirty edit's URL, or a browser back/forward through one,
// looks like - is only ever decoded by AppComponent's own NavigationEnd
// subscription (updateFromLocation -> queryParams.updateFromParams). A bare
// router-outlet stub would silently skip that whole path.
//
// A real <router-outlet> is required for the Router to actually instantiate
// MainComponent for a navigation - without one mounted, navigateByUrl()
// resolves the route tree/guards but never activates a component, so
// getByShortId would never be called regardless of whether the underlying
// bug is real.
//
// Regression coverage for switching between two saved builds (as
// MyBuildsComponent.open() does via router.navigateByUrl): both
// /build/:shortId/:slug URLs match the SAME route config, so Angular's
// default RouteReuseStrategy reuses MainComponent rather than
// destroying/recreating it - relying on ActivatedRoute.paramMap re-emitting
// rather than a fresh ngOnInit. main.component.spec.ts's own tests mock
// paramMap as a manually-driven BehaviorSubject, which only proves the
// component reacts correctly *if* paramMap re-emits - it doesn't prove the
// real Angular Router actually does so for this navigation. This test goes
// through the real Router/AppModule instead to cover that end-to-end.
describe('switching between two saved builds via the real router', () => {
  let buildsService: MockedObject<BuildsService>;

  beforeEach(() => {
    buildsService = {
      getByShortId: vi.fn().mockName('BuildsService.getByShortId'),
      listMine: vi.fn().mockName('BuildsService.listMine')
    } as unknown as MockedObject<BuildsService>;
    buildsService.listMine.mockReturnValue(of([]));

    TestBed.configureTestingModule({
      imports: [AppModule, RouterModule]
    });
    TestBed.overrideProvider(BuildsService, { useValue: buildsService });
    TestBed.overrideProvider(AuthService, {
      useValue: { isAuthenticated$: of(false), user$: of(null), isLoading$: of(false), signIn: () => { }, signOut: () => { } }
    });
  });

  it('re-fetches when navigating from one saved build straight to another (same route config)', async () => {
    // These placeholder blobs reference gear item names that don't exist in
    // the (unloaded, in this test) real game data, which EquippedService
    // logs and skips rather than throws on - silence that expected noise.
    vi.spyOn(console, 'log').mockReturnValue(undefined);
    const codec = TestBed.inject(BuildUrlCodecService);
    const blobA = codec.encode({ Weapon: 'Sword' });
    const blobB = codec.encode({ Weapon: 'Axe' });
    buildsService.getByShortId.mockReturnValue(of({ name: 'Build A', blob: blobA }));
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const router = TestBed.inject(Router);

    router.navigateByUrl('/build/aaaaaaaa/build-a');
    await settle();
    fixture.detectChanges();

    expect(buildsService.getByShortId).toHaveBeenCalledWith('aaaaaaaa');
    const currentBuild = TestBed.inject(CurrentBuildService);
    expect(currentBuild.value.shortId).toBe('aaaaaaaa');
    expect(currentBuild.value.name).toBe('Build A');

    buildsService.getByShortId.mockClear();
    buildsService.getByShortId.mockReturnValue(of({ name: 'Build B', blob: blobB }));

    router.navigateByUrl('/build/bbbbbbbb/build-b');
    await settle();
    fixture.detectChanges();

    expect(buildsService.getByShortId).toHaveBeenCalledWith('bbbbbbbb');
    // The actual regression to guard against: CurrentBuildService (and thus
    // the whole app - build name, equipped gear, etc.) must reflect the
    // *new* build, not stay stuck on the previous one.
    expect(currentBuild.value.shortId).toBe('bbbbbbbb');
    expect(currentBuild.value.name).toBe('Build B');
  });

  it('re-fetches a different build after editing and saving the currently loaded one in place', async () => {
    // Exact reported repro: load a build, edit it (dirty -> URL drops to
    // root, a DIFFERENT route config than build/:shortId/:slug, so
    // MainComponent is destroyed/recreated), save it in place (navigates
    // back to its own /build/:shortId/:slug, ANOTHER destroy/recreate),
    // then switch to a different saved build (same route config as the
    // just-saved one, so THIS transition relies on route reuse/paramMap).
    // Empty (no gear) blobs - this test is about routing/reactivity, not
    // gear lookups, and GearDbService has no real item data loaded here.
    const codec = TestBed.inject(BuildUrlCodecService);
    const blobA = codec.encode({});
    const blobB = codec.encode({});
    buildsService.getByShortId.mockReturnValue(of({ name: 'Build A', blob: blobA }));
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const currentBuild = TestBed.inject(CurrentBuildService);
    const queryParams = TestBed.inject(QueryParamsService);
    const equipped = TestBed.inject(EquippedService);

    router.navigateByUrl('/build/aaaaaaaa/build-a');
    await settle();
    fixture.detectChanges();
    expect(currentBuild.value.shortId).toBe('aaaaaaaa');

    // Equip exactly one slot and leave every other slot empty - the actual
    // root cause (see equipped.service.ts's _updateRouterState fix) only
    // showed up when getCombinedParams() included at least one untouched,
    // empty slot alongside a real item.
    equipped.set(new Item({ name: 'Test Shield', slot: 'Offhand', type: 'Large shields', ml: 1, affixes: [], crafting: [] }));
    await settle();
    fixture.detectChanges();
    expect(currentBuild.value.isDirty).toBe(true);
    expect(router.url).not.toContain('/build/aaaaaaaa');

    // Save in place: same effects as BuildActionsComponent.saveInPlace(),
    // driven directly since the HTTP call itself isn't what's under test -
    // including the canonicalParamsCache write that's what actually
    // reproduced the crash (a getCombinedParams() snapshot with the
    // equipped Offhand item alongside every other, empty slot).
    currentBuild.markSaved({
      savedBuildId: 'build-1',
      shortId: 'aaaaaaaa',
      name: 'Build A',
      canonicalParams: queryParams.getCombinedParams() as Record<string, string | string[]>
    });
    router.navigateByUrl('/build/aaaaaaaa/build-a', { replaceUrl: true });
    await settle();
    fixture.detectChanges();
    expect(currentBuild.value.isDirty).toBe(false);
    expect(router.url).toContain('/build/aaaaaaaa');

    // Now switch to a different build. Before the fix, the cache-reapply
    // step just above threw uncaught inside route.paramMap's subscribe
    // callback, silently killing that subscription - this navigation would
    // still update the URL (the Router doesn't care), but
    // MainComponent.loadBuildFromRoute would never run again, so neither
    // of the assertions below would hold.
    buildsService.getByShortId.mockClear();
    buildsService.getByShortId.mockReturnValue(of({ name: 'Build B', blob: blobB }));

    router.navigateByUrl('/build/bbbbbbbb/build-b');
    await settle();
    fixture.detectChanges();

    expect(buildsService.getByShortId).toHaveBeenCalledWith('bbbbbbbb');
    expect(currentBuild.value.shortId).toBe('bbbbbbbb');
    expect(currentBuild.value.name).toBe('Build B');
  });

  it('still shows dirty after switching away and back via browser history to an edited-but-unsaved build', async () => {
    // Reported bug: load A, edit it (dirty), switch to a different build B
    // (clean), then browser back to A's dirty URL - the gear/identity
    // restore correctly (buildIdentityFromUrl$ -> restoreIdentity), but
    // isDirty silently carried over B's clean value, since
    // combinedParamsChanges used to only fire on live edits, never on a
    // URL-driven restore like this one. See combinedParamsChanges' comment
    // in query-params.service.ts for the fix. Uses a filter edit (not gear)
    // - FiltersService needs no GearDbService item lookup, so it works
    // without real game data loaded, unlike a real equip/findGearBySlot
    // round-trip would in this test harness.
    const codec = TestBed.inject(BuildUrlCodecService);
    const blobA = codec.encode({});
    const blobB = codec.encode({});
    buildsService.getByShortId.mockReturnValue(of({ name: 'Build A', blob: blobA }));
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const currentBuild = TestBed.inject(CurrentBuildService);
    const filters = TestBed.inject(FiltersService);

    router.navigateByUrl('/build/aaaaaaaa/build-a');
    await settle();
    fixture.detectChanges();

    filters.setLevelRange(5, 10);
    await settle();
    fixture.detectChanges();
    expect(currentBuild.value.isDirty).toBe(true);
    const dirtyUrl = router.url;

    buildsService.getByShortId.mockReturnValue(of({ name: 'Build B', blob: blobB }));
    router.navigateByUrl('/build/bbbbbbbb/build-b');
    await settle();
    fixture.detectChanges();
    expect(currentBuild.value.shortId).toBe('bbbbbbbb');
    expect(currentBuild.value.isDirty).toBe(false);

    // Browser back to A's dirty URL, captured above.
    router.navigateByUrl(dirtyUrl);
    await settle();
    fixture.detectChanges();

    expect(currentBuild.value.shortId).toBe('aaaaaaaa');
    expect(currentBuild.value.isDirty).toBe(true);
  });

  it('keeps the loaded build\'s identity (name/shortId) on the very first edit', async () => {
    // Reported bug: load a saved build, make one change - the build gets
    // silently renamed to "Untitled build" and forgets it's a saved build
    // at all. The drop-to-root-on-dirty navigation (navigateWithParams)
    // crosses from the build/:shortId/:slug route config to root - a
    // DIFFERENT config, so MainComponent is destroyed and recreated even
    // for this very first, purely-app-internal edit. The new instance's
    // ngOnInit re-subscribes to queryParams.buildIdentityFromUrl$, a
    // ReplaySubject(1) - which immediately replays whatever it last emitted
    // (commonly null, from some earlier plain navigation, since this
    // specific self-triggered write is deliberately skipped by
    // AppComponent's consumeAppUrlWrite() and never re-emits a fresh
    // value). MainComponent's subscriber treats a null identity with no
    // route shortId as "genuinely landed on a fresh scratch build" and
    // calls currentBuild.reset() - wiping the name/shortId/savedBuildId
    // CurrentBuildService (a singleton, otherwise unaffected by MainComponent
    // being recreated) already had exactly right.
    const codec = TestBed.inject(BuildUrlCodecService);
    const blobA = codec.encode({});
    buildsService.getByShortId.mockReturnValue(of({ name: 'Build A', blob: blobA }));
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const currentBuild = TestBed.inject(CurrentBuildService);
    const filters = TestBed.inject(FiltersService);

    // Visit the bare scratch root first, as a real session normally would
    // (even just the app's initial load) - this is what leaves
    // queryParams.buildIdentityFromUrl$ (a ReplaySubject(1)) holding a
    // stale `null`, which is the actual trigger for the bug below. Going
    // straight to the build route from a brand new TestBed never exercises
    // this, which is why an earlier version of this test passed without
    // the fix.
    router.navigateByUrl('/');
    await settle();
    fixture.detectChanges();

    router.navigateByUrl('/build/aaaaaaaa/build-a');
    await settle();
    fixture.detectChanges();
    expect(currentBuild.value.name).toBe('Build A');
    expect(currentBuild.value.shortId).toBe('aaaaaaaa');

    // The very first edit - triggers the self-navigated drop to root.
    filters.setLevelRange(5, 10);
    await settle();
    fixture.detectChanges();

    expect(router.url).not.toContain('/build/aaaaaaaa');
    expect(currentBuild.value.isDirty).toBe(true);
    expect(currentBuild.value.name).toBe('Build A');
    expect(currentBuild.value.shortId).toBe('aaaaaaaa');
  });
});
