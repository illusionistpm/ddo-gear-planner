import { Component } from '@angular/core';
import { TestBed, waitForAsync } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { AppComponent } from './app.component';
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

  beforeEach(waitForAsync(() => {
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
});
