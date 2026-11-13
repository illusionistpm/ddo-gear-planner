// Pins what the planner's header lets you do - filters, the shopping list,
// Save As, My builds, renaming, sign-out, the theme - ahead of reorganising
// where those controls live (chips into the filter sheet, the save caret and
// My builds into one build menu, the utilities into the account menu).
//
// Hosted on MainComponent and driven through the rendered DOM so it survives
// that move. Where a control's *location* changes, only the small helpers at
// the top of this file change with it; every assertion stays as written.

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { convertToParamMap } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';

import { AppModule } from '../app.module';
import { BuildsService } from '../build/builds.service';
import { CurrentBuildService } from '../build/current-build.service';
import { QueryParamsService } from '../build/query-params.service';
import { EquippedService } from '../planner/equipped.service';
import { FiltersService } from '../planner/filters.service';
import { ShoppingListViewService } from '../planner/shopping-list/shopping-list-view.service';
import { AuthService } from '../shared/auth.service';
import { ThemeService } from '../shared/theme.service';
import { MainComponent } from './main.component';

describe('Planner header actions', () => {
  const onboardingStateKey = 'ddo-planner-onboarding-state-v1';
  let fixture: ComponentFixture<MainComponent>;
  let signOut: ReturnType<typeof vi.fn>;
  const isAuthenticated$ = new BehaviorSubject(true);

  beforeEach(async () => {
    localStorage.setItem(onboardingStateKey, JSON.stringify({ completed: true, dismissed: true }));
    isAuthenticated$.next(true);
    signOut = vi.fn();
    await TestBed.configureTestingModule({ imports: [AppModule] }).compileComponents();
    TestBed.overrideProvider(AuthService, {
      useValue: {
        isAuthenticated$, user$: of({ name: 'Tester', picture: null }), isLoading$: of(false),
        signIn: () => { }, signOut
      }
    });
    TestBed.overrideProvider(BuildsService, {
      // The signed-in viewer owns abc123, so loading it confirms ownership.
      useValue: {
        listMine: () => of([{ id: 'b1', shortId: 'abc123', name: 'Mike\'s Tank', blob: 'z1.x' }]),
        create: () => of(null), update: () => of(null)
      }
    });
  });

  beforeEach(() => {
    TestBed.inject(QueryParamsService).updateFromParams(convertToParamMap({}));
    vi.spyOn(TestBed.inject(EquippedService) as any, '_scheduleAvailabilityWarmup').mockReturnValue(undefined);
    fixture = TestBed.createComponent(MainComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.removeItem(onboardingStateKey);
  });

  const el = () => fixture.nativeElement as HTMLElement;
  const render = () => fixture.detectChanges();
  function click(selector: string) {
    const target = el().querySelector<HTMLElement>(selector);
    expect(target, selector).not.toBeNull();
    target!.click();
    render();
  }
  function clickText(selector: string, text: string) {
    const target = [...el().querySelectorAll<HTMLElement>(selector)].find(e => e.textContent?.trim() === text);
    expect(target, `${selector} "${text}"`).toBeDefined();
    target!.click();
    render();
  }

  // ---- Where things live. Only these change when the header is reorganised. ----

  /** The button that removes one active filter, by its accessible name. */
  function filterRemoveButton(label: string): HTMLButtonElement | null {
    return el().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  }

  function openSaveAs() {
    click('.save-split-caret');
    clickText('.save-menu-item', 'Save As…');
  }

  function openMyBuilds() {
    click('.build-switcher-caret');
  }

  function startRenaming(): HTMLInputElement {
    click('.build-name-editable');
    const input = el().querySelector<HTMLInputElement>('input[aria-label="Build name"]');
    expect(input).not.toBeNull();
    return input!;
  }

  function signOutFromMenu() {
    click('.avatar-button');
    clickText('.avatar-menu-item', 'Sign out');
  }

  function toggleTheme() {
    click('.theme-toggle');
  }

  // ---- Behaviour ----

  describe('filters', () => {
    it('counts the active filters on the Filters button', () => {
      TestBed.inject(FiltersService).setShowRaidItems(false);
      render();

      expect(el().querySelector('.planner-filter-count')?.textContent?.trim()).toBe('1');
    });

    it('removes a single filter without opening anything else', () => {
      const filters = TestBed.inject(FiltersService);
      filters.setShowRaidItems(false);
      render();

      filterRemoveButton('Show raid items')!.click();
      render();

      let showRaids = false;
      filters.getItemFilters().subscribe(f => showRaids = f.showRaidItems).unsubscribe();
      expect(showRaids).toBe(true);
      expect(el().querySelector('.planner-filter-count')).toBeNull();
    });
  });

  it('opens this build\'s shopping list', () => {
    const view = TestBed.inject(ShoppingListViewService);
    const open = vi.spyOn(view, 'open').mockReturnValue(undefined);

    click('.shopping-list-open:not(.shopping-list-rejoin)');

    expect(open).toHaveBeenCalled();
  });

  it('offers Save As for an owned build, which opens the save-as dialog with its name', async () => {
    TestBed.inject(CurrentBuildService).markSaved({ savedBuildId: 'b1', shortId: 'abc123', name: 'Mike\'s Tank' });
    render();

    openSaveAs();
    await fixture.whenStable();
    render();

    const dialog = el().querySelector('app-save-build-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog!.querySelector<HTMLInputElement>('input')?.value).toBe('Mike\'s Tank');
  });

  it('opens My builds, offering a new build', () => {
    openMyBuilds();

    expect(el().querySelector('app-my-builds')?.textContent).toContain('New build');
  });

  it('renames an unsaved build locally', () => {
    const input = startRenaming();
    input.value = 'Shiny';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    render();

    expect(TestBed.inject(CurrentBuildService).value.name).toBe('Shiny');
  });

  it('signs out', () => {
    signOutFromMenu();

    expect(signOut).toHaveBeenCalled();
  });

  it('switches between light and dark', () => {
    const theme = TestBed.inject(ThemeService);
    const before = theme.isDarkTheme();

    toggleTheme();

    expect(theme.isDarkTheme()).toBe(!before);
  });
});
