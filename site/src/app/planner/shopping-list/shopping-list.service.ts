import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, Observable } from 'rxjs';
import { map, shareReplay, startWith } from 'rxjs/operators';

import { CurrentBuildService } from '../../build/current-build.service';
import { QuestService } from '../../gear/quest.service';
import { EquippedService } from '../equipped.service';
import { getStoredShoppingListGroupMode, storeShoppingListGroupMode } from '../planner-view-state-storage';
import { UserGearService } from '../user-gear.service';
import { deriveShoppingEntries, ShoppingSourceLookup } from './shopping-list-entries';
import { formatShoppingListText } from './shopping-list-text';
import type {
  ShoppingEntry, ShoppingFilter, ShoppingGroupMode, ShoppingListView, ShoppingRow, ShoppingTroveLookup
} from './shopping-list-types';
import { buildShoppingListView, prunePatch, togglePatch } from './shopping-list-view-model';
import { SHOPPING_DRAFT_SCOPE, ShoppingProgressStore } from './shopping-progress-store';

/**
 * The shopping list for the build on screen: what it needs, what's been got,
 * and ticking things off.
 *
 * Ticks go to ShoppingProgressStore, never through the build's params, so
 * ticking leaves the build's URL and saved state alone.
 */
@Injectable({ providedIn: 'root' })
export class ShoppingListService {
  private readonly groupModeSubject = new BehaviorSubject<ShoppingGroupMode>(getStoredShoppingListGroupMode());
  private readonly filterSubject = new BehaviorSubject<ShoppingFilter>('all');
  private readonly trove: ShoppingTroveLookup;
  private readonly sources: ShoppingSourceLookup;

  readonly entries$: Observable<ShoppingEntry[]>;
  readonly view$: Observable<ShoppingListView>;

  constructor(
    private readonly equipped: EquippedService,
    private readonly userGear: UserGearService,
    private readonly progressStore: ShoppingProgressStore,
    private readonly currentBuild: CurrentBuildService,
    quests: QuestService
  ) {
    this.trove = { locationsFor: name => this.userGear.getItemLocations(name) };
    this.sources = { isRaid: quest => quests.isRaid(quest), packOf: quest => quests.getPack(quest) };

    this.entries$ = combineLatest(Array.from(this.equipped.getSlots().values())).pipe(
      map(() => this.currentEntries()),
      shareReplay({ bufferSize: 1, refCount: true })
    );
    this.view$ = combineLatest([
      this.entries$,
      this.progressStore.progress$,
      this.userGear.userItemsChanged$.pipe(startWith(undefined)),
      this.groupModeSubject,
      this.filterSubject,
    ]).pipe(
      map(([entries, progress, , groupMode, filter]) =>
        buildShoppingListView(entries, progress, this.trove, { groupMode, filter })),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  get groupMode(): ShoppingGroupMode {
    return this.groupModeSubject.value;
  }

  get filter(): ShoppingFilter {
    return this.filterSubject.value;
  }

  setGroupMode(mode: ShoppingGroupMode): void {
    storeShoppingListGroupMode(mode);
    this.groupModeSubject.next(mode);
  }

  setFilter(filter: ShoppingFilter): void {
    this.filterSubject.next(filter);
  }

  /**
   * Ticks a row off, or unticks it. Also drops ticks for things no longer in
   * the build - except while a saved build has unsaved changes, so trying
   * another item and going back doesn't lose the first one's tick.
   */
  toggle(row: ShoppingRow): void {
    const entries = this.currentEntries();
    const progress = this.progressStore.progress;
    const prune = this.progressStore.scope === SHOPPING_DRAFT_SCOPE || !this.currentBuild.value.isDirty
      ? prunePatch(progress, entries)
      : {};
    this.progressStore.applyPatch({ ...prune, ...togglePatch(row, entries, progress, this.trove) });
  }

  /** The still-needed list as text, grouped by quest whatever the list on screen shows. */
  stillNeededText(): string {
    const view = buildShoppingListView(this.currentEntries(), this.progressStore.progress, this.trove,
      { groupMode: 'source', filter: 'needed' });
    return formatShoppingListText(view, this.currentBuild.value.name);
  }

  private currentEntries(): ShoppingEntry[] {
    return deriveShoppingEntries(this.equipped.getSlotsSnapshot(), this.sources);
  }
}
