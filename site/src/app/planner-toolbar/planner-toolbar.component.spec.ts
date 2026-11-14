import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { AppModule } from '../app.module';
import { AffixEditorService } from '../planner/affix-editor.service';
import { GroupSummary } from '../build/groups.service';
import { MyListsService } from '../build/my-lists.service';
import { EquippedService } from '../planner/equipped.service';
import { ShoppingListViewService } from '../planner/shopping-list/shopping-list-view.service';
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
      expect(tab('affixesTab').textContent).toContain('Build Goals');
      expect(tab('affixesTab').querySelector('.planner-view-option-short')?.textContent).toBe('Goals');
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

    it('shows the gear search on the equipment view', () => {
      expect(search().hasAttribute('hidden')).toBe(false);
    });

    it('hides it on the tracked affixes view, but keeps it rendered for the two-panel layout', () => {
      // From 995px both panels are on screen, and the CSS un-hides the search;
      // that only works if it is still in the DOM.
      equipped.setActiveMainTab('affixes');
      fixture.detectChanges();

      expect(search()).not.toBeNull();
      expect(search().hasAttribute('hidden')).toBe(true);
    });

    it('leaves grouping to the tracked affixes panel itself', () => {
      expect(fixture.nativeElement.querySelector('.tracked-affix-groupby')).toBeNull();
    });

    it('focuses the search on "/", switching to the gear view if need be', async () => {
      equipped.setActiveMainTab('affixes');
      fixture.detectChanges();
      const input: HTMLInputElement = search().querySelector('input')!;

      const event = new KeyboardEvent('keydown', { key: '/', cancelable: true, bubbles: true });
      document.body.dispatchEvent(event);
      fixture.detectChanges();
      await new Promise(resolve => setTimeout(resolve));

      expect(event.defaultPrevented).toBe(true);
      expect(component.isActiveTab('equipment')).toBe(true);
      expect(document.activeElement).toBe(input);
      input.blur();
    });

    it('leaves "/" alone while typing somewhere else', () => {
      const other = document.createElement('input');
      document.body.appendChild(other);
      try {
        const event = new KeyboardEvent('keydown', { key: '/', cancelable: true, bubbles: true });
        other.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(false);
      } finally {
        other.remove();
      }
    });

    const affixButton = () => fixture.nativeElement.querySelector('.tracked-affix-edit-affixes') as HTMLButtonElement;
    const label = () => affixButton().querySelector('.tracked-affix-edit-affixes-label')?.textContent?.trim();

    it('opens and closes the Build Goals editor, keeping its label and flipping aria-expanded', () => {
      const editor = TestBed.inject(AffixEditorService);
      editor.close();
      fixture.detectChanges();
      expect(affixButton().getAttribute('aria-expanded')).toBe('false');
      expect(affixButton().getAttribute('aria-controls')).toBe('affixEditor');
      expect(label()).toBe('Build Goals');

      affixButton().click();
      fixture.detectChanges();
      expect(editor.isOpen).toBe(true);
      expect(affixButton().getAttribute('aria-expanded')).toBe('true');
      expect(affixButton().classList).toContain('open');
      expect(label()).toBe('Build Goals');

      affixButton().click();
      fixture.detectChanges();
      expect(editor.isOpen).toBe(false);
      expect(affixButton().getAttribute('aria-expanded')).toBe('false');
      expect(label()).toBe('Build Goals');
    });

    it('reads + Build Goals, + Goals when short, so it is not taken for the Goals tab', () => {
      expect(affixButton().querySelector('.affix-toggle-plus.fa-plus')).not.toBeNull();
      expect(affixButton().querySelector('.tracked-affix-edit-affixes-short')?.textContent?.trim()).toBe('Goals');
    });

    it('glows only while the editor is shut and the build has no focus yet', () => {
      const editor = TestBed.inject(AffixEditorService);

      equipped.setImportantAffixes(['Dodge']);
      editor.open();
      fixture.detectChanges();
      expect(affixButton().classList).not.toContain('needs-attention');

      editor.close();
      fixture.detectChanges();
      expect(affixButton().classList).toContain('needs-attention');

      equipped.addImportantAffix('Strength');
      fixture.detectChanges();
      expect(affixButton().classList).not.toContain('needs-attention');
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

    it('spells out "Build Goals" when it fits on the line with the search box', () => {
      layOut(1);

      component.fitEditAffixesLabel();

      expect(button().classList).not.toContain('short-label');
    });

    it('falls back to "Goals" rather than taking a line of its own', () => {
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

describe('PlannerToolbarComponent shopping list', () => {
  let fixture: ComponentFixture<PlannerToolbarComponent>;
  let rejoin: BehaviorSubject<GroupSummary | null>;
  const el = () => fixture.nativeElement as HTMLElement;
  const cart = () => el().querySelector<HTMLButtonElement>('.shopping-list-open')!;
  const group: GroupSummary = {
    shortId: 'grp1', name: 'Saturday run', inviteToken: 'tok', isHost: false, buildCount: 3,
    yourBuildIds: ['b1'], characterNames: [], updatedAt: ''
  };

  beforeEach(async () => {
    rejoin = new BehaviorSubject<GroupSummary | null>(null);
    await TestBed.configureTestingModule({
      imports: [AppModule],
      providers: [{ provide: MyListsService, useValue: { rejoin$: rejoin } }]
    }).compileComponents();
    fixture = TestBed.createComponent(PlannerToolbarComponent);
    fixture.detectChanges();
  });

  it('opens this build\'s list straight away when it isn\'t on a group\'s', () => {
    const open = vi.spyOn(TestBed.inject(ShoppingListViewService), 'open').mockReturnValue(undefined);

    cart().click();
    fixture.detectChanges();

    expect(open).toHaveBeenCalledWith('toolbar');
    expect(el().querySelector('.shopping-list-menu')).toBeNull();
    expect(cart().hasAttribute('aria-haspopup')).toBe(false);
  });

  it('on a group\'s list too, shows the group\'s size and offers either list', async () => {
    rejoin.next(group);
    fixture.detectChanges();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    expect(cart().querySelector('.shopping-list-group-count')?.textContent?.trim()).toBe('3');
    cart().click();
    fixture.detectChanges();

    const items = [...el().querySelectorAll('.shopping-list-menu-item')];
    expect(items.map(i => i.querySelector('.shopping-list-menu-title')?.textContent?.trim()))
      .toEqual(['This build', 'Saturday run']);
    (items[1] as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith('/list/grp1#t=tok');
    expect(el().querySelector('.shopping-list-menu')).toBeNull();
  });

  it('opens this build\'s list from that menu too', () => {
    rejoin.next(group);
    fixture.detectChanges();
    const open = vi.spyOn(TestBed.inject(ShoppingListViewService), 'open').mockReturnValue(undefined);

    cart().click();
    fixture.detectChanges();
    el().querySelector<HTMLButtonElement>('.shopping-list-menu-item')!.click();

    expect(open).toHaveBeenCalledWith('toolbar');
  });
});
