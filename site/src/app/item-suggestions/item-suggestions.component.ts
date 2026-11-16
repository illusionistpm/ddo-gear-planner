import { Component, OnInit, OnDestroy, Input, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Observable, Subscription } from 'rxjs';

import { GearDbService } from '../gear/gear-db.service';
import { EquippedService } from '../planner/equipped.service';
import { Item } from '../gear/item';
import { UserGearService, UserItemLocation } from '../planner/user-gear.service';
import { AnalyticsService } from '../shared/analytics.service';
import { perfAfterFrames, perfMeasure, perfStart } from '../shared/perf-trace';
import { SuggestionDrawerService } from '../suggestion-drawer/suggestion-drawer.service';
import { DrawerEquipService } from '../suggestion-drawer/drawer-equip.service';
import { slotLabel } from '../gear/slot-display';
import { SlotUndoService } from '../undo/slot-undo.service';

/** How many items the list shows at first, and adds with each "Show more". */
const PAGE_SIZE = 20;

@Component({
    selector: 'app-item-suggestions',
    templateUrl: './item-suggestions.component.html',
    styleUrls: ['./item-suggestions.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ItemSuggestionsComponent implements OnInit, OnDestroy {
  @Input() slot!: string;

  current: Observable<Item | null> | null = null;
  gear: Array<Item> = [];
  filteredGear: Array<Item> = [];
  essenceCrafting: Array<Item> = [];
  searchQuery = '';
  /** What's in the slot now, shown above the list with a way to clear it. */
  currentItem: Item | null = null;
  /** Items the list could still show: `gear` is the first of `matches`. */
  remaining = 0;
  /** With nothing to show, how many items the filters are holding back. */
  hiddenByFilters = 0;
  private suggestedGear: Array<Item> = [];
  private matches: Array<Item> = [];
  private visibleCount = PAGE_SIZE;
  private userItemsChangedSubscription?: Subscription;
  private currentItemSubscription?: Subscription;

  constructor(
    public gearDB: GearDbService,
    public equipped: EquippedService,
    public userGear: UserGearService,
    private analytics: AnalyticsService,
    private suggestionDrawer: SuggestionDrawerService,
    private drawerEquip: DrawerEquipService,
    private slotUndo: SlotUndoService,
    private changeDetector: ChangeDetectorRef
  ) { }

  ngOnDestroy() {
    this.userItemsChangedSubscription?.unsubscribe();
    this.currentItemSubscription?.unsubscribe();
  }

  get slotName(): string {
    return slotLabel(this.slot);
  }

  get nextPageSize(): number {
    return Math.min(PAGE_SIZE, this.remaining);
  }

  isCurrent(item: Item): boolean {
    return !!this.currentItem && item.name === this.currentItem.name;
  }

  showMore() {
    this.visibleCount += PAGE_SIZE;
    this.showMatches();
  }

  userOwnsItem(item: Item): boolean {
    return !!item?.name && this.userGear.hasItem(item.name);
  }

  getUserItemLocations(item: Item): UserItemLocation[] | undefined {
    return item?.name ? this.userGear.getItemLocations(item.name) : undefined;
  }

  ngOnInit() {
    const done = perfStart('ItemSuggestionsComponent.ngOnInit');
    this.userItemsChangedSubscription = this.userGear.userItemsChanged$.subscribe(() => {
      this.changeDetector.markForCheck();
    });
    this.current = this.equipped.getSlot(this.slot);
    this.currentItemSubscription?.unsubscribe();
    this.currentItemSubscription = this.current?.subscribe(item => {
      this.currentItem = item;
      this.changeDetector.markForCheck();
    });

    const shortlist: Array<Item> = [];
    this.filteredGear = this.equipped.getCompatibleGearForSlot(this.slot, this.gearDB.getFilteredGearBySlot(this.slot) || []);
    for (const gear of this.filteredGear) {
      shortlist.push(gear);
    }

    const scores = perfMeasure('ItemSuggestionsComponent.scoreItems', () => {
      const scoreMap = new Map<Item, number>();
      for (const item of shortlist) {
        scoreMap.set(item, this.equipped.getScore(item));
      }
      return scoreMap;
    });

    perfMeasure('ItemSuggestionsComponent.sortItems', () => {
      shortlist.sort((a, b) => (scores.get(b) || 0) - (scores.get(a) || 0));
    });

    this.suggestedGear = shortlist;
    this.updateDisplayedGear();

    this.essenceCrafting = this.filteredGear.filter(item => item.isGeneratedEssenceCraftingBlank());
    done({
      slot: this.slot,
      filtered: this.filteredGear.length,
      suggested: this.gear.length,
      essenceCrafting: this.essenceCrafting.length
    });
    perfAfterFrames('paint after item suggestions init');
  }

  clearSlot() {
    const before = this.slotUndo.before();
    this.equipped.clearSlot(this.slot);
    this.slotUndo.offerUndo(before);
    this.analytics.track('planner_clear_slot', {
      slot: this.slot,
      clear_source: 'slot_suggestions'
    });
    this.suggestionDrawer.close();
  }

  equipItem(item: Item) {
    this.drawerEquip.equip(item, 'slot_suggestions');
  }

  onChange(slot: string) {
    return (newVal: Item | string) => {
      if (newVal instanceof Item) {
        this.gear = [newVal];
      } else {
        const found = this.filteredGear.find(item => item.name === newVal);
        if (found) {
          this.gear = [found];
        } else {
          this.gear = [];
        }
      }
    };
  }

  onSearchQueryChanged() {
    this.updateDisplayedGear();
  }

  private updateDisplayedGear() {
    const query = this.searchQuery.trim().toLowerCase();
    this.visibleCount = PAGE_SIZE;
    this.matches = query
      ? this.filteredGear
        .filter(item => this.itemMatchesSearch(item, query))
        .sort(this.sortSearchResults(query))
      : this.suggestedGear;
    this.hiddenByFilters = this.matches.length ? 0 : this.countHiddenByFilters(query);
    this.showMatches();
  }

  private showMatches() {
    this.gear = this.matches.slice(0, this.visibleCount);
    this.remaining = this.matches.length - this.gear.length;
  }

  /** Items that would be listed with every filter off: only worked out when the list is empty. */
  private countHiddenByFilters(query: string) {
    const unfiltered = this.equipped.getCompatibleGearForSlot(this.slot, this.gearDB.getGearBySlot(this.slot) || []);
    const shown = new Set(this.filteredGear);
    return unfiltered.filter(item => !shown.has(item) && (!query || this.itemMatchesSearch(item, query))).length;
  }

  private itemMatchesSearch(item: Item, query: string) {
    return this.getSearchTerms(item).some(term => term.includes(query));
  }

  private getSearchTerms(item: Item) {
    return [(item.name || '').toLowerCase()];
  }

  private sortSearchResults(query: string) {
    return (a: Item, b: Item) => {
      const aIndex = this.getSortIndex(query, a);
      const bIndex = this.getSortIndex(query, b);

      if (aIndex !== bIndex) {
        return aIndex - bIndex;
      }

      return a.name.localeCompare(b.name);
    };
  }

  private getSortIndex(query: string, item: Item) {
    for (const term of this.getSearchTerms(item)) {
      const words = term.split(' ');
      const wordIndex = words.findIndex(word => word.startsWith(query));
      if (wordIndex >= 0) {
        return wordIndex;
      }
    }

    return 999;
  }

  close() {
    this.suggestionDrawer.close();
  }
}
