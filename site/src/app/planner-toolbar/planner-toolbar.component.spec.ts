import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { AffixBuilderDrawerService } from '../affix-builder-drawer/affix-builder-drawer.service';
import { EquippedService } from '../planner/equipped.service';
import { PlannerToolbarComponent } from './planner-toolbar.component';

describe('PlannerToolbarComponent', () => {
  let component: PlannerToolbarComponent;
  let fixture: ComponentFixture<PlannerToolbarComponent>;
  let equipped: EquippedService;
  const viewStateKeys = [
    'ddo-gear-planner-active-tab',
    'ddo-gear-planner-tracked-affix-group-mode',
    'ddo-gear-planner-tracked-affix-collapsed'
  ];

  beforeEach(async () => {
    for (const key of viewStateKeys) {
      localStorage.removeItem(key);
    }
    await TestBed.configureTestingModule({
      imports: [AppModule]
    }).compileComponents();
  });

  afterEach(() => {
    for (const key of viewStateKeys) {
      localStorage.removeItem(key);
    }
  });

  beforeEach(() => {
    equipped = TestBed.inject(EquippedService);
    fixture = TestBed.createComponent(PlannerToolbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function tab(id: string): HTMLButtonElement {
    return fixture.nativeElement.querySelector(`#${id}`);
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('view switch', () => {
    it('offers both views as tabs', () => {
      const tablist: HTMLElement = fixture.nativeElement.querySelector('[role="tablist"]');

      expect(tablist).not.toBeNull();
      // Each tab carries a short label as well, for the narrow layout where
      // this switch shares its line with Share and the save/sign-in control.
      expect(tab('equipmentTab').textContent).toContain('Equipment');
      expect(tab('equipmentTab').querySelector('.planner-view-option-short')?.textContent).toBe('Gear');
      expect(tab('affixesTab').textContent).toContain('Tracked Affixes');
      expect(tab('affixesTab').querySelector('.planner-view-option-short')?.textContent).toBe('Affixes');
    });

    it('points each tab at the panel it controls', () => {
      // MainComponent's panels have carried aria-labelledby="equipmentTab" /
      // "affixesTab" since the old tab bar was removed, with nothing of those
      // ids left to resolve against. These are that missing half.
      expect(tab('equipmentTab').getAttribute('aria-controls')).toBe('equipmentPanel');
      expect(tab('affixesTab').getAttribute('aria-controls')).toBe('affixesPanel');
    });

    it('marks the active view selected', () => {
      expect(tab('equipmentTab').getAttribute('aria-selected')).toBe('true');
      expect(tab('affixesTab').getAttribute('aria-selected')).toBe('false');
    });

    it('switches the view when a tab is clicked', () => {
      let active = '';
      equipped.getActiveMainTab().subscribe(value => active = value);

      tab('affixesTab').click();
      fixture.detectChanges();

      expect(active).toBe('affixes');
      expect(tab('affixesTab').getAttribute('aria-selected')).toBe('true');
      expect(tab('equipmentTab').getAttribute('aria-selected')).toBe('false');
    });

    it('keeps only the active tab in the tab order', () => {
      expect(tab('equipmentTab').getAttribute('tabindex')).toBe('0');
      expect(tab('affixesTab').getAttribute('tabindex')).toBe('-1');
    });

    it('follows a view change made somewhere else', () => {
      equipped.setActiveMainTab('affixes');
      fixture.detectChanges();

      expect(tab('affixesTab').getAttribute('aria-selected')).toBe('true');
    });
  });

  describe('per-view controls', () => {
    function search(): HTMLElement {
      return fixture.nativeElement.querySelector('.equipment-search');
    }

    function groupBy(): HTMLElement {
      return fixture.nativeElement.querySelector('.tracked-affix-groupby');
    }

    it('shows the gear search on the equipment view', () => {
      expect(search().hasAttribute('hidden')).toBe(false);
      expect(groupBy().hasAttribute('hidden')).toBe(true);
    });

    it('shows grouping and the affix builder on the tracked affixes view', () => {
      equipped.setActiveMainTab('affixes');
      fixture.detectChanges();

      expect(search().hasAttribute('hidden')).toBe(true);
      expect(groupBy().hasAttribute('hidden')).toBe(false);
    });

    it('keeps both controls rendered so the ultrawide layout can show them together', () => {
      // The two panels are revealed side by side above 2340px by un-hiding
      // them in CSS; that only works if both controls are in the DOM.
      expect(search()).not.toBeNull();
      expect(groupBy()).not.toBeNull();
    });

    it('opens the affix builder for editing', () => {
      const drawer = TestBed.inject(AffixBuilderDrawerService);
      drawer.close();

      fixture.nativeElement.querySelector('.tracked-affix-edit-affixes').click();

      expect(drawer.isOpen).toBe(true);
      expect(drawer.mode).toBe('edit');
    });
  });

  describe('gear search source', () => {
    it('hands the search every slot\'s gear', () => {
      const gearList = component['gearList'];
      const expected = gearList.getSlots()
        .reduce((total: number, slot: string) => total + gearList.getGearBySlot(slot).length, 0);

      expect(component.getAllGear().length).toBe(expected);
    });

    it('builds that list only once', () => {
      // It is read on every change-detection pass, and this component stays
      // mounted for the whole session. GearDbService's unfiltered gear map is
      // built once in its constructor, so the flattened list never goes stale.
      const first = component.getAllGear();

      expect(component.getAllGear()).toBe(first);
    });
  });
  describe('the affix builder button\'s label, with both panels on screen', () => {
    function button(): HTMLElement {
      return fixture.nativeElement.querySelector('.tracked-affix-edit-affixes');
    }

    /** jsdom has no layout: put the search box on the first line, and the button on `buttonLine`. */
    function layOut(buttonLine: 1 | 2) {
      const search = fixture.nativeElement.querySelector('.equipment-search') as HTMLElement;
      Object.defineProperty(search, 'offsetWidth', { configurable: true, get: () => 300 });
      search.getBoundingClientRect = () => ({ top: 50, bottom: 80 }) as DOMRect;
      button().getBoundingClientRect = () => {
        // The full label is what pushes it down; the short one always fits here.
        const top = buttonLine === 2 && !button().classList.contains('short-label') ? 90 : 52;
        return { top, bottom: top + 26 } as DOMRect;
      };
    }

    it('spells out "Add / edit affixes" when it fits on the line with the search box', () => {
      layOut(1);

      component.fitEditAffixesLabel();

      expect(button().classList).not.toContain('short-label');
    });

    it('falls back to "Affixes" rather than taking a line of its own', () => {
      layOut(2);

      component.fitEditAffixesLabel();

      expect(button().classList).toContain('short-label');
    });

    it('goes back to the full label once there is room', () => {
      layOut(2);
      component.fitEditAffixesLabel();
      layOut(1);

      component.fitEditAffixesLabel();

      expect(button().classList).not.toContain('short-label');
    });

    it('leaves it alone while the search box isn\'t laid out', () => {
      button().getBoundingClientRect = () => ({ top: 90, bottom: 116 }) as DOMRect;

      component.fitEditAffixesLabel();

      expect(button().classList).not.toContain('short-label');
    });
  });
});
