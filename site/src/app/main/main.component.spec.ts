import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';

import { AppModule } from '../app.module';
import { AuthService } from '../auth.service';
import { BuildUrlCodecService } from '../build-url-codec.service';
import { BuildsService } from '../builds.service';
import { CurrentBuildService } from '../current-build.service';
import { BuildUrlIdentity, QueryParamsService } from '../query-params.service';
import { MainComponent } from './main.component';

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

  beforeEach(waitForAsync(() => {
    localStorage.removeItem(onboardingStateKey);
    localStorage.removeItem(legacyOnboardingKey);
    for (const key of viewStateKeys) {
      localStorage.removeItem(key);
    }
    TestBed.configureTestingModule({
      imports: [ AppModule ]
    })
    .compileComponents();
    // Real AppModule pulls in the real (Auth0) AuthService, whose
    // isLoading$ doesn't resolve synchronously - contentReady would stay
    // false through this describe block's single synchronous
    // detectChanges() otherwise, hiding the whole header (including
    // app-admin-link) these tests check. Stub it the same way the
    // "loading a build by shortId" describe block below does.
    TestBed.overrideProvider(AuthService, {
      useValue: { isAuthenticated$: of(false), user$: of(null), isLoading$: of(false), signIn: () => {}, signOut: () => {} }
    });
  }));

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
    fixture = TestBed.createComponent(MainComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders non-production admin access in the workspace bar', () => {
    const compiled: HTMLElement = fixture.nativeElement;

    expect(compiled.querySelector('.planner-workspace-bar app-admin-link')).not.toBeNull();
  });

  it('starts on the equipment tab', () => {
    expect(component.activeTab).toBe('equipment');
    expect(component.filtersOpen).toBeFalse();
  });

  it('toggles the filter sheet', () => {
    component.toggleFilters();

    expect(component.filtersOpen).toBeTrue();

    component.closeFilters();

    expect(component.filtersOpen).toBeFalse();
  });

  it('switches tabs without forcing a scroll position', () => {
    spyOn(window, 'scrollTo');

    component.selectTab('affixes');

    expect(component.activeTab).toBe('affixes');
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('dismisses filters when selecting a view tab', () => {
    component.toggleFilters();
    component.selectTab('affixes');

    expect(component.filtersOpen).toBeFalse();
    expect(component.activeTab).toBe('affixes');
  });

  it('pairs the tracked affixes tab green cue with intro text and a skip action', () => {
    component.trackedAffixesHint = true;

    expect(component.shouldHighlightTrackedAffixes()).toBeTrue();
  });

  it('hides the tracked affixes onboarding cue when dismissed', () => {
    component.trackedAffixesHint = true;

    component.dismissIntro();

    expect(component.shouldHighlightTrackedAffixes()).toBeFalse();
  });
});

