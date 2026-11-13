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
import { FiligreeDbService } from '../../gear/filigree-db.service';
import { shoppingFiligreeLookup } from './filigree-sources';
import { FiligreeLoadoutService } from '../filigree-loadout.service';
import { formatShoppingListText } from './shopping-list-text';
import type {
  ShoppingEntry, ShoppingFilter, ShoppingListView, ShoppingProgress, ShoppingRow, ShoppingSaveProgress, ShoppingTroveLookup
} from './shopping-list-types';
import {
  buildShoppingListView, prunePatch, publishedProgress, settledIdentities, stillNeededKeys, togglePatch
} from './shopping-list-view-model';
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
    filters: FiltersService,
    private readonly filigreeDb: FiligreeDbService,
    private readonly filigree: FiligreeLoadoutService
  ) {
    this.trove = { locationsFor: name => this.userGear.getItemLocations(name) };
    this.sources = { isRaid: quest => quests.isRaid(quest), packOf: quest => quests.getPack(quest) };

    this.entries$ = combineLatest([...this.equipped.getSlots().values(), this.filigree.getLoadoutObservable()]).pipe(
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
      this.progressStore.order$,
      this.replanSubject,
    ]).pipe(
      map(([entries, progress, , filter, hiddenPacks, picks, order]) => {
        const routeSettled = this.settledForRoute(entries, progress);
        const view = buildShoppingListView(entries, progress, this.trove,
          { filter, hiddenPacks, picks, packAccents: this.packAccents, routeSettled, order: order ?? undefined });
        this.packAccents = view.packAccents;
        // Only while the build is as saved, so a friend's link (which shows
        // the saved build) lists the same things. Saving sends the list for
        // the build as saved along with it - see progressForSave.
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

  /** Puts the route's packs in this order, by name ('' for quests in no pack). */
  arrangePacks(packs: readonly string[]): void {
    this.progressStore.setOrder({ packs: [...packs], quests: [...(this.progressStore.order?.quests ?? [])] });
  }

  /** Puts one pack's quests in this order. */
  arrangeQuests(quests: readonly string[]): void {
    const moved = new Set(quests);
    const others = (this.progressStore.order?.quests ?? []).filter(quest => !moved.has(quest));
    this.progressStore.setOrder({ packs: [...(this.progressStore.order?.packs ?? [])], quests: [...others, ...quests] });
  }

  /** Puts the route back in its default order. */
  resetOrder(): void {
    this.progressStore.setOrder(null);
  }

  /** The still-needed list as text, whatever the list on screen shows, routed and arranged as it is. */
  stillNeededText(): string {
    const entries = this.currentEntries();
    const progress = this.progressStore.progress;
    const view = buildShoppingListView(entries, progress, this.trove, {
      filter: 'needed', hiddenPacks: this.gearDb.getHiddenPacks(), picks: this.progressStore.picks,
      routeSettled: this.routeSettled ?? settledIdentities(entries, progress, this.trove), order: this.progressStore.order ?? undefined,
    });
    return formatShoppingListText(view, this.currentBuild.value.name);
  }

  /**
   * What to send with a save of the build on screen, so friends' pages get
   * the new gear and its list in one step; null when it has no friends'
   * link to follow it. Worked out whether or not the list is open.
   */
  progressForSave(): ShoppingSaveProgress | null {
    const entries = this.currentEntries();
    const progress = this.progressStore.progress;
    return this.progressStore.progressForSave(publishedProgress(entries, progress, this.trove, {
      hiddenPacks: this.gearDb.getHiddenPacks(), picks: this.progressStore.picks,
      routeSettled: this.routeSettled ?? settledIdentities(entries, progress, this.trove),
    }));
  }

  /** A save carrying progressForSave's answer finished; `stored` says whether the server kept the list too. */
  savedWithBuild(sent: ShoppingSaveProgress, stored: boolean): void {
    this.progressStore.savedWithBuild(sent, stored);
  }

  /** Keys of the entries still needed. */
  stillNeededKeys(): string[] {
    return stillNeededKeys(this.currentEntries(), this.progressStore.progress, this.trove);
  }

  /** The things got when the route was planned, planning it now if it isn't. */
  private settledForRoute(entries: readonly ShoppingEntry[], progress: ShoppingProgress): ReadonlySet<string> {
    this.routeSettled ??= settledIdentities(entries, progress, this.trove);
    return this.routeSettled;
  }

  private currentEntries(): ShoppingEntry[] {
    return deriveShoppingEntries(this.equipped.getSlotsSnapshot(), this.sources,
      shoppingFiligreeLookup(this.filigreeDb, this.filigree.getLoadout()));
  }
}
