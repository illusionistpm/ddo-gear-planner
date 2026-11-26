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
import { FilterSheetService } from '../planner/filter-sheet.service';
import { SuggestionScorer, withSuggestedCrafting } from '../planner/suggestion-scorer';

/** How many items the list shows at first, and adds with each "Show more". */
const PAGE_SIZE = 20;

/** How many minor artifacts the drawer suggests at first, apart from the rest. */
const ARTIFACT_SUGGESTIONS = 3;

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
  /** How many items matching the search the filters are holding back. */
  hiddenByFilters = 0;
  /** Whether those are listed, below the suggestions: they wait behind a button. */
  showingHidden = false;
  /** The hidden items listed so far, paged like `gear`. */
  hiddenGear: Array<Item> = [];
  hiddenRemaining = 0;
  private hiddenMatches: Array<Item> = [];
  private hiddenSorted = false;
  private hiddenVisibleCount = PAGE_SIZE;
  /** The minor artifacts shown, apart from the rest: a build wears one, in whichever slot suits it. */
  artifacts: Array<Item> = [];
  private rankedArtifacts: Array<Item> = [];
  private scorer: SuggestionScorer | null = null;
  /** Each shown item with its suggested crafting selected, made once per item. */
  private previews = new Map<Item, Item>();
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
    private filterSheet: FilterSheetService,
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

  get nextHiddenPageSize(): number {
    return Math.min(PAGE_SIZE, this.hiddenRemaining);
  }

  isCurrent(item: Item): boolean {
    return !!this.currentItem && item.name === this.currentItem.name;
  }

  openFilters() {
    this.filterSheet.open();
  }

  /** How many more artifacts "Show more" would add. */
  get hiddenArtifactCount(): number {
    return this.rankedArtifacts.length - this.artifacts.length;
  }

  showAllArtifacts() {
    this.artifacts = this.rankedArtifacts.map(item => this.preview(item));
  }

  showMore() {
    this.visibleCount += PAGE_SIZE;
    this.showMatches();
  }

  showHidden() {
    this.showingHidden = true;
    this.showHiddenMatches();
  }

  showMoreHidden() {
    this.hiddenVisibleCount += PAGE_SIZE;
    this.showHiddenMatches();
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

    const score = this.equipped.getSuggestionScorer(this.slot);
    this.scorer = score;
    const scores = perfMeasure('ItemSuggestionsComponent.scoreItems', () => {
      const scoreMap = new Map<Item, number>();
      for (const item of shortlist) {
        scoreMap.set(item, score(item));
      }
      return scoreMap;
    });

    perfMeasure('ItemSuggestionsComponent.sortItems', () => {
      shortlist.sort((a, b) => (scores.get(b) || 0) - (scores.get(a) || 0));
    });

    this.rankedArtifacts = shortlist.filter(item => item.artifact);
    this.artifacts = this.rankedArtifacts.slice(0, ARTIFACT_SUGGESTIONS).map(item => this.preview(item));
    this.suggestedGear = shortlist.filter(item => !item.artifact);
    this.updateDisplayedGear();

    this.essenceCrafting = this.filteredGear.filter(item => item.isGeneratedEssenceCraftingBlank());
    done({
      slot: this.slot,
      filtered: this.filteredGear.length,
      suggested: this.gear.length,
      artifacts: this.artifacts.length,
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
        this.gear = [this.preview(newVal)];
      } else {
        const found = this.filteredGear.find(item => item.name === newVal);
        if (found) {
          this.gear = [this.preview(found)];
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
    this.hiddenMatches = this.findHiddenByFilters(query);
    this.hiddenSorted = false;
    this.hiddenByFilters = this.hiddenMatches.length;
    this.hiddenVisibleCount = PAGE_SIZE;
    this.showMatches();
    if (this.showingHidden) {
      this.showHiddenMatches();
    }
  }

  private showHiddenMatches() {
    // Sorted only once shown: scoring is the costly part, and most drawers never show them.
    if (!this.hiddenSorted) {
      const query = this.searchQuery.trim().toLowerCase();
      if (query) {
        this.hiddenMatches.sort(this.sortSearchResults(query));
      } else {
        const scorer = this.scorer ?? this.equipped.getSuggestionScorer(this.slot);
        const scores = new Map(this.hiddenMatches.map(item => [item, scorer(item)]));
        this.hiddenMatches.sort((a, b) => (scores.get(b) || 0) - (scores.get(a) || 0));
      }
      this.hiddenSorted = true;
    }
    this.hiddenGear = this.hiddenMatches.slice(0, this.hiddenVisibleCount).map(item => this.preview(item));
    this.hiddenRemaining = this.hiddenMatches.length - this.hiddenGear.length;
  }

  private showMatches() {
    this.gear = this.matches.slice(0, this.visibleCount).map(item => this.preview(item));
    this.remaining = this.matches.length - this.gear.length;
  }

  /**
   * A copy of the item with the crafting the scorer would give it already selected, so the drawer
   * shows (and equips) what it's scored for rather than empty slots. The player can change those
   * choices in the drawer before equipping; they edit this copy, never the gear database's item.
   * Worked out only for items shown.
   */
  private preview(item: Item): Item {
    let shown = this.previews.get(item);
    if (!shown) {
      shown = withSuggestedCrafting(item, this.scorer ? this.scorer.suggestedCrafting(item) : []);
      this.previews.set(item, shown);
    }
    return shown;
  }

  /** Items matching the search that would be listed with every filter off, unsorted. */
  private findHiddenByFilters(query: string) {
    if (this.gearDB.itemFiltersHideNothing()) {
      return [];
    }
    const unfiltered = this.equipped.getCompatibleGearForSlot(this.slot, this.gearDB.getGearBySlot(this.slot) || []);
    const shown = new Set(this.filteredGear);
    return unfiltered.filter(item => !shown.has(item) && (!query || this.itemMatchesSearch(item, query)));
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
