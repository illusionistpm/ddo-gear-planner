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
import { FiltersService } from '../planner/filters.service';
import { AffixEditorService } from '../planner/affix-editor.service';
import { PlannerOnboardingService } from '../planner/planner-onboarding.service';

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

  const activeTab = () => {
    let tab: string | undefined;
    TestBed.inject(EquippedService).getActiveMainTab().subscribe(value => tab = value).unsubscribe();
    return tab;
  };

  const packageChip = (name: string) => Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('#affixesPanel .affix-editor .affix-package-chip'))
    .find(button => button.textContent?.trim().startsWith(name))!;

  it('opens an empty URL on the Basic package, on the Affixes view with the editor open, with nothing to save', () => {
    const equipped = TestBed.inject(EquippedService);
    const el: HTMLElement = fixture.nativeElement;

    expect(equipped.getImportantAffixes().has('Dodge')).toBe(true);
    expect(equipped.getImportantAffixes().has('Melee Power')).toBe(false);
    expect(TestBed.inject(CurrentBuildService).value.isDirty).toBe(false);
    expect(activeTab()).toBe('affixes');
    expect(TestBed.inject(AffixEditorService).isOpen).toBe(true);
    // Inline at the top of the panel, asking what the build is for - no overlay.
    expect(el.querySelector('#affixesPanel .tracked-affixes-content > app-affix-picker .affix-editor')).not.toBeNull();
    expect(el.querySelector('#affixesPanel .affix-editor')?.textContent).toContain('What is this build for?');
    expect(packageChip('Melee').classList).toContain('affix-next-chip');
    // The editor is already open, so the toolbar button reads as pressed, not as a call to action.
    expect(el.querySelector('.tracked-affix-edit-affixes.open')).not.toBeNull();
    expect(el.querySelector('.tracked-affix-edit-affixes.needs-attention')).toBeNull();
  });

  it('still counts the user\'s own first edit as an unsaved change', () => {
    TestBed.inject(EquippedService).setImportantAffixes(['Strength']);

    expect(TestBed.inject(CurrentBuildService).value.isDirty).toBe(true);
  });

  it('starts a new build (empty URL re-applied) on Basic, with the editor open again', () => {
    const equipped = TestBed.inject(EquippedService);
    const editor = TestBed.inject(AffixEditorService);

    // What's left over from the build being replaced.
    editor.close();
    equipped.setActiveMainTab('equipment');
    equipped.setImportantAffixes(['Strength']);

    TestBed.inject(QueryParamsService).updateFromParams(convertToParamMap({}));

    expect(equipped.getImportantAffixes().has('Strength')).toBe(false);
    expect(equipped.getImportantAffixes().has('Dodge')).toBe(true);
    expect(editor.isOpen).toBe(true);
    expect(activeTab()).toBe('affixes');
  });

  it('leaves the editor shut when params re-apply to a build that keeps its affixes', () => {
    // A real navigation or browser back re-applying a build that still has
    // only Basic: they may be looking at the gear, so nothing jumps open.
    const editor = TestBed.inject(AffixEditorService);
    editor.close();
    TestBed.inject(EquippedService).setImportantAffixes(['Dodge']);

    (component as any).applyFreshBuildDefaults(false);

    expect(editor.isOpen).toBe(false);
  });

  it('adds a focus from the editor on top of Basic; the tracked list below updates and the prompt goes', () => {
    const el: HTMLElement = fixture.nativeElement;
    const equipped = TestBed.inject(EquippedService);

    packageChip('Melee').click();
    fixture.detectChanges();

    expect(equipped.getImportantAffixes().has('Dodge')).toBe(true);
    expect(equipped.getImportantAffixes().has('Melee Power')).toBe(true);
    expect(el.querySelector('#affixesPanel')?.textContent).toContain('Melee Power');
    expect(el.querySelector('.tracked-affix-edit-affixes.needs-attention')).toBeNull();
  });

  it('shows the spell power step inline after Caster', () => {
    packageChip('Caster').click();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('#affixesPanel .affix-editor')?.textContent)
      .toContain('Pick your spell power');
  });

  it('closes the editor from Done, and the toolbar button brings it back on the Affixes view', () => {
    const el: HTMLElement = fixture.nativeElement;
    const editor = TestBed.inject(AffixEditorService);

    (el.querySelector('.affix-editor-foot .affix-editor-done') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(editor.isOpen).toBe(false);
    expect(el.querySelector('.affix-editor')).toBeNull();

    TestBed.inject(EquippedService).setActiveMainTab('equipment');
    (el.querySelector('.tracked-affix-edit-affixes') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(editor.isOpen).toBe(true);
    expect(activeTab()).toBe('affixes');
    expect(el.querySelector('#affixesPanel .affix-editor')).not.toBeNull();
  });

  it('ends the intro on a wrap-up: sign in (while signed out), the shopping list, and Got it for good', async () => {
    const el: HTMLElement = fixture.nativeElement;
    const onboarding = TestBed.inject(PlannerOnboardingService);
    expect(el.querySelector('.planner-wrap-up')).toBeNull();

    onboarding.completeIntro();
    // The onboarding state publishes on a timer (see updateOnboardingSubject).
    await new Promise(resolve => setTimeout(resolve));
    fixture.detectChanges();

    const wrapUp = el.querySelector('.planner-wrap-up');
    expect(wrapUp).not.toBeNull();
    expect(wrapUp?.textContent).toContain('Sign in to save this build');
    expect(wrapUp?.textContent).toContain('Shopping list');

    // Signed in, there's nothing to suggest about saving.
    component.signedIn = true;
    fixture.detectChanges();
    expect(wrapUp?.textContent).not.toContain('Sign in to save this build');

    (wrapUp?.querySelector('.onboarding-action-button') as HTMLButtonElement).click();
    await new Promise(resolve => setTimeout(resolve));
    fixture.detectChanges();

    expect(el.querySelector('.planner-wrap-up')).toBeNull();
    expect(onboarding.shouldShowWrapUp()).toBe(false);
  });

  it('renders non-production admin access in the workspace bar', () => {
    const compiled: HTMLElement = fixture.nativeElement;

    expect(compiled.querySelector('.planner-chrome app-admin-link')).not.toBeNull();
  });

  it('switches views from the workspace toolbar', () => {
    const compiled: HTMLElement = fixture.nativeElement;
    const affixesTab: HTMLButtonElement = compiled.querySelector('.planner-chrome #affixesTab')!;
    expect(affixesTab).not.toBeNull();

    affixesTab.click();
    fixture.detectChanges();

    expect(component.activeTab).toBe('affixes');
    expect(compiled.querySelector('#affixesPanel')!.hasAttribute('hidden')).toBe(false);
    expect(compiled.querySelector('#equipmentPanel')!.hasAttribute('hidden')).toBe(true);
  });

  it('closes the filter sheet when the toolbar switches view', () => {
    // The toolbar sets the tab on EquippedService rather than calling
    // selectTab(), so this housekeeping has to come off the tab subscription.
    // Filters sits right beside the switch now, so leaving its sheet open over
    // the view you just moved to would be obvious.
    component.toggleFilters();
    fixture.detectChanges();

    // A fresh build opens on Affixes; switching to the gear is the move here.
    (fixture.nativeElement.querySelector('#equipmentTab') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(component.filtersOpen).toBe(false);
  });

  it('starts a fresh build on the affixes tab, where the editor asks what it is for', () => {
    expect(component.activeTab).toBe('affixes');
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

  describe('narrow-screen chrome', () => {
    // The bar used to become flex-direction: column below 768px, one control
    // per row: 306px of chrome on a 375px-wide screen. These pin the pieces
    // that let it stay a single row. The widths themselves are CSS, so what is
    // testable here is that each piece exists and is wired up.

    it('hands the utility controls to the build actions overflow menu', () => {
      // Ko-fi, theme and Admin are projected into app-build-actions rather
      // than living in a second menu of their own beside it. That menu is
      // display: contents on desktop, so they still lay out inline there.
      const actions: HTMLElement = fixture.nativeElement.querySelector('app-build-actions');

      expect(actions.querySelector('app-support-link')).not.toBeNull();
      expect(actions.querySelector('.theme-toggle')).not.toBeNull();
      expect(actions.querySelector('app-admin-link')).not.toBeNull();
    });

    it('has exactly one overflow button', () => {
      // There were briefly two next to each other - an account menu and a
      // separate utility menu - which is how My Builds ended up somewhere
      // nobody looked.
      expect(fixture.nativeElement.querySelectorAll('.build-overflow-toggle').length).toBe(1);
      expect(fixture.nativeElement.querySelector('.planner-overflow-toggle')).toBeNull();
    });

    it('has a wordmark that can be dropped for the icon alone', () => {
      expect(fixture.nativeElement.querySelector('.planner-brand-name')?.textContent)
        .toContain('DDO Gear Planner');
    });

    it('counts nothing when no filter is set', () => {
      expect(component.activeFilterCount()).toBe(0);
      expect(fixture.nativeElement.querySelector('.planner-filter-count')).toBeNull();
    });

    it('counts each active filter for the badge that replaces the chip strip', () => {
      const filters = TestBed.inject(FiltersService);
      filters.setLevelRange(1, 20);
      filters.setShowRaidItems(false);
      fixture.detectChanges();

      expect(component.activeFilterCount()).toBe(2);
      expect(fixture.nativeElement.querySelector('.planner-filter-count').textContent.trim()).toBe('2');
    });

    it('still reports whether anything is filtered at all', () => {
      expect(component.hasAnyActiveFilter()).toBe(false);

      TestBed.inject(FiltersService).setShowRaidItems(false);

      expect(component.hasAnyActiveFilter()).toBe(true);
    });
  });

  it('pairs the tracked affixes tab tutorial cue with intro text and a skip action', () => {
    component.trackedAffixesHint = true;

    expect(component.shouldHighlightTrackedAffixes()).toBe(true);
  });

  it('switches to the tracked affixes view from the onboarding cue', () => {
    // The cue used to say "Open Tracked Affixes", meaning a button inside the
    // opposite view's compact rail - which no longer renders below 992px. It
    // performs the step itself now.
    component.trackedAffixesHint = true;
    fixture.detectChanges();

    const action: HTMLButtonElement = fixture.nativeElement
      .querySelector('.planner-onboarding-hint .onboarding-action-button');
    expect(action).not.toBeNull();
    action.click();
    fixture.detectChanges();

    expect(component.activeTab).toBe('affixes');
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
      acceptCurrentAsBaseline: vi.fn().mockName('CurrentBuildService.acceptCurrentAsBaseline'),
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
      url: '/',
      // ShoppingListViewService follows the URL's fragment through these.
      events: new Subject()
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

  it('opens a followed short link on the equipment tab, whatever tab was last open', () => {
    configure('abc123');
    buildsService.getByShortId.mockReturnValue(of({ name: 'My Build', blob: 'z1.xxx' }));
    codec.decode.mockReturnValue({ Weapon: 'Calamitous Battle Axe' });
    const equipped = TestBed.inject(EquippedService);
    equipped.setActiveMainTab('affixes');

    const fixture = TestBed.createComponent(MainComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.activeTab).toBe('equipment');
  });

  it('shows a followed short link with gear, and keeps the intro out of the way', () => {
    configure('abc123');
    // configure() marks the intro done; this spec is about it not being.
    localStorage.removeItem(onboardingStateKey);
    buildsService.getByShortId.mockReturnValue(of({ name: 'My Build', blob: 'z1.xxx' }));
    codec.decode.mockReturnValue({ Weapon: 'Calamitous Battle Axe' });
    // queryParams is a mock here, so the decoded gear never reaches
    // EquippedService - stand in for it having landed.
    vi.spyOn(TestBed.inject(EquippedService), 'isBuildEmpty').mockReturnValue(false);

    TestBed.createComponent(MainComponent).detectChanges();

    expect(TestBed.inject(AffixEditorService).isOpen).toBe(false);
    // Someone else's build, shown as it is: no Basic added to it.
    expect(TestBed.inject(EquippedService).getImportantAffixes().size).toBe(0);
    expect(TestBed.inject(PlannerOnboardingService).shouldShowOnboarding()).toBe(false);
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

  it('does not re-check listMine after a failed check republishes the build identity', () => {
    // The real confirmOwnership() republishes the identity on
    // buildIdentityFromUrl$, which re-enters confirmOwnershipIfSignedIn. A
    // failure that wasn't memoized retried from there, forever - with a
    // dead Auth0 refresh token, each lap was a failed /oauth/token exchange,
    // and enough clients doing that exhausted the tenant's rate limit.
    configure('abc123');
    buildsService.getByShortId.mockReturnValue(of({ name: 'My Build', blob: 'z1.xxx' }));
    codec.decode.mockReturnValue({ Weapon: 'Calamitous Battle Axe' });
    buildsService.listMine.mockReturnValue(throwError(() => new Error('invalid refresh token')));
    let republished = 0;
    currentBuild.confirmOwnership.mockImplementation((shortId: string) => {
      // Bounded so a regression fails the assertion below rather than
      // recursing until the stack overflows.
      if (republished++ < 5) {
        buildIdentity$.next({ shortId, name: 'My Build' });
      }
    });
    TestBed.overrideProvider(AuthService, {
      useValue: { isAuthenticated$: of(true), user$: of({ sub: 'user-1' }), isLoading$: of(false), signIn: () => { }, signOut: () => { } }
    });

    TestBed.createComponent(MainComponent).detectChanges();

    expect(vi.mocked(buildsService.listMine).mock.calls.length).toBe(1);
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
