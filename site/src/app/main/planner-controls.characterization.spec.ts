// Pins the behaviour of the per-view controls that are about to move out of
// GearListComponent and EffectsTableComponent and into a shared workspace
// toolbar (the global gear search, Group by, Add / edit affixes) plus the view
// switch itself.
//
// Deliberately hosted on MainComponent and driven through the rendered DOM:
// MainComponent is the only host that contains these controls both before and
// after the move, so these specs keep passing across it. A spec that created
// GearListComponent directly, or called its methods, would have to be rewritten
// by the same commit it is supposed to be guarding.

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { convertToParamMap } from '@angular/router';
import { of } from 'rxjs';

import { AppModule } from '../app.module';
import { AffixBuilderDrawerService } from '../affix-builder-drawer/affix-builder-drawer.service';
import { QueryParamsService } from '../build/query-params.service';
import { GearDbService } from '../gear/gear-db.service';
import { Item } from '../gear/item';
import { EquippedService } from '../planner/equipped.service';
import { AnalyticsService } from '../shared/analytics.service';
import { AuthService } from '../shared/auth.service';
import { TypeaheadComponent } from '../typeahead/typeahead.component';
import { MainComponent } from './main.component';

describe('Planner workspace controls', () => {
  const onboardingStateKey = 'ddo-planner-onboarding-state-v1';
  const legacyOnboardingKey = 'ddo-planner-onboarding-affix-type-opened';
  const viewStateKeys = [
    'ddo-gear-planner-active-tab',
    'ddo-gear-planner-tracked-affix-group-mode',
    'ddo-gear-planner-tracked-affix-collapsed'
  ];

  beforeEach(async () => {
    for (const key of [legacyOnboardingKey, ...viewStateKeys]) {
      localStorage.removeItem(key);
    }
    // Skip onboarding: an un-onboarded build opens the affix builder in 'setup'
    // mode, which would muddy the assertion that Add / edit affixes opens it in
    // 'edit' mode.
    localStorage.setItem(onboardingStateKey, JSON.stringify({ completed: true, dismissed: true }));

    await TestBed.configureTestingModule({
      imports: [AppModule]
    }).compileComponents();

    // The real (Auth0) AuthService never resolves isLoading$ synchronously, so
    // contentReady would stay false and the whole template would go unrendered.
    TestBed.overrideProvider(AuthService, {
      useValue: {
        isAuthenticated$: of(false), user$: of(null), isLoading$: of(false),
        signIn: () => { }, signOut: () => { }
      }
    });
  });

  // contentReady's other half is normally driven by AppComponent's
  // NavigationEnd handler, which isn't part of a component-only test setup.
  beforeEach(() => {
    TestBed.inject(QueryParamsService).updateFromParams(convertToParamMap({}));
  });

  afterEach(() => {
    for (const key of [onboardingStateKey, legacyOnboardingKey, ...viewStateKeys]) {
      localStorage.removeItem(key);
    }
  });

  function createMain(): ComponentFixture<MainComponent> {
    // The empty-URL default adds a whole bundle, which would otherwise queue
    // idle-time availability warmup that outlives this TestBed.
    vi.spyOn(TestBed.inject(EquippedService) as any, '_scheduleAvailabilityWarmup')
      .mockReturnValue(undefined);
    const fixture = TestBed.createComponent(MainComponent);
    fixture.detectChanges();
    return fixture;
  }

  function showAffixesView(fixture: ComponentFixture<MainComponent>) {
    TestBed.inject(EquippedService).setActiveMainTab('affixes');
    fixture.detectChanges();
  }

  /** The global "Search all gear..." box, wherever it currently lives. */
  function globalSearch(fixture: ComponentFixture<MainComponent>): TypeaheadComponent {
    const found = fixture.debugElement.query(By.css('app-typeahead#globalSearch'));
    expect(found).not.toBeNull();
    return found.componentInstance as TypeaheadComponent;
  }

  function firstItemForSlot(slot: string): Item {
    const gear = TestBed.inject(GearDbService).getGearBySlot(slot);
    expect(gear.length).toBeGreaterThan(0);
    return gear[0];
  }

  describe('global gear search', () => {
    it('equips the selected item', () => {
      const fixture = createMain();
      const equipped = TestBed.inject(EquippedService);
      const item = firstItemForSlot('Goggles');

      globalSearch(fixture).onChange(item);

      expect(equipped.getSlotsSnapshot().get('Goggles')?.name).toBe(item.name);
    });

    it('records the equip as coming from the global search', () => {
      const fixture = createMain();
      const analytics = TestBed.inject(AnalyticsService);
      vi.spyOn(analytics, 'track').mockReturnValue(undefined);
      const item = firstItemForSlot('Goggles');

      globalSearch(fixture).onChange(item);

      expect(analytics.track).toHaveBeenCalledWith('planner_equip_item', {
        equip_source: 'global_search',
        slot: 'Goggles'
      });
    });

    it('resolves a synonym match back to the canonical item', () => {
      const fixture = createMain();
      const equipped = TestBed.inject(EquippedService);
      const item = firstItemForSlot('Goggles');

      globalSearch(fixture).onChange({ name: `${item.name} (a synonym)`, original: item.name });

      expect(equipped.getSlotsSnapshot().get('Goggles')?.name).toBe(item.name);
    });

    it('ignores a selection that does not resolve to a known item', () => {
      const fixture = createMain();
      const equipped = TestBed.inject(EquippedService);

      globalSearch(fixture).onChange({ name: 'Nothing (nope)', original: 'No Such Item' });

      expect(equipped.getSlotsSnapshot().get('Goggles')).toBeFalsy();
    });

    it('labels a result with its slot', () => {
      const fixture = createMain();
      const item = firstItemForSlot('Goggles');

      expect(globalSearch(fixture).resultFormatter(item)).toBe(`${item.name} (Goggles)`);
    });

    it('labels a result that would displace equipped gear with what it replaces', () => {
      const fixture = createMain();
      const gear = TestBed.inject(GearDbService).getGearBySlot('Goggles');
      expect(gear.length).toBeGreaterThan(1);
      TestBed.inject(EquippedService).set(gear[0]);
      fixture.detectChanges();

      expect(globalSearch(fixture).resultFormatter(gear[1]))
        .toBe(`${gear[1].name} (Goggles) (replaces ${gear[0].name})`);
    });

    it('passes every slot\'s gear to the search', () => {
      const fixture = createMain();
      const gearList = TestBed.inject(GearDbService);
      const expected = gearList.getSlots()
        .reduce((total, slot) => total + gearList.getGearBySlot(slot).length, 0);

      expect(globalSearch(fixture).source.length).toBe(expected);
    });
  });

  describe('tracked affix grouping', () => {
    it('switches the group mode when Scarcity is clicked', () => {
      const fixture = createMain();
      showAffixesView(fixture);
      const equipped = TestBed.inject(EquippedService);
      let groupMode = '';
      equipped.getTrackedAffixViewState().subscribe(state => groupMode = state.groupMode);

      const scarcity: HTMLButtonElement = fixture.nativeElement
        .querySelector('.tracked-affix-groupby-option:not(.active)');
      expect(scarcity).not.toBeNull();
      scarcity.click();
      fixture.detectChanges();

      expect(groupMode).toBe('slots');
    });

    it('marks the chosen group mode active', () => {
      const fixture = createMain();
      showAffixesView(fixture);
      TestBed.inject(EquippedService).setTrackedAffixGroupMode('slots');
      fixture.detectChanges();

      const active: HTMLElement = fixture.nativeElement
        .querySelector('.tracked-affix-groupby-option.active');
      expect(active.textContent?.trim()).toBe('Scarcity');
    });

    it('opens the affix builder for editing from Add / edit affixes', () => {
      const fixture = createMain();
      showAffixesView(fixture);
      const drawer = TestBed.inject(AffixBuilderDrawerService);
      drawer.close();
      fixture.detectChanges();

      const edit: HTMLButtonElement = fixture.nativeElement
        .querySelector('.tracked-affix-edit-affixes');
      expect(edit).not.toBeNull();
      edit.click();
      fixture.detectChanges();

      expect(drawer.isOpen).toBe(true);
      expect(drawer.mode).toBe('edit');
    });
  });

  describe('view switching', () => {
    function panelHidden(fixture: ComponentFixture<MainComponent>, id: string): boolean {
      const panel: HTMLElement = fixture.nativeElement.querySelector(`#${id}`);
      expect(panel).not.toBeNull();
      return panel.hasAttribute('hidden');
    }

    it('starts on the equipment view', () => {
      const fixture = createMain();

      expect(panelHidden(fixture, 'equipmentPanel')).toBe(false);
      expect(panelHidden(fixture, 'affixesPanel')).toBe(true);
    });

    it('shows the tracked affixes view once selected', () => {
      const fixture = createMain();

      showAffixesView(fixture);

      expect(panelHidden(fixture, 'equipmentPanel')).toBe(true);
      expect(panelHidden(fixture, 'affixesPanel')).toBe(false);
    });

    it('remembers the active view across a reload', () => {
      const fixture = createMain();

      showAffixesView(fixture);

      expect(localStorage.getItem('ddo-gear-planner-active-tab')).toBe('affixes');
    });
  });
});
