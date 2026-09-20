import type { MockedObject } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';

import { AppModule } from '../app.module';
import { AuthService } from '../shared/auth.service';
import { BuildUrlCodecService } from '../build/build-url-codec.service';
import { BuildsService } from '../build/builds.service';
import { CurrentBuildService } from '../build/current-build.service';
import { BuildUrlIdentity, QueryParamsService } from '../build/query-params.service';
import { MainComponent } from './main.component';
import { EquippedService } from '../planner/equipped.service';
import { AffixBuilderDrawerService } from '../affix-builder-drawer/affix-builder-drawer.service';

describe('MainComponent', () => {
  let component: MainComponent;
  let fixture: ComponentFixture<MainComponent>;
  const onboardingStateKey = 'ddo-planner-onboarding-state-v1';
  const legacyOnboardingKey = 'ddo-planner-onboarding-affix-type-opened';
  const viewStateKeys = [
    'ddo-gear-planner-active-tab',
    'ddo-gear-planner-tracked-affix-group-mode',
    'ddo-gear-planner-tracked-affix-collapsed'
  ];

  beforeEach(async () => {
    localStorage.removeItem(onboardingStateKey);
    localStorage.removeItem(legacyOnboardingKey);
    for (const key of viewStateKeys) {
      localStorage.removeItem(key);
    }
    await TestBed.configureTestingModule({
      imports: [AppModule]
    })
      .compileComponents();
    // Real AppModule pulls in the real (Auth0) AuthService, whose
    // isLoading$ doesn't resolve synchronously - contentReady would stay
    // false through this describe block's single synchronous
    // detectChanges() otherwise, hiding the whole header (including
    // app-admin-link) these tests check. Stub it the same way the
    // "loading a build by shortId" describe block below does.
    TestBed.overrideProvider(AuthService, {
      useValue: { isAuthenticated$: of(false), user$: of(null), isLoading$: of(false), signIn: () => { }, signOut: () => { } }
    });
  });

  // contentReady's other half - queryParams.initialParamsApplied$ - is
  // normally driven by AppComponent's NavigationEnd handler calling
  // updateFromParams(), but AppComponent isn't part of this component-only
  // test setup. Drive it directly with the real QueryParamsService instance
  // so contentReady can actually reach true, same as a real (non-shortId)
  // page load would.
  beforeEach(() => {
    TestBed.inject(QueryParamsService).updateFromParams(convertToParamMap({}));
  });

  afterEach(() => {
    localStorage.removeItem(onboardingStateKey);
    localStorage.removeItem(legacyOnboardingKey);
    for (const key of viewStateKeys) {
      localStorage.removeItem(key);
    }
  });

  beforeEach(() => {
    // The empty-URL default adds a whole bundle, which would otherwise queue idle-time availability warmup.
    vi.spyOn(TestBed.inject(EquippedService) as any, '_scheduleAvailabilityWarmup').mockReturnValue(undefined);
    fixture = TestBed.createComponent(MainComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('starts an empty URL on the Basic package, in the setup screen', () => {
    const equipped = TestBed.inject(EquippedService);

    expect(equipped.getImportantAffixes().has('Dodge')).toBe(true);
    expect(equipped.getImportantAffixes().has('Melee Power')).toBe(false);
    expect(TestBed.inject(AffixBuilderDrawerService).mode).toBe('setup');
  });

  it('starts a new build (empty URL re-applied) on the Basic package, in the setup screen', () => {
    const equipped = TestBed.inject(EquippedService);
    const drawer = TestBed.inject(AffixBuilderDrawerService);

    // What's left over from the build being replaced.
    drawer.close();
    equipped.setImportantAffixes(['Strength']);

    TestBed.inject(QueryParamsService).updateFromParams(convertToParamMap({}));

    expect(equipped.getImportantAffixes().has('Strength')).toBe(false);
    expect(equipped.getImportantAffixes().has('Dodge')).toBe(true);
    expect(drawer.mode).toBe('setup');
  });

  it('renders non-production admin access in the workspace bar', () => {
    const compiled: HTMLElement = fixture.nativeElement;

    expect(compiled.querySelector('.planner-workspace-bar app-admin-link')).not.toBeNull();
  });

  it('starts on the equipment tab', () => {
    expect(component.activeTab).toBe('equipment');
    expect(component.filtersOpen).toBe(false);
  });

  it('toggles the filter sheet', () => {
    component.toggleFilters();

    expect(component.filtersOpen).toBe(true);

    component.closeFilters();

    expect(component.filtersOpen).toBe(false);
  });

  it('switches tabs without forcing a scroll position', () => {
    vi.spyOn(window, 'scrollTo').mockReturnValue(undefined);

    component.selectTab('affixes');

    expect(component.activeTab).toBe('affixes');
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('dismisses filters when selecting a view tab', () => {
    component.toggleFilters();
    component.selectTab('affixes');

    expect(component.filtersOpen).toBe(false);
    expect(component.activeTab).toBe('affixes');
  });

  it('pairs the tracked affixes tab green cue with intro text and a skip action', () => {
    component.trackedAffixesHint = true;

    expect(component.shouldHighlightTrackedAffixes()).toBe(true);
  });

  it('hides the tracked affixes onboarding cue when dismissed', () => {
    component.trackedAffixesHint = true;

    component.dismissIntro();

    expect(component.shouldHighlightTrackedAffixes()).toBe(false);
  });
});

describe('MainComponent - loading a build by shortId', () => {
  const onboardingStateKey = 'ddo-planner-onboarding-state-v1';

  let buildsService: MockedObject<BuildsService>;
  let queryParams: MockedObject<QueryParamsService>;
  let currentBuild: MockedObject<CurrentBuildService>;
  let codec: MockedObject<BuildUrlCodecService>;
  let router: MockedObject<Router>;
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let buildIdentity$: BehaviorSubject<BuildUrlIdentity | null>;

  function configure(initialShortId: string | null) {
    // Skip the onboarding/setup-drawer branch so it doesn't interfere with
    // asserting on build-loading behavior specifically.
    localStorage.setItem(onboardingStateKey, JSON.stringify({ completed: true, dismissed: true }));

    paramMap$ = new BehaviorSubject(convertToParamMap(initialShortId ? { shortId: initialShortId } : {}));
    buildIdentity$ = new BehaviorSubject<BuildUrlIdentity | null>(null);
    buildsService = {
      getByShortId: vi.fn().mockName('BuildsService.getByShortId'),
      listMine: vi.fn().mockName('BuildsService.listMine')
    } as unknown as MockedObject<BuildsService>;
    queryParams = {
      applyDecodedBuildParams: vi.fn().mockName('QueryParamsService.applyDecodedBuildParams'),
      getCombinedParams: vi.fn().mockName('QueryParamsService.getCombinedParams'),
      registerOwnedSlots: vi.fn().mockName('QueryParamsService.registerOwnedSlots'),
      register: vi.fn().mockName('QueryParamsService.register'),
      subscribe: vi.fn().mockName('QueryParamsService.subscribe'),
      initialParamsApplied$: of(undefined),
      buildIdentityFromUrl$: buildIdentity$
    } as unknown as MockedObject<QueryParamsService>;
    queryParams.getCombinedParams.mockReturnValue({});
    currentBuild = {
      markLoaded: vi.fn().mockName('CurrentBuildService.markLoaded'),
      confirmOwnership: vi.fn().mockName('CurrentBuildService.confirmOwnership'),
      reset: vi.fn().mockName('CurrentBuildService.reset'),
      restoreIdentity: vi.fn().mockName('CurrentBuildService.restoreIdentity'),
      getCanonicalParamsCache: vi.fn().mockName('CurrentBuildService.getCanonicalParamsCache'),
      value: { savedBuildId: null, shortId: null, name: null, isDirty: false, ownership: 'other' },
      // BuildActionsComponent (rendered inside MainComponent's template)
      // also injects CurrentBuildService and subscribes to state$.
      state$: of({ savedBuildId: null, shortId: null, name: null, isDirty: false, ownership: 'other' })
    } as unknown as MockedObject<CurrentBuildService>;
    currentBuild.getCanonicalParamsCache.mockReturnValue(null);
    codec = {
      decode: vi.fn().mockName('BuildUrlCodecService.decode'),
      encode: vi.fn().mockName('BuildUrlCodecService.encode')
    } as unknown as MockedObject<BuildUrlCodecService>;
    router = {
      navigateByUrl: vi.fn().mockName('Router.navigateByUrl'),
      parseUrl: vi.fn().mockName('Router.parseUrl'),
      url: '/'
    } as unknown as MockedObject<Router>;
    // Real Router.parseUrl(url).queryParamMap is what isOnAuthRedirectCallbackUrl()
    // reads to detect Auth0's transient code/state callback URL - none of
    // these tests exercise that URL, so a plain empty map is enough here.
    router.parseUrl.mockReturnValue({ queryParamMap: convertToParamMap({}) } as any);

    TestBed.configureTestingModule({
      imports: [AppModule],
      providers: [
        { provide: ActivatedRoute, useValue: { paramMap: paramMap$ } },
        { provide: BuildsService, useValue: buildsService },
        { provide: QueryParamsService, useValue: queryParams },
        { provide: CurrentBuildService, useValue: currentBuild },
        { provide: BuildUrlCodecService, useValue: codec },
        { provide: Router, useValue: router },
        {
          provide: AuthService,
          useValue: { isAuthenticated$: of(false), user$: of(null), isLoading$: of(false), signIn: () => { }, signOut: () => { } }
        }
      ]
    });
  }

  afterEach(() => {
    localStorage.removeItem(onboardingStateKey);
  });

  it('fetches, decodes, and applies the build when the route has a shortId', () => {
    configure('abc123');
    buildsService.getByShortId.mockReturnValue(of({ name: 'My Build', blob: 'z1.xxx' }));
    codec.decode.mockReturnValue({ Weapon: 'Calamitous Battle Axe' });

    TestBed.createComponent(MainComponent).detectChanges();

    expect(buildsService.getByShortId).toHaveBeenCalledWith('abc123');
    expect(queryParams.applyDecodedBuildParams).toHaveBeenCalledWith({ Weapon: 'Calamitous Battle Axe' });
    expect(currentBuild.markLoaded).toHaveBeenCalledWith({
      shortId: 'abc123', name: 'My Build', canonicalParams: { Weapon: 'Calamitous Battle Axe' }
    });
  });

  it('shows an "outdated link" error, keeping the URL intact, if the blob fails to decode', () => {
    // Previously redirected to '/' on ANY failure, throwing the URL away
    // with no way back - a decode failure (the codec dictionary is
    // versioned data - see build-url-codec.service.ts) is a genuinely
    // different situation from a 404 and shouldn't read as one.
    configure('abc123');
    buildsService.getByShortId.mockReturnValue(of({ name: 'My Build', blob: 'garbage' }));
    codec.decode.mockReturnValue(null);

    const fixture = TestBed.createComponent(MainComponent);
    fixture.detectChanges();

    expect(queryParams.applyDecodedBuildParams).not.toHaveBeenCalled();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(fixture.componentInstance.loadError).toBe('invalid-link');
    // Must actually flip true, or the error panel never replaces the boot
    // splash (see updateContentReady - isLoadingBuild has to go false on
    // every path out of the fetch, not just the success one).
    expect(fixture.componentInstance.contentReady).toBe(true);
  });

  it('shows a "not found" error, keeping the URL intact, for a 404', () => {
    configure('missing');
    buildsService.getByShortId.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));

    const fixture = TestBed.createComponent(MainComponent);
    fixture.detectChanges();

    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(fixture.componentInstance.loadError).toBe('not-found');
  });

  it('shows a retryable "network" error, keeping the URL intact, for anything other than a 404', () => {
    configure('abc123');
    buildsService.getByShortId.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));

    const fixture = TestBed.createComponent(MainComponent);
    fixture.detectChanges();

    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(fixture.componentInstance.loadError).toBe('network');
  });

  it('retries the same shortId when retryLoad() is called after a network error', () => {
    configure('abc123');
    buildsService.getByShortId.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    const fixture = TestBed.createComponent(MainComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.loadError).toBe('network');

    buildsService.getByShortId.mockReturnValue(of({ name: 'My Build', blob: 'z1.xxx' }));
    codec.decode.mockReturnValue({ Weapon: 'Calamitous Battle Axe' });
    fixture.componentInstance.retryLoad();

    expect(fixture.componentInstance.loadError).toBeNull();
    expect(currentBuild.markLoaded).toHaveBeenCalledWith({
      shortId: 'abc123', name: 'My Build', canonicalParams: { Weapon: 'Calamitous Battle Axe' }
    });
  });

  it('resets CurrentBuildService when the route has no shortId', () => {
    configure(null);

    TestBed.createComponent(MainComponent).detectChanges();

    expect(currentBuild.reset).toHaveBeenCalled();
    expect(buildsService.getByShortId).not.toHaveBeenCalled();
  });

  it('reapplies the cached canonical build (no network fetch) when the URL returns to the bare shortId route after edits', () => {
    // Simulates browser back all the way through a dirty-edit session: once
    // dirty, the build's shortId is dropped from the URL entirely (see
    // QueryParamsService.navigateWithParams), so route.paramMap goes
    // shortId -> null -> shortId again once back navigation reaches the
    // pristine pre-edit history entry. Gear currently applied may still
    // reflect an abandoned edit at that point, so this reapplies the
    // locally cached canonical params (set via markLoaded/markSaved's
    // canonicalParams on the original fetch or a save - see
    // CurrentBuildService.getCanonicalParamsCache) instead of a network
    // re-fetch, which would otherwise flash the loading screen for
    // a build that's already on screen.
    configure('abc123');
    Object.defineProperty(currentBuild, 'value', {
      value: { savedBuildId: 'build-1', shortId: 'abc123', name: 'My Build', isDirty: true, ownership: 'owned' }
    });
    currentBuild.getCanonicalParamsCache.mockReturnValue({ Weapon: 'Calamitous Battle Axe' });

    TestBed.createComponent(MainComponent).detectChanges();
    expect(buildsService.getByShortId).not.toHaveBeenCalled();

    paramMap$.next(convertToParamMap({})); // dirty edit dropped the shortId to root
    paramMap$.next(convertToParamMap({ shortId: 'abc123' })); // browser back to the bare canonical URL

    expect(currentBuild.getCanonicalParamsCache).toHaveBeenCalledWith('abc123');
    expect(queryParams.applyDecodedBuildParams).toHaveBeenCalledWith({ Weapon: 'Calamitous Battle Axe' });
    expect(buildsService.getByShortId).not.toHaveBeenCalled();
  });

  it('does not fetch or apply anything when returning to the bare shortId route with nothing cached', () => {
    configure('abc123');
    Object.defineProperty(currentBuild, 'value', {
      value: { savedBuildId: 'build-1', shortId: 'abc123', name: 'My Build', isDirty: true, ownership: 'owned' }
    });
    currentBuild.getCanonicalParamsCache.mockReturnValue(null);

    TestBed.createComponent(MainComponent).detectChanges();

    paramMap$.next(convertToParamMap({}));
    paramMap$.next(convertToParamMap({ shortId: 'abc123' }));

    expect(buildsService.getByShortId).not.toHaveBeenCalled();
    expect(queryParams.applyDecodedBuildParams).not.toHaveBeenCalled();
  });

  it('restores identity via restoreIdentity() when the URL carries one but the route has no shortId', () => {
    // Simulates browser back/forward through a mid-edit history entry: the
    // shortId is still dropped from the route, but the b= blob carries the
    // build's identity, which buildIdentityFromUrl$ (driven by
    // AppComponent's NavigationEnd -> updateFromParams) emits.
    configure(null);

    TestBed.createComponent(MainComponent).detectChanges();
    currentBuild.reset.mockClear();

    buildIdentity$.next({ shortId: 'abc123', name: 'My Build' });

    expect(currentBuild.restoreIdentity).toHaveBeenCalledWith({ shortId: 'abc123', name: 'My Build' });
    expect(currentBuild.reset).not.toHaveBeenCalled();
  });

  it('does not reset CurrentBuildService when the shortId was only dropped for a self-triggered live-edit URL rewrite', () => {
    // The very moment a loaded build's shortId is dropped from the URL (the
    // self-triggered write itself), buildIdentityFromUrl$ never fires at
    // all (AppComponent skips updateFromParams for that navigation) - route
    // paramMap going to null on its own must not wipe state in that gap.
    configure('abc123');
    buildsService.getByShortId.mockReturnValue(of({ name: 'My Build', blob: 'z1.xxx' }));
    codec.decode.mockReturnValue({ Weapon: 'Calamitous Battle Axe' });

    TestBed.createComponent(MainComponent).detectChanges();
    currentBuild.reset.mockClear();

    paramMap$.next(convertToParamMap({}));

    expect(currentBuild.reset).not.toHaveBeenCalled();
  });

  it('re-fetches when the route reuses the component but the shortId changes', () => {
    configure('abc123');
    buildsService.getByShortId.mockReturnValue(of({ name: 'My Build', blob: 'z1.xxx' }));
    codec.decode.mockReturnValue({ Weapon: 'Calamitous Battle Axe' });

    TestBed.createComponent(MainComponent).detectChanges();
    expect(buildsService.getByShortId).toHaveBeenCalledWith('abc123');

    paramMap$.next(convertToParamMap({ shortId: 'xyz789' }));

    expect(buildsService.getByShortId).toHaveBeenCalledWith('xyz789');
  });

  it('does not re-fetch the same shortId that is already loaded', () => {
    configure('abc123');
    Object.defineProperty(currentBuild, 'value', {
      value: { savedBuildId: 'build-1', shortId: 'abc123', name: 'My Build', isDirty: false, ownership: 'owned' }
    });

    TestBed.createComponent(MainComponent).detectChanges();

    expect(buildsService.getByShortId).not.toHaveBeenCalled();
  });

  it('confirms ownership against listMine() when the viewer is signed in', () => {
    configure('abc123');
    buildsService.getByShortId.mockReturnValue(of({ name: 'My Build', blob: 'z1.xxx' }));
    codec.decode.mockReturnValue({ Weapon: 'Calamitous Battle Axe' });
    buildsService.listMine.mockReturnValue(of([
      { id: 'build-1', shortId: 'abc123', name: 'My Build', blob: 'z1.xxx' },
      { id: 'build-2', shortId: 'other', name: 'Other', blob: 'z1.yyy' }
    ]));

    TestBed.overrideProvider(AuthService, {
      useValue: { isAuthenticated$: of(true), user$: of({ sub: 'user-1' }), isLoading$: of(false), signIn: () => { }, signOut: () => { } }
    });
    TestBed.createComponent(MainComponent).detectChanges();

    expect(currentBuild.confirmOwnership).toHaveBeenCalledWith('abc123', 'build-1');
  });

  it('does not confirm ownership when signed out', () => {
    configure('abc123');
    buildsService.getByShortId.mockReturnValue(of({ name: 'My Build', blob: 'z1.xxx' }));
    codec.decode.mockReturnValue({ Weapon: 'Calamitous Battle Axe' });

    TestBed.createComponent(MainComponent).detectChanges();

    expect(buildsService.listMine).not.toHaveBeenCalled();
    expect(currentBuild.confirmOwnership).not.toHaveBeenCalled();
  });

  it('denies ownership (confirmOwnership with null) when signed in but listMine has no matching build', () => {
    // The negative case matters as much as the positive one: ownership must
    // not be left at 'unknown' forever just because no match turned up -
    // see CurrentBuildService.confirmOwnership's comment.
    configure('abc123');
    buildsService.getByShortId.mockReturnValue(of({ name: 'My Build', blob: 'z1.xxx' }));
    codec.decode.mockReturnValue({ Weapon: 'Calamitous Battle Axe' });
    buildsService.listMine.mockReturnValue(of([
      { id: 'build-2', shortId: 'other', name: 'Other', blob: 'z1.yyy' }
    ]));
    TestBed.overrideProvider(AuthService, {
      useValue: { isAuthenticated$: of(true), user$: of({ sub: 'user-1' }), isLoading$: of(false), signIn: () => { }, signOut: () => { } }
    });

    TestBed.createComponent(MainComponent).detectChanges();

    expect(currentBuild.confirmOwnership).toHaveBeenCalledWith('abc123', null);
  });

  it('degrades to not-owned if the ownership check itself fails, rather than leaving it unresolved forever', () => {
    configure('abc123');
    buildsService.getByShortId.mockReturnValue(of({ name: 'My Build', blob: 'z1.xxx' }));
    codec.decode.mockReturnValue({ Weapon: 'Calamitous Battle Axe' });
    buildsService.listMine.mockReturnValue(throwError(() => new Error('network down')));
    TestBed.overrideProvider(AuthService, {
      useValue: { isAuthenticated$: of(true), user$: of({ sub: 'user-1' }), isLoading$: of(false), signIn: () => { }, signOut: () => { } }
    });

    TestBed.createComponent(MainComponent).detectChanges();

    expect(currentBuild.confirmOwnership).toHaveBeenCalledWith('abc123', null);
  });

  it('confirms ownership after a history restore too, not just the initial fetch', () => {
    // Ownership can't travel through the URL any more (see
    // BuildUrlIdentity's comment) - restoreIdentity alone can't resolve it,
    // so the buildIdentityFromUrl$ subscriber has to re-run the same check
    // loadBuildFromRoute uses on a fresh fetch.
    configure(null);
    buildsService.listMine.mockReturnValue(of([
      { id: 'build-1', shortId: 'abc123', name: 'My Build', blob: 'z1.xxx' }
    ]));
    TestBed.overrideProvider(AuthService, {
      useValue: { isAuthenticated$: of(true), user$: of({ sub: 'user-1' }), isLoading$: of(false), signIn: () => { }, signOut: () => { } }
    });

    TestBed.createComponent(MainComponent).detectChanges();
    buildIdentity$.next({ shortId: 'abc123', name: 'My Build' });

    expect(currentBuild.confirmOwnership).toHaveBeenCalledWith('abc123', 'build-1');
  });

  it('does not re-check listMine for a shortId already confirmed this session', () => {
    configure('abc123');
    buildsService.getByShortId.mockReturnValue(of({ name: 'My Build', blob: 'z1.xxx' }));
    codec.decode.mockReturnValue({ Weapon: 'Calamitous Battle Axe' });
    buildsService.listMine.mockReturnValue(of([
      { id: 'build-1', shortId: 'abc123', name: 'My Build', blob: 'z1.xxx' }
    ]));
    TestBed.overrideProvider(AuthService, {
      useValue: { isAuthenticated$: of(true), user$: of({ sub: 'user-1' }), isLoading$: of(false), signIn: () => { }, signOut: () => { } }
    });

    TestBed.createComponent(MainComponent).detectChanges();
    expect(vi.mocked(buildsService.listMine).mock.calls.length).toBe(1);

    // A later history restore lands back on the same build's identity -
    // already resolved this session, so bouncing through it again via
    // browser back/forward must not spam listMine().
    buildIdentity$.next({ shortId: 'abc123', name: 'My Build' });

    expect(vi.mocked(buildsService.listMine).mock.calls.length).toBe(1);
  });

  it('clears the ownership memo on an auth transition, so a re-check can happen', () => {
    configure('abc123');
    buildsService.getByShortId.mockReturnValue(of({ name: 'My Build', blob: 'z1.xxx' }));
    codec.decode.mockReturnValue({ Weapon: 'Calamitous Battle Axe' });
    buildsService.listMine.mockReturnValue(of([
      { id: 'build-1', shortId: 'abc123', name: 'My Build', blob: 'z1.xxx' }
    ]));
    const isAuthenticated$ = new BehaviorSubject(true);
    TestBed.overrideProvider(AuthService, {
      useValue: { isAuthenticated$, user$: of({ sub: 'user-1' }), isLoading$: of(false), signIn: () => { }, signOut: () => { } }
    });

    TestBed.createComponent(MainComponent).detectChanges();
    expect(vi.mocked(buildsService.listMine).mock.calls.length).toBe(1);

    isAuthenticated$.next(false);
    isAuthenticated$.next(true);
    buildIdentity$.next({ shortId: 'abc123', name: 'My Build' });

    expect(vi.mocked(buildsService.listMine).mock.calls.length).toBe(2);
  });

  it('keeps contentReady false while the shortId fetch is in flight, then flips it true once loaded', () => {
    configure('abc123');
    const response = new Subject<{
      name: string;
      blob: string;
    }>();
    buildsService.getByShortId.mockReturnValue(response.asObservable());
    codec.decode.mockReturnValue({ Weapon: 'Calamitous Battle Axe' });

    const fixture = TestBed.createComponent(MainComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.contentReady).toBe(false);

    response.next({ name: 'My Build', blob: 'z1.xxx' });
    response.complete();

    expect(fixture.componentInstance.contentReady).toBe(true);
  });

  it('stays not-ready on the transient Auth0 redirect callback URL even once isLoading$ has cleared', () => {
    // Regression test for a real timing bug in auth0-angular: it fires
    // router.navigateByUrl(appState.target) and then, without awaiting that
    // navigation, immediately flips isLoading$ to false - so isLoading$ can
    // report false while the router is still sitting on the transient
    // callback URL (which carries code/state query params) and hasn't yet
    // landed on the real target. Trusting isLoading$ alone here previously
    // let this component briefly render as "no build loaded" before the
    // router's own navigation replaced it.
    configure('abc123');
    buildsService.getByShortId.mockReturnValue(of({ name: 'My Build', blob: 'z1.xxx' }));
    codec.decode.mockReturnValue({ Weapon: 'Calamitous Battle Axe' });
    router.parseUrl.mockReturnValue({ queryParamMap: convertToParamMap({ code: 'abc', state: 'xyz' }) } as any);

    const fixture = TestBed.createComponent(MainComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.contentReady).toBe(false);
  });
});
