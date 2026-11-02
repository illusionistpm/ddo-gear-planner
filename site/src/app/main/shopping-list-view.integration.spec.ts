import { ComponentFixture, TestBed } from '@angular/core/testing';
import { convertToParamMap } from '@angular/router';
import { of } from 'rxjs';

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
    await TestBed.configureTestingModule({ imports: [AppModule] }).compileComponents();
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
  const toolbar = () => el().querySelector('app-planner-toolbar') as HTMLElement;
  const shoppingListButton = () => el().querySelector('.shopping-list-open') as HTMLButtonElement;

  it('opens the list in the planner\'s place from the toolbar, closing what floats over the planner', () => {
    const drawer = TestBed.inject(AffixBuilderDrawerService);
    expect(drawer.mode).toBe('setup');

    shoppingListButton().click();
    fixture.detectChanges();

    expect(list()).toBeTruthy();
    expect(panels().hidden).toBe(true);
    expect(toolbar().hidden).toBe(true);
    // Without the switch to push it there, the break would share the first line and
    // squeeze the build actions to nothing on a phone.
    expect((el().querySelector('.planner-chrome-break') as HTMLElement).hidden).toBe(true);
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
    (el().querySelector('.shopping-list-back') as HTMLButtonElement).click();
    fixture.detectChanges();
    (el().querySelector('.build-overflow-item') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(opened()).toEqual(['toolbar', 'menu']);
  });

  it('goes back to the planner as it was', () => {
    const equipped = TestBed.inject(EquippedService);
    equipped.setActiveMainTab('affixes');
    fixture.detectChanges();

    shoppingListButton().click();
    fixture.detectChanges();
    (el().querySelector('.shopping-list-back') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(list()).toBeNull();
    expect(panels().hidden).toBe(false);
    expect(toolbar().hidden).toBe(false);
    expect(TestBed.inject(ShoppingListViewService).isOpen).toBe(false);
    expect(el().querySelector('#affixesPanel')?.hasAttribute('hidden')).toBe(false);
  });
});
