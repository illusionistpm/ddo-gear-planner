import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, HostListener, inject, NgZone, OnDestroy, OnInit, ViewChild
} from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { groupPath, GroupSummary } from '../build/groups.service';
import { MyListsService } from '../build/my-lists.service';
import { GearDbService } from '../gear/gear-db.service';
import { Item } from '../gear/item';
import { EquippedService, PlannerTab } from '../planner/equipped.service';
import { ShoppingListViewService } from '../planner/shopping-list/shopping-list-view.service';
import { AnalyticsService } from '../shared/analytics.service';
import { TypeaheadResult } from '../typeahead/typeahead.component';
import { SlotUndoService } from '../undo/slot-undo.service';

/**
 * The workspace toolbar: the Equipment / Build Goals switch, the gear search
 * and the shopping list. The goals editor opens from the Build Goals panel
 * itself (EffectsTableComponent's goals bar), not from here.
 *
 * The search lives here rather than in gear-list's own toolbar, where it
 * scrolled away with the content. It stays in the DOM on the goals view,
 * toggled with [hidden] the same way MainComponent's two panels are: from
 * 995px both panels are on screen, and the CSS reveals it with them. Group by
 * belongs to the Build Goals panel alone, and lives there.
 */
@Component({
    selector: 'app-planner-toolbar',
    templateUrl: './planner-toolbar.component.html',
    styleUrls: ['./planner-toolbar.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class PlannerToolbarComponent implements OnInit, AfterViewInit, OnDestroy {
  activeTab: PlannerTab = 'equipment';

  @ViewChild('viewSwitch') private viewSwitch?: ElementRef<HTMLElement>;
  @ViewChild('gearSearch') private gearSearch?: ElementRef<HTMLElement>;

  private tabSubscription?: Subscription;
  private rejoinSubscription?: Subscription;
  private switchObserver?: ResizeObserver;
  // GearDbService builds its unfiltered gear map once, in its constructor, so
  // the flattened list never changes. Worth caching: this component is mounted
  // for the whole session and the template reads it on every change-detection
  // pass, where it used to rebuild an ~n-thousand entry array each time.
  private allGear?: Item[];

  constructor(
    public equipped: EquippedService,
    private gearList: GearDbService,
    private analytics: AnalyticsService,
    private zone: NgZone,
    private slotUndo: SlotUndoService
  ) { }

  ngOnInit() {
    this.rejoinSubscription = this.myLists.rejoin$.subscribe(list => {
      this.rejoin = list;
      if (!list) {
        this.cartMenuOpen = false;
      }
    });
    this.tabSubscription = this.equipped.getActiveMainTab().subscribe(tab => {
      this.activeTab = tab;
    });
  }

  ngAfterViewInit() {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    // The labels swap between full and short forms at a breakpoint, so the
    // buttons are re-measured whenever the switch changes size.
    this.zone.runOutsideAngular(() => {
      this.switchObserver = new ResizeObserver(() => this.measureViewSwitch());
      if (this.viewSwitch) {
        this.switchObserver.observe(this.viewSwitch.nativeElement);
      }
    });
  }

  ngOnDestroy() {
    this.switchObserver?.disconnect();
    this.tabSubscription?.unsubscribe();
    this.rejoinSubscription?.unsubscribe();
  }

  /**
   * The switch's highlight is one thumb that slides between the two buttons,
   * following a swipe's progress (--planner-swipe-progress, set by
   * PanelSwipeDirective) as well as the active tab. The buttons keep their
   * natural, unequal widths - the phone's first line has no room to spare -
   * so the thumb interpolates between their measured positions instead. Until
   * that measurement lands, the CSS falls back to highlighting the active
   * button itself.
   */
  private measureViewSwitch() {
    const viewSwitch = this.viewSwitch?.nativeElement;
    if (!viewSwitch) {
      return;
    }
    const options = viewSwitch.querySelectorAll<HTMLElement>('.planner-view-option');
    if (options.length !== 2 || !options[0].offsetWidth) {
      return;
    }
    options.forEach((option, index) => {
      viewSwitch.style.setProperty(`--planner-view-${index}-left`, `${option.offsetLeft}px`);
      viewSwitch.style.setProperty(`--planner-view-${index}-width`, `${option.offsetWidth}px`);
    });
    viewSwitch.classList.add('thumb-ready');
  }

  isActiveTab(tab: PlannerTab) {
    return this.activeTab === tab;
  }

  selectTab(tab: PlannerTab) {
    // MainComponent subscribes to the same tab stream and does the housekeeping
    // (closing the filter sheet, refreshing onboarding) from there.
    this.equipped.setActiveMainTab(tab);
  }

  private readonly shoppingListView = inject(ShoppingListViewService);
  private readonly myLists = inject(MyListsService);
  private readonly router = inject(Router);
  /** The list of several builds this build is on, to rejoin; null for none. */
  rejoin: GroupSummary | null = null;

  /** Open while the build is on a group's list too, and the cart offers both. */
  cartMenuOpen = false;

  onCartClick() {
    if (this.rejoin) {
      this.cartMenuOpen = !this.cartMenuOpen;
    } else {
      this.openShoppingList();
    }
  }

  openShoppingList() {
    this.cartMenuOpen = false;
    this.shoppingListView.open('toolbar');
  }

  rejoinList(list: GroupSummary) {
    this.cartMenuOpen = false;
    this.analytics.track('rejoin_list', { from: 'toolbar' });
    this.router.navigateByUrl(groupPath(list.shortId, list.inviteToken));
  }

  /**
   * "/" jumps to the gear search, as on most sites with one search box -
   * unless you're already typing somewhere. On a narrow screen showing the
   * goals view the box is hidden, so it switches to the gear view first.
   */
  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent) {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
      return;
    }
    const input = this.gearSearch?.nativeElement.querySelector('input');
    if (!input || this.shoppingListView.isOpen) {
      return;
    }
    event.preventDefault();
    // Not [hidden] alone: from 995px the box shows on either view regardless.
    if (input.getClientRects().length === 0 && !this.isActiveTab('equipment')) {
      this.selectTab('equipment');
      setTimeout(() => input.focus());
    } else {
      input.focus();
    }
  }

  getAllGear(): Item[] {
    if (!this.allGear) {
      const allGear: Item[] = [];
      for (const slot of this.gearList.getSlots()) {
        allGear.push(...this.gearList.getGearBySlot(slot));
      }
      this.allGear = allGear;
    }
    return this.allGear;
  }

  onGlobalItemSelected = (item: TypeaheadResult) => {
    if (item) {
      let actualItem: Item | undefined;
      if ('original' in item) {
        // This is a synonym match, find the actual item by name
        const allGear = this.getAllGear();
        actualItem = allGear.find(g => g.name === item.original);
        if (!actualItem) {
          console.log('Could not find item with name:', item.original);
          return;
        }
      } else if (item instanceof Item) {
        actualItem = item;
      } else {
        // Not an Item object, maybe a fake object
        console.log('Invalid item selected:', item);
        return;
      }
      if (!this.equipped.canEquip(actualItem)) {
        return;
      }
      const before = this.slotUndo.before();
      this.equipped.set(actualItem);
      this.slotUndo.offerUndo(before);
      this.analytics.track('planner_equip_item', {
        equip_source: 'global_search',
        slot: actualItem.slot
      });
    }
  }

  globalResultFormatter = (item: TypeaheadResult) => {
    if (item instanceof Item) {
      const current = this.equipped.getSlotsSnapshot().get(item.slot)?.name;
      return item.name + ' (' + item.slot + ')' + (current ? ' (replaces ' + current + ')' : '');
    }
    return item.name;
  }
}
