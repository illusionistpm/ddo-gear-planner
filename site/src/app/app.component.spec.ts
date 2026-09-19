import { Component } from '@angular/core';
import { TestBed, waitForAsync } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { AppComponent } from './app.component';
import { AuthService } from './auth.service';
import { CurrentBuildService } from './current-build.service';
import { QueryParamsService } from './query-params.service';

@Component({ selector: 'app-stub', template: '', standalone: false })
class StubComponent { }

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

  let authServiceStub: { isRedirectingAwayForAuth: boolean };

  beforeEach(waitForAsync(() => {
    authServiceStub = { isRedirectingAwayForAuth: false };

    TestBed.configureTestingModule({
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
  }));

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
    spyOn(queryParams, 'updateFromParams');
    const router = TestBed.inject(Router);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    await router.navigateByUrl('/main?levelrange=1,18&Weapon=Calamitous%20Battle%20Axe&tracked=Strength&tracked=False%20Life%20(%25)');

    const params = (queryParams.updateFromParams as jasmine.Spy).calls.mostRecent().args[0];
    expect(params.get('levelrange')).toBe('1,18');
    expect(params.get('Weapon')).toBe('Calamitous Battle Axe');
    expect(params.getAll('tracked')).toEqual(['Strength', 'False Life (%)']);
  });

  it('does not reapply URL params for an app-originated navigation', async () => {
    const queryParams = TestBed.inject(QueryParamsService);
    spyOn(queryParams, 'updateFromParams');
    spyOn(queryParams, 'consumeAppUrlWrite').and.returnValue(true);
    const router = TestBed.inject(Router);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    (queryParams.updateFromParams as jasmine.Spy).calls.reset();

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

  it('does not call updateFromParams when navigating to a /build/:shortId route', async () => {
    const queryParams = TestBed.inject(QueryParamsService);
    spyOn(queryParams, 'updateFromParams');
    const router = TestBed.inject(Router);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    (queryParams.updateFromParams as jasmine.Spy).calls.reset();

    await router.navigateByUrl('/build/abc123/my-build');

    expect(queryParams.updateFromParams).not.toHaveBeenCalled();
  });

  it('does not call updateFromParams for a /build/:shortId route with no slug', async () => {
    const queryParams = TestBed.inject(QueryParamsService);
    spyOn(queryParams, 'updateFromParams');
    const router = TestBed.inject(Router);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    (queryParams.updateFromParams as jasmine.Spy).calls.reset();

    await router.navigateByUrl('/build/abc123');

    expect(queryParams.updateFromParams).not.toHaveBeenCalled();
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
    spyOn(queryParams, 'updateFromParams');
    const router = TestBed.inject(Router);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    (queryParams.updateFromParams as jasmine.Spy).calls.reset();

    await router.navigateByUrl('/build/abc123/my-build?b=z1.test');

    const params = (queryParams.updateFromParams as jasmine.Spy).calls.mostRecent().args[0];
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
    const event = { preventDefault: jasmine.createSpy('preventDefault'), returnValue: undefined as any };
    fixture.componentInstance.warnOnUnload = true;

    fixture.componentInstance.warnOnUnsavedChanges(event as any);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.returnValue).toBeTruthy();
  });

  it('does not warn on window unload for a dirty build in a dev build', () => {
    const currentBuild = TestBed.inject(CurrentBuildService);
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    Object.defineProperty(currentBuild, 'value', {
      get: () => ({ savedBuildId: null, shortId: 'abc123', name: 'My Build', isDirty: true, ownership: 'other' })
    });
    fixture.componentInstance.warnOnUnload = false;

    const event = { preventDefault: jasmine.createSpy('preventDefault'), returnValue: undefined as any };
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
    authServiceStub.isRedirectingAwayForAuth = true;
    fixture.componentInstance.warnOnUnload = true;

    const event = { preventDefault: jasmine.createSpy('preventDefault'), returnValue: undefined as any };
    fixture.componentInstance.warnOnUnsavedChanges(event as any);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.returnValue).toBeUndefined();
  });

  it('does not warn on window unload when the build is clean', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const event = { preventDefault: jasmine.createSpy('preventDefault'), returnValue: undefined as any };
    fixture.componentInstance.warnOnUnsavedChanges(event as any);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.returnValue).toBeUndefined();
  });
});
