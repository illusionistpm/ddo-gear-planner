import type { Mock } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { Location } from '@angular/common';
import { SpyLocation } from '@angular/common/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AppComponent } from './app.component';
import { AuthService } from './shared/auth.service';
import { CurrentBuildService } from './build/current-build.service';
import { QueryParamsService } from './build/query-params.service';
import { BuildUrlCodecService } from './build/build-url-codec.service';
import { EquippedService } from './planner/equipped.service';
import { PlannerOnboardingService } from './planner/planner-onboarding.service';

@Component({ selector: 'app-stub', template: '', standalone: false })
class StubComponent {
}

describe('AppComponent', () => {
  const onboardingStateKey = 'ddo-planner-onboarding-state-v1';
  const legacyOnboardingKey = 'ddo-planner-onboarding-affix-type-opened';

  beforeEach(() => {
    localStorage.removeItem(onboardingStateKey);
    localStorage.removeItem(legacyOnboardingKey);
    window.location.hash = '';
  });

  afterEach(() => {
    localStorage.removeItem(onboardingStateKey);
    localStorage.removeItem(legacyOnboardingKey);
    window.location.hash = '';
  });

  let authServiceStub: {
    isRedirectingAwayForAuth: boolean;
  };

  beforeEach(async () => {
    authServiceStub = { isRedirectingAwayForAuth: false };

    await TestBed.configureTestingModule({
      declarations: [
        AppComponent,
        StubComponent
      ],
      imports: [
        RouterTestingModule.withRoutes([
          { path: '**', component: StubComponent }
        ])
      ],
      providers: [
        { provide: AuthService, useValue: authServiceStub }
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.debugElement.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have the app title`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.debugElement.componentInstance;
    expect(app.title).toEqual('DDO Gear Planner');
  });

  it('should render the router outlet', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.debugElement.nativeElement;
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });

  it('does not render the admin link at the root shell', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled: HTMLElement = fixture.nativeElement;

    expect(compiled.querySelector('app-admin-link')).toBeNull();
  });

  it('updates query params on a navigation to a new route', async () => {
    const queryParams = TestBed.inject(QueryParamsService);
    vi.spyOn(queryParams, 'updateFromParams').mockReturnValue(undefined);
    const router = TestBed.inject(Router);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    await router.navigateByUrl('/main?levelrange=1,18&Weapon=Calamitous%20Battle%20Axe&tracked=Strength&tracked=False%20Life%20(%25)');

    const params = vi.mocked((queryParams.updateFromParams as Mock)).mock.lastCall![0];
    expect(params.get('levelrange')).toBe('1,18');
    expect(params.get('Weapon')).toBe('Calamitous Battle Axe');
    expect(params.getAll('tracked')).toEqual(['Strength', 'False Life (%)']);
  });

  it('does not reapply URL params for an app-originated navigation', async () => {
    const queryParams = TestBed.inject(QueryParamsService);
    vi.spyOn(queryParams, 'updateFromParams').mockReturnValue(undefined);
    vi.spyOn(queryParams, 'consumeAppUrlWrite').mockReturnValue(true);
    const router = TestBed.inject(Router);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    (queryParams.updateFromParams as Mock).mockClear();

    await router.navigateByUrl('/main?levelrange=1,18');

    expect(queryParams.updateFromParams).not.toHaveBeenCalled();
  });

  it('does not reset onboarding state when loading a route without query params', async () => {
    localStorage.setItem(onboardingStateKey, JSON.stringify({
      completed: false,
      dismissed: true
    }));

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(JSON.parse(localStorage.getItem(onboardingStateKey) || '{}')).toEqual({
      completed: false,
      dismissed: true
    });
  });

  it('bypasses onboarding after following a long build link with gear in it', async () => {
    const blob = TestBed.inject(BuildUrlCodecService).encode({ Armor: '+1 Starter Breastplate' });
    const onboarding = TestBed.inject(PlannerOnboardingService);
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect(onboarding.shouldShowOnboarding()).toBe(true);

    await TestBed.inject(Router).navigateByUrl(`/?b=${blob}`);

    expect(TestBed.inject(EquippedService).isBuildEmpty()).toBe(false);
    expect(onboarding.shouldShowOnboarding()).toBe(false);
  });

  it('does not bypass onboarding for a long build link with no gear in it', async () => {
    const blob = TestBed.inject(BuildUrlCodecService).encode({ tracked: ['Strength'] });
    const onboarding = TestBed.inject(PlannerOnboardingService);
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    await TestBed.inject(Router).navigateByUrl(`/?b=${blob}`);

    expect(onboarding.shouldShowOnboarding()).toBe(true);
  });

  it('does not bypass onboarding when browser back/forward lands on a URL with gear', async () => {
    // Back/forward replays the user's own edit history, not a followed link -
    // it mustn't switch the intro off part-way through it.
    const blob = TestBed.inject(BuildUrlCodecService).encode({ Armor: '+1 Starter Breastplate' });
    const onboarding = TestBed.inject(PlannerOnboardingService);
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await router.navigateByUrl('/');

    router.setUpLocationChangeListener();
    // The router handles a popstate on a timer, so wait for the navigation itself.
    const landed = firstValueFrom(router.events.pipe(filter(event => event instanceof NavigationEnd)));
    (TestBed.inject(Location) as SpyLocation).simulateUrlPop(`/?b=${blob}`);
    await landed;

    expect(TestBed.inject(EquippedService).isBuildEmpty()).toBe(false);
    expect(onboarding.shouldShowOnboarding()).toBe(true);
  });

  it('does not call updateFromParams when navigating to a /build/:shortId route', async () => {
    const queryParams = TestBed.inject(QueryParamsService);
    vi.spyOn(queryParams, 'updateFromParams').mockReturnValue(undefined);
    const router = TestBed.inject(Router);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    (queryParams.updateFromParams as Mock).mockClear();

    await router.navigateByUrl('/build/abc123/my-build');

    expect(queryParams.updateFromParams).not.toHaveBeenCalled();
  });

  it('does not call updateFromParams for a /build/:shortId route with no slug', async () => {
    const queryParams = TestBed.inject(QueryParamsService);
    vi.spyOn(queryParams, 'updateFromParams').mockReturnValue(undefined);
    const router = TestBed.inject(Router);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    (queryParams.updateFromParams as Mock).mockClear();

    await router.navigateByUrl('/build/abc123');

    expect(queryParams.updateFromParams).not.toHaveBeenCalled();
  });

  it('leaves the planner as it was for a friend\'s still-needed page, which reads its build itself', async () => {
    const queryParams = TestBed.inject(QueryParamsService);
    vi.spyOn(queryParams, 'updateFromParams').mockReturnValue(undefined);
    const router = TestBed.inject(Router);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    (queryParams.updateFromParams as Mock).mockClear();

    await router.navigateByUrl('/still-needed/abc123/my-build');
    await router.navigateByUrl('/still-needed/abc123');

    expect(queryParams.updateFromParams).not.toHaveBeenCalled();
  });

  it('treats a /build/:shortId route with a fragment as the bare route, and one with b= and a fragment as carrying b=', async () => {
    const queryParams = TestBed.inject(QueryParamsService);
    vi.spyOn(queryParams, 'updateFromParams').mockReturnValue(undefined);
    const router = TestBed.inject(Router);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    (queryParams.updateFromParams as Mock).mockClear();

    await router.navigateByUrl('/build/abc123/my-build#shopping-list');
    await router.navigateByUrl('/build/abc123#shopping-list');
    expect(queryParams.updateFromParams).not.toHaveBeenCalled();

    await router.navigateByUrl('/build/abc123/my-build?b=z1.test#shopping-list');
    const params = vi.mocked((queryParams.updateFromParams as Mock)).mock.lastCall![0];
    expect(params.get('b')).toBe('z1.test');
  });

  it('does not reapply URL params when only the fragment changes, as Back from the shopping list does', async () => {
    const queryParams = TestBed.inject(QueryParamsService);
    vi.spyOn(queryParams, 'updateFromParams').mockReturnValue(undefined);
    const router = TestBed.inject(Router);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    await router.navigateByUrl('/?b=z1.test');
    expect(queryParams.updateFromParams).toHaveBeenCalled();
    (queryParams.updateFromParams as Mock).mockClear();

    await router.navigateByUrl('/?b=z1.test#shopping-list');
    await router.navigateByUrl('/?b=z1.test');
    expect(queryParams.updateFromParams).not.toHaveBeenCalled();

    await router.navigateByUrl('/?b=z1.other#shopping-list');
    expect(vi.mocked(queryParams.updateFromParams as Mock).mock.lastCall![0].get('b')).toBe('z1.other');
  });

  it('does call updateFromParams on a /build/:shortId route once it carries a b= param', async () => {
    // Regression test: editing a loaded build accumulates a b= param on
    // this same route shape as you go (see BuildActionsComponent's comment
    // on saveInPlace), specifically so browser back/forward through those
    // edits has something to restore. Skipping this unconditionally (as
    // this route used to, regardless of query string) left every
    // back/forward through an edit session silently do nothing - the
    // address bar changed but nothing downstream of it re-applied.
    const queryParams = TestBed.inject(QueryParamsService);
    vi.spyOn(queryParams, 'updateFromParams').mockReturnValue(undefined);
    const router = TestBed.inject(Router);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    (queryParams.updateFromParams as Mock).mockClear();

    await router.navigateByUrl('/build/abc123/my-build?b=z1.test');

    const params = vi.mocked((queryParams.updateFromParams as Mock)).mock.lastCall![0];
    expect(params.get('b')).toBe('z1.test');
  });

  it('sets the browser tab title to just the app name when no build is loaded', () => {
    const titleService = TestBed.inject(Title);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    expect(titleService.getTitle()).toBe('DDO Gear Planner');
  });

  it('prefixes the tab title with the loaded build\'s name', () => {
    const titleService = TestBed.inject(Title);
    const currentBuild = TestBed.inject(CurrentBuildService);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    currentBuild.markLoaded({ shortId: 'abc123', name: 'My Fire Wizard', canonicalParams: {} });

    expect(titleService.getTitle()).toBe('My Fire Wizard - DDO Gear Planner');
  });

  it('reverts the tab title once the build is reset', () => {
    const titleService = TestBed.inject(Title);
    const currentBuild = TestBed.inject(CurrentBuildService);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    currentBuild.markLoaded({ shortId: 'abc123', name: 'My Fire Wizard', canonicalParams: {} });

    currentBuild.reset();

    expect(titleService.getTitle()).toBe('DDO Gear Planner');
  });

  it('warns on window unload when the build is dirty', () => {
    const currentBuild = TestBed.inject(CurrentBuildService);
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    currentBuild.markLoaded({ shortId: 'abc123', name: 'My Build', canonicalParams: {} });

    Object.defineProperty(currentBuild, 'value', {
      get: () => ({ savedBuildId: null, shortId: 'abc123', name: 'My Build', isDirty: true, ownership: 'other' })
    });
    vi.spyOn(TestBed.inject(EquippedService), 'isBuildEmpty').mockReturnValue(false);
    const event = { preventDefault: vi.fn().mockName('preventDefault'), returnValue: undefined as any };
    fixture.componentInstance.warnOnUnload = true;

    fixture.componentInstance.warnOnUnsavedChanges(event as any);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.returnValue).toBeTruthy();
  });

  it('does not warn on window unload for a dirty build with no gear equipped', () => {
    // A fresh visit is dirty before the user does anything (a fresh build
    // starts on the Basic affix package) - with no gear there's nothing to save.
    const currentBuild = TestBed.inject(CurrentBuildService);
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    Object.defineProperty(currentBuild, 'value', {
      get: () => ({ savedBuildId: null, shortId: null, name: null, isDirty: true, ownership: 'other' })
    });
    expect(TestBed.inject(EquippedService).isBuildEmpty()).toBe(true);
    fixture.componentInstance.warnOnUnload = true;

    const event = { preventDefault: vi.fn().mockName('preventDefault'), returnValue: undefined as any };
    fixture.componentInstance.warnOnUnsavedChanges(event as any);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.returnValue).toBeUndefined();
  });

  it('does not warn on window unload for a dirty build in a dev build', () => {
    const currentBuild = TestBed.inject(CurrentBuildService);
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    Object.defineProperty(currentBuild, 'value', {
      get: () => ({ savedBuildId: null, shortId: 'abc123', name: 'My Build', isDirty: true, ownership: 'other' })
    });
    vi.spyOn(TestBed.inject(EquippedService), 'isBuildEmpty').mockReturnValue(false);
    fixture.componentInstance.warnOnUnload = false;

    const event = { preventDefault: vi.fn().mockName('preventDefault'), returnValue: undefined as any };
    fixture.componentInstance.warnOnUnsavedChanges(event as any);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.returnValue).toBeUndefined();
  });

  it('does not warn on window unload for a dirty build mid sign-in/sign-out redirect', () => {
    const currentBuild = TestBed.inject(CurrentBuildService);
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    currentBuild.markLoaded({ shortId: 'abc123', name: 'My Build', canonicalParams: {} });
    Object.defineProperty(currentBuild, 'value', {
      get: () => ({ savedBuildId: null, shortId: 'abc123', name: 'My Build', isDirty: true, ownership: 'other' })
    });
    vi.spyOn(TestBed.inject(EquippedService), 'isBuildEmpty').mockReturnValue(false);
    authServiceStub.isRedirectingAwayForAuth = true;
    fixture.componentInstance.warnOnUnload = true;

    const event = { preventDefault: vi.fn().mockName('preventDefault'), returnValue: undefined as any };
    fixture.componentInstance.warnOnUnsavedChanges(event as any);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.returnValue).toBeUndefined();
  });

  it('does not warn on window unload when the build is clean', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const event = { preventDefault: vi.fn().mockName('preventDefault'), returnValue: undefined as any };
    fixture.componentInstance.warnOnUnsavedChanges(event as any);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.returnValue).toBeUndefined();
  });
});
