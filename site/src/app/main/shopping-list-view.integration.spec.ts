import { ApplicationRef } from '@angular/core';
import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { convertToParamMap, NavigationEnd, Router } from '@angular/router';
import { filter, firstValueFrom, of } from 'rxjs';

import { AppModule } from '../app.module';
import { AuthService } from '../shared/auth.service';
import { QueryParamsService } from '../build/query-params.service';
import { MainComponent } from './main.component';
import { EquippedService } from '../planner/equipped.service';
import { AffixBuilderDrawerService } from '../affix-builder-drawer/affix-builder-drawer.service';
import { ShoppingListViewService } from '../planner/shopping-list/shopping-list-view.service';
import { AnalyticsService } from '../shared/analytics.service';

// Kept out of main.component.spec.ts, which is already heavy enough to be near the heap limit.
describe('MainComponent with the shopping list', () => {
  let fixture: ComponentFixture<MainComponent>;
  const storageKeys = ['ddo-gear-planner-active-tab', 'ddo-planner-onboarding-state-v1'];

  beforeEach(async () => {
    for (const key of storageKeys) {
      localStorage.removeItem(key);
    }
    await TestBed.configureTestingModule({ imports: [AppModule], providers: [provideLocationMocks()] }).compileComponents();
    TestBed.overrideProvider(AuthService, {
      useValue: { isAuthenticated$: of(false), user$: of(null), isLoading$: of(false), signIn: () => { }, signOut: () => { } }
    });
    TestBed.inject(QueryParamsService).updateFromParams(convertToParamMap({}));
    vi.spyOn(TestBed.inject(EquippedService) as any, '_scheduleAvailabilityWarmup').mockReturnValue(undefined);
    fixture = TestBed.createComponent(MainComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    for (const key of storageKeys) {
      localStorage.removeItem(key);
    }
  });

  const el = () => fixture.nativeElement as HTMLElement;
  const panels = () => el().querySelector('.planner-tab-panels') as HTMLElement;
  const list = () => el().querySelector('app-shopping-list');
  const plannerChrome = () => el().querySelector('.planner-chrome') as HTMLElement;
  const pageChrome = () => el().querySelector('app-page-chrome');
  const shoppingListButton = () => el().querySelector('.shopping-list-open') as HTMLButtonElement;

  it('opens the list in the planner\'s place from the toolbar, under the site\'s header, closing what floats over the planner', () => {
    const drawer = TestBed.inject(AffixBuilderDrawerService);
    expect(drawer.mode).toBe('setup');

    shoppingListButton().click();
    fixture.detectChanges();

    expect(list()).toBeTruthy();
    expect(panels().hidden).toBe(true);
    // The planner's bar gives way to the site's header: Ko-fi, day/night and info, and the way back.
    expect(plannerChrome().hidden).toBe(true);
    for (const selector of ['app-support-link', '.theme-toggle', 'app-credits', '.page-chrome-back']) {
      expect(pageChrome()?.querySelector(selector), selector).toBeTruthy();
    }
    expect(list()?.querySelector('app-own-list-actions')).toBeTruthy();
    expect(drawer.mode).toBeNull();
  });

  it('also opens from the overflow menu', () => {
    (el().querySelector('.build-overflow-item') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(list()).toBeTruthy();
  });

  it('says which button opened the list', () => {
    const track = vi.spyOn(TestBed.inject(AnalyticsService), 'track');
    const opened = () => track.mock.calls.filter(([name]) => name === 'open_shopping_list')
      .map(([, params]) => params?.['entry_point']);

    shoppingListButton().click();
    fixture.detectChanges();
    (el().querySelector('.page-chrome-back') as HTMLButtonElement).click();
    fixture.detectChanges();
    (el().querySelector('.build-overflow-item') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(opened()).toEqual(['toolbar', 'menu']);
  });

  it('says it\'s open in the URL\'s fragment, and takes that out again on close', async () => {
    const path = () => TestBed.inject(Location).path(true);

    shoppingListButton().click();
    await TestBed.inject(ApplicationRef).whenStable();
    expect(path()).toBe('/#shopping-list');

    fixture.detectChanges();
    (el().querySelector('.page-chrome-back') as HTMLButtonElement).click();
    await TestBed.inject(ApplicationRef).whenStable();
    expect(path()).not.toContain('#');
  });

  it('closes the list on the browser\'s Back, back to the planner', async () => {
    TestBed.inject(Router).setUpLocationChangeListener();
    shoppingListButton().click();
    await TestBed.inject(ApplicationRef).whenStable();
    fixture.detectChanges();
    expect(list()).toBeTruthy();

    // The router handles a popstate on a timer, which whenStable doesn't wait for.
    const landed = firstValueFrom(TestBed.inject(Router).events.pipe(filter(event => event instanceof NavigationEnd)));
    TestBed.inject(Location).back();
    await landed;
    await TestBed.inject(ApplicationRef).whenStable();
    fixture.detectChanges();

    expect(list()).toBeNull();
    expect(panels().hidden).toBe(false);
  });

  it('opens the list when the URL says it\'s open, as a reload does', async () => {
    await TestBed.inject(Router).navigateByUrl('/#shopping-list');
    fixture.detectChanges();

    expect(list()).toBeTruthy();
    expect(panels().hidden).toBe(true);
  });

  it('goes back to the planner as it was', () => {
    const equipped = TestBed.inject(EquippedService);
    equipped.setActiveMainTab('affixes');
    fixture.detectChanges();

    shoppingListButton().click();
    fixture.detectChanges();
    (el().querySelector('.page-chrome-back') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(list()).toBeNull();
    expect(panels().hidden).toBe(false);
    expect(plannerChrome().hidden).toBe(false);
    expect(pageChrome()).toBeNull();
    expect(TestBed.inject(ShoppingListViewService).isOpen).toBe(false);
    expect(el().querySelector('#affixesPanel')?.hasAttribute('hidden')).toBe(false);
  });
});
