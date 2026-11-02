import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, Observable } from 'rxjs';
import { distinctUntilChanged, finalize, map, shareReplay, startWith } from 'rxjs/operators';

import { CurrentBuildService } from '../../build/current-build.service';
import { GearDbService } from '../../gear/gear-db.service';
import { QuestService } from '../../gear/quest.service';
import { EquippedService } from '../equipped.service';
import { FiltersService } from '../filters.service';
import { UserGearService } from '../user-gear.service';
import { deriveShoppingEntries, ShoppingSourceLookup } from './shopping-list-entries';
import { formatShoppingListText } from './shopping-list-text';
import type {
  ShoppingEntry, ShoppingFilter, ShoppingListView, ShoppingProgress, ShoppingRow, ShoppingTroveLookup
} from './shopping-list-types';
import { buildShoppingListView, prunePatch, publishedProgress, settledIdentities, togglePatch } from './shopping-list-view-model';
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
  /** Each pack's colour so far this session, so listing a new pack doesn't recolour the rest. */
  private packAccents: ReadonlyMap<string, number> = new Map();
  /**
   * The things got when the route was planned: when the list opened, or at
   * the last Reset route. Null until it's planned.
   */
  private routeSettled: ReadonlySet<string> | null = null;
  private readonly replanSubject = new BehaviorSubject<void>(undefined);

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
      this.replanSubject,
    ]).pipe(
      map(([entries, progress, , filter, hiddenPacks, picks]) => {
        const routeSettled = this.settledForRoute(entries, progress);
        const view = buildShoppingListView(entries, progress, this.trove,
          { filter, hiddenPacks, picks, packAccents: this.packAccents, routeSettled });
        this.packAccents = view.packAccents;
        // Only while the build is as saved, so a friend's link (which loads
        // the saved build) lists the same things. So friends see changes
        // the next time the list is worked out, not in the background.
        if (!this.currentBuild.value.isDirty) {
          this.progressStore.publish(publishedProgress(entries, progress, this.trove, { hiddenPacks, picks, routeSettled }));
        }
        return view;
      }),
      // Closing the list forgets the route, so it's planned afresh next time it opens.
      finalize(() => this.routeSettled = null),
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

  /** Forgets every quest the user picked, and plans the route again around what's still needed now. */
  resetRoute(): void {
    this.routeSettled = null;
    this.progressStore.clearPicks();
    this.replanSubject.next();
  }

  /** The still-needed list as text, whatever the list on screen shows, routed as it is. */
  stillNeededText(): string {
    const entries = this.currentEntries();
    const progress = this.progressStore.progress;
    const view = buildShoppingListView(entries, progress, this.trove, {
      filter: 'needed', hiddenPacks: this.gearDb.getHiddenPacks(), picks: this.progressStore.picks,
      routeSettled: this.routeSettled ?? settledIdentities(entries, progress, this.trove),
    });
    return formatShoppingListText(view, this.currentBuild.value.name);
  }

  /** The things got when the route was planned, planning it now if it isn't. */
  private settledForRoute(entries: readonly ShoppingEntry[], progress: ShoppingProgress): ReadonlySet<string> {
    this.routeSettled ??= settledIdentities(entries, progress, this.trove);
    return this.routeSettled;
  }

  private currentEntries(): ShoppingEntry[] {
    return deriveShoppingEntries(this.equipped.getSlotsSnapshot(), this.sources);
  }
}
