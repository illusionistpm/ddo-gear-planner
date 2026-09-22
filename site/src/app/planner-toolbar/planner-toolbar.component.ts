import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';

import { AffixBuilderDrawerService } from '../affix-builder-drawer/affix-builder-drawer.service';
import { GearDbService } from '../gear/gear-db.service';
import { Item } from '../gear/item';
import { EquippedService, PlannerTab, TrackedAffixGroupMode } from '../planner/equipped.service';
import { AnalyticsService } from '../shared/analytics.service';
import { TypeaheadResult } from '../typeahead/typeahead.component';

/**
 * The workspace toolbar: the Equipment / Tracked Affixes switch, plus whichever
 * view's own primary control belongs beside it.
 *
 * Both views' controls live here rather than inside each view because they used
 * to scroll away with the content - the gear search sat in gear-list's own
 * toolbar and Group by in effects-table's - and because switching views had no
 * visible control at all. The only route between them was the "open the full
 * view" button inside the *opposite* view's compact rail, which is no help at
 * all once those rails stop rendering on narrow screens.
 *
 * Both controls stay in the DOM and are toggled with [hidden], the same way
 * MainComponent's two panels are: the ultrawide layout shows both panels side
 * by side, and needs to reveal both controls with them.
 */
@Component({
    selector: 'app-planner-toolbar',
    templateUrl: './planner-toolbar.component.html',
    styleUrls: ['./planner-toolbar.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class PlannerToolbarComponent implements OnInit, OnDestroy {
  activeTab: PlannerTab = 'equipment';
  groupMode: TrackedAffixGroupMode = 'category';

  private tabSubscription?: Subscription;
  private viewStateSubscription?: Subscription;
  // GearDbService builds its unfiltered gear map once, in its constructor, so
  // the flattened list never changes. Worth caching: this component is mounted
  // for the whole session and the template reads it on every change-detection
  // pass, where it used to rebuild an ~n-thousand entry array each time.
  private allGear?: Item[];

  constructor(
    public equipped: EquippedService,
    private gearList: GearDbService,
    private affixBuilder: AffixBuilderDrawerService,
    private analytics: AnalyticsService
  ) { }

  ngOnInit() {
    this.tabSubscription = this.equipped.getActiveMainTab().subscribe(tab => {
      this.activeTab = tab;
    });
    this.viewStateSubscription = this.equipped.getTrackedAffixViewState().subscribe(state => {
      this.groupMode = state.groupMode;
    });
  }

  ngOnDestroy() {
    this.tabSubscription?.unsubscribe();
    this.viewStateSubscription?.unsubscribe();
  }

  isActiveTab(tab: PlannerTab) {
    return this.activeTab === tab;
  }

  selectTab(tab: PlannerTab) {
    // MainComponent subscribes to the same tab stream and does the housekeeping
    // (closing the filter sheet, refreshing onboarding) from there.
    this.equipped.setActiveMainTab(tab);
  }

  setGroupMode(mode: TrackedAffixGroupMode) {
    this.equipped.setTrackedAffixGroupMode(mode);
  }

  openBuilder() {
    this.affixBuilder.open('edit');
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
      this.equipped.set(actualItem);
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
