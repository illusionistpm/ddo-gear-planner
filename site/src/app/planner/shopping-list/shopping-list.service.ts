import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, Observable } from 'rxjs';
import { distinctUntilChanged, map, shareReplay, startWith } from 'rxjs/operators';

import { CurrentBuildService } from '../../build/current-build.service';
import { GearDbService } from '../../gear/gear-db.service';
import { QuestService } from '../../gear/quest.service';
import { EquippedService } from '../equipped.service';
import { FiltersService } from '../filters.service';
import { UserGearService } from '../user-gear.service';
import { deriveShoppingEntries, ShoppingSourceLookup } from './shopping-list-entries';
import { formatShoppingListText } from './shopping-list-text';
import type { ShoppingEntry, ShoppingFilter, ShoppingListView, ShoppingRow, ShoppingTroveLookup } from './shopping-list-types';
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
    private readonly gearDb: GearDbService,
    quests: QuestService,
    filters: FiltersService
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
      this.filterSubject,
      filters.getItemFilters().pipe(map(itemFilters => itemFilters.hiddenPacks), distinctUntilChanged()),
      this.progressStore.picks$,
    ]).pipe(
      map(([entries, progress, , filter, hiddenPacks, picks]) =>
        buildShoppingListView(entries, progress, this.trove, { filter, hiddenPacks, picks })),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  get filter(): ShoppingFilter {
    return this.filterSubject.value;
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

  /** Lists a row's thing under these of its quests, or (null) lets the list choose again. */
  pickSources(row: ShoppingRow, quests: readonly string[] | null): void {
    this.progressStore.setPick(row.entry.identity, quests);
  }

  /** The still-needed list as text, whatever the list on screen shows. */
  stillNeededText(): string {
    const view = buildShoppingListView(this.currentEntries(), this.progressStore.progress, this.trove,
      { filter: 'needed', hiddenPacks: this.gearDb.getHiddenPacks(), picks: this.progressStore.picks });
    return formatShoppingListText(view, this.currentBuild.value.name);
  }

  private currentEntries(): ShoppingEntry[] {
    return deriveShoppingEntries(this.equipped.getSlotsSnapshot(), this.sources);
  }
}