describe('MainComponent - loading a build by shortId', () => {
  const onboardingStateKey = 'ddo-planner-onboarding-state-v1';

  let buildsService: jasmine.SpyObj<BuildsService>;
  let queryParams: jasmine.SpyObj<QueryParamsService>;
  let currentBuild: jasmine.SpyObj<CurrentBuildService>;
  let codec: jasmine.SpyObj<BuildUrlCodecService>;
  let router: jasmine.SpyObj<Router>;
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let buildIdentity$: BehaviorSubject<BuildUrlIdentity | null>;

  function configure(initialShortId: string | null) {
    // Skip the onboarding/setup-drawer branch so it doesn't interfere with
    // asserting on build-loading behavior specifically.
    localStorage.setItem(onboardingStateKey, JSON.stringify({ completed: true, dismissed: true }));

    paramMap$ = new BehaviorSubject(convertToParamMap(initialShortId ? { shortId: initialShortId } : {}));
    buildIdentity$ = new BehaviorSubject<BuildUrlIdentity | null>(null);
    buildsService = jasmine.createSpyObj('BuildsService', ['getByShortId', 'listMine']);
    queryParams = jasmine.createSpyObj('QueryParamsService', ['applyDecodedBuildParams', 'getCombinedParams', 'registerOwnedSlots', 'register', 'subscribe'], {
      initialParamsApplied$: of(undefined),
      buildIdentityFromUrl$: buildIdentity$
    });
    queryParams.getCombinedParams.and.returnValue({});
    currentBuild = jasmine.createSpyObj(
      'CurrentBuildService',
      ['markLoaded', 'confirmOwnership', 'reset', 'restoreIdentity', 'getCanonicalParamsCache'],
      {
        value: { savedBuildId: null, shortId: null, name: null, isDirty: false, isOwnedByCurrentUser: false },
        // BuildActionsComponent (rendered inside MainComponent's template)
        // also injects CurrentBuildService and subscribes to state$.
        state$: of({ savedBuildId: null, shortId: null, name: null, isDirty: false, isOwnedByCurrentUser: false })
      }
    );
    currentBuild.getCanonicalParamsCache.and.returnValue(null);
    codec = jasmine.createSpyObj('BuildUrlCodecService', ['decode', 'encode']);
    router = jasmine.createSpyObj('Router', ['navigateByUrl', 'parseUrl'], { url: '/' });
    // Real Router.parseUrl(url).queryParamMap is what isOnAuthRedirectCallbackUrl()
    // reads to detect Auth0's transient code/state callback URL - none of
    // these tests exercise that URL, so a plain empty map is enough here.
    router.parseUrl.and.returnValue({ queryParamMap: convertToParamMap({}) } as any);

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
          useValue: { isAuthenticated$: of(false), user$: of(null), isLoading$: of(false), signIn: () => {}, signOut: () => {} }
        }
      ]
    });
  }

  afterEach(() => {
    localStorage.removeItem(onboardingStateKey);
  });

  it('fetches, decodes, and applies the build when the route has a shortId', () => {
    configure('abc123');
    buildsService.getByShortId.and.returnValue(of({ name: 'My Build', blob: 'z1.xxx' }));
    codec.decode.and.returnValue({ Weapon: 'Calamitous Battle Axe' });

    TestBed.createComponent(MainComponent).detectChanges();

    expect(buildsService.getByShortId).toHaveBeenCalledWith('abc123');
    expect(queryParams.applyDecodedBuildParams).toHaveBeenCalledWith({ Weapon: 'Calamitous Battle Axe' });
    expect(currentBuild.markLoaded).toHaveBeenCalledWith({
      shortId: 'abc123', name: 'My Build', canonicalParams: { Weapon: 'Calamitous Battle Axe' }
    });
  });

  it('redirects home if the blob fails to decode', () => {
    configure('abc123');
    buildsService.getByShortId.and.returnValue(of({ name: 'My Build', blob: 'garbage' }));
    codec.decode.and.returnValue(null);

    TestBed.createComponent(MainComponent).detectChanges();

    expect(queryParams.applyDecodedBuildParams).not.toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/', { replaceUrl: true });
  });

  it('redirects home if the build cannot be found', () => {
    configure('missing');
    buildsService.getByShortId.and.returnValue(throwError(() => new Error('404')));

    TestBed.createComponent(MainComponent).detectChanges();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/', { replaceUrl: true });
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
      value: { savedBuildId: 'build-1', shortId: 'abc123', name: 'My Build', isDirty: true, isOwnedByCurrentUser: true }
    });
    currentBuild.getCanonicalParamsCache.and.returnValue({ Weapon: 'Calamitous Battle Axe' });

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
      value: { savedBuildId: 'build-1', shortId: 'abc123', name: 'My Build', isDirty: true, isOwnedByCurrentUser: true }
    });
    currentBuild.getCanonicalParamsCache.and.returnValue(null);

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
    currentBuild.reset.calls.reset();

    buildIdentity$.next({ shortId: 'abc123', name: 'My Build', savedBuildId: 'build-1' });

    expect(currentBuild.restoreIdentity).toHaveBeenCalledWith({ shortId: 'abc123', name: 'My Build', savedBuildId: 'build-1' });
    expect(currentBuild.reset).not.toHaveBeenCalled();
  });

  it('does not reset CurrentBuildService when the shortId was only dropped for a self-triggered live-edit URL rewrite', () => {
    // The very moment a loaded build's shortId is dropped from the URL (the
    // self-triggered write itself), buildIdentityFromUrl$ never fires at
    // all (AppComponent skips updateFromParams for that navigation) - route
    // paramMap going to null on its own must not wipe state in that gap.
    configure('abc123');
    buildsService.getByShortId.and.returnValue(of({ name: 'My Build', blob: 'z1.xxx' }));
    codec.decode.and.returnValue({ Weapon: 'Calamitous Battle Axe' });

    TestBed.createComponent(MainComponent).detectChanges();
    currentBuild.reset.calls.reset();

    paramMap$.next(convertToParamMap({}));

    expect(currentBuild.reset).not.toHaveBeenCalled();
  });

  it('re-fetches when the route reuses the component but the shortId changes', () => {
    configure('abc123');
    buildsService.getByShortId.and.returnValue(of({ name: 'My Build', blob: 'z1.xxx' }));
    codec.decode.and.returnValue({ Weapon: 'Calamitous Battle Axe' });

    TestBed.createComponent(MainComponent).detectChanges();
    expect(buildsService.getByShortId).toHaveBeenCalledWith('abc123');

    paramMap$.next(convertToParamMap({ shortId: 'xyz789' }));

    expect(buildsService.getByShortId).toHaveBeenCalledWith('xyz789');
  });

  it('does not re-fetch the same shortId that is already loaded', () => {
    configure('abc123');
    Object.defineProperty(currentBuild, 'value', {
      value: { savedBuildId: 'build-1', shortId: 'abc123', name: 'My Build', isDirty: false, isOwnedByCurrentUser: true }
    });

    TestBed.createComponent(MainComponent).detectChanges();

    expect(buildsService.getByShortId).not.toHaveBeenCalled();
  });

  it('confirms ownership against listMine() when the viewer is signed in', () => {
    configure('abc123');
    buildsService.getByShortId.and.returnValue(of({ name: 'My Build', blob: 'z1.xxx' }));
    codec.decode.and.returnValue({ Weapon: 'Calamitous Battle Axe' });
    buildsService.listMine.and.returnValue(of([
      { id: 'build-1', shortId: 'abc123', name: 'My Build', blob: 'z1.xxx' },
      { id: 'build-2', shortId: 'other', name: 'Other', blob: 'z1.yyy' }
    ]));

    TestBed.overrideProvider(AuthService, {
      useValue: { isAuthenticated$: of(true), user$: of({ sub: 'user-1' }), isLoading$: of(false), signIn: () => {}, signOut: () => {} }
    });
    TestBed.createComponent(MainComponent).detectChanges();

    expect(currentBuild.confirmOwnership).toHaveBeenCalledWith('abc123', 'build-1');
  });

  it('does not confirm ownership when signed out', () => {
    configure('abc123');
    buildsService.getByShortId.and.returnValue(of({ name: 'My Build', blob: 'z1.xxx' }));
    codec.decode.and.returnValue({ Weapon: 'Calamitous Battle Axe' });

    TestBed.createComponent(MainComponent).detectChanges();

    expect(buildsService.listMine).not.toHaveBeenCalled();
    expect(currentBuild.confirmOwnership).not.toHaveBeenCalled();
  });

  it('keeps contentReady false while the shortId fetch is in flight, then flips it true once loaded', () => {
    configure('abc123');
    const response = new Subject<{ name: string; blob: string }>();
    buildsService.getByShortId.and.returnValue(response.asObservable());
    codec.decode.and.returnValue({ Weapon: 'Calamitous Battle Axe' });

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
    buildsService.getByShortId.and.returnValue(of({ name: 'My Build', blob: 'z1.xxx' }));
    codec.decode.and.returnValue({ Weapon: 'Calamitous Battle Axe' });
    router.parseUrl.and.returnValue({ queryParamMap: convertToParamMap({ code: 'abc', state: 'xyz' }) } as any);

    const fixture = TestBed.createComponent(MainComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.contentReady).toBe(false);
  });
});
