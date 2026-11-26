import { Component, OnInit, ChangeDetectionStrategy, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TroveImportInfo, UserGearService } from '../planner/user-gear.service';

import { FiltersService } from '../planner/filters.service';
import { AnalyticsService } from '../shared/analytics.service';

import { Output, EventEmitter } from '@angular/core';
import { GameDataService } from '../gear/game-data.service';
import { CouponOption, FREE_QUESTS_PACK_LABEL, PackChecklistModel, PackGroup, PackOption } from './pack-checklist-model';
import { ITEM_BONUS_KINDS, ItemBonusKind } from '../gear/item-bonus';
import { ItemBonusSettingsService } from '../planner/item-bonus-settings.service';

/** 'all' shows gear from every pack; 'owned' opens the checklist to pick the packs you have. */
export type PackMode = 'all' | 'owned';

/** A Mythic / Reaper / Curse system as the Advanced bonuses panel lists it. */
interface BonusSystemOption {
  kind: ItemBonusKind;
  name: string;
}

/** The sheet's sections, which fold away on a phone. */
export type FilterPanelKey = 'content' | 'types' | 'owned' | 'bonuses';

/** Below this the sheet is one column: its sections fold, and only Content starts open. */
const NARROW_QUERY = '(max-width: 767.98px)';

/** "today", "yesterday", "3 days ago", or the date. */
export function loadedAgo(iso: string, now = new Date()): string {
  const loaded = new Date(iso);
  if (isNaN(loaded.getTime())) {
    return 'earlier';
  }
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(loaded)) / 86_400_000);
  if (days <= 0) {
    return 'today';
  }
  if (days === 1) {
    return 'yesterday';
  }
  if (days < 30) {
    return `${days} days ago`;
  }
  return loaded.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const BONUS_SYSTEM_NAMES: Record<ItemBonusKind, string> = {
  mythic: 'Mythic Boosts',
  reaper: 'Reaper Bonuses',
  curse: 'Curses',
};

@Component({
    selector: 'app-filters',
    templateUrl: './filters.component.html',
    styleUrls: ['./filters.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class FiltersComponent implements OnInit {
  readonly freeQuestsPackLabel = FREE_QUESTS_PACK_LABEL;
  minLevel: number = 1;
  maxLevel: number = 30;
  showRaidItems: boolean = false;
  showRareItems: boolean = true;
  /** The "packs I own" checklist's state (PackChecklistComponent shows it). */
  readonly packs: PackChecklistModel;
  packMode: PackMode = 'all';
  /** The packs ticked when 'owned' was last left for 'all', so going back doesn't lose them. */
  private ownedPacks: Set<string> | null = null;

  sortOwnedToTop: boolean = true;

  @Output() troveFileSelected = new EventEmitter<File>();
  @Output() sortOwnedToTopChanged = new EventEmitter<boolean>();
  readonly bonusSystems: BonusSystemOption[] = ITEM_BONUS_KINDS.map(kind => ({ kind, name: BONUS_SYSTEM_NAMES[kind] }));
  troveUploadStatus: string = '';
  userGearCount: number = 0;
  importInfo: TroveImportInfo | null = null;
  /** A file is being dragged over the Owned Gear drop area. */
  troveDragging = false;
  readonly loadedAgo = loadedAgo;

  /** One column, on a phone: the sections fold, and only Content starts open. */
  narrow = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(NARROW_QUERY).matches;
  private openPanels = new Set<FilterPanelKey>(['content']);
  private readonly destroyRef = inject(DestroyRef);

  constructor(
    public filters: FiltersService,
    private userGear: UserGearService,
    private analytics: AnalyticsService,
    private gameData: GameDataService,
    public itemBonusSettings: ItemBonusSettingsService
  ) {
    this.packs = new PackChecklistModel(this.gameData);
    filters.getEditedFilters().pipe(takeUntilDestroyed()).subscribe(itemFilters => {
      this.minLevel = itemFilters.levelRange[0];
      this.maxLevel = itemFilters.levelRange[1];
      this.showRaidItems = itemFilters.showRaidItems;
      this.showRareItems = itemFilters.showRareItems;
      this.packs.syncFromHidden(itemFilters.hiddenPacks);
      // A build that hides packs opens on the checklist. With nothing hidden the mode is
      // the user's: they may be in 'owned' with every pack ticked.
      if (this.packOptions.some(option => !option.value)) {
        this.packMode = 'owned';
      }
    });
    this.updateUserGearCount();
  }
  ngOnInit() {
    this.updateUserGearCount();
    // A load (here or by dropping a file) or a Clear: the panel's count follows.
    this.userGear.userItemsChanged$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.updateUserGearCount());
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const query = window.matchMedia(NARROW_QUERY);
      const onChange = (event: MediaQueryListEvent) => this.narrow = event.matches;
      query.addEventListener?.('change', onChange);
      this.destroyRef.onDestroy(() => query.removeEventListener?.('change', onChange));
    }
  }

  updateUserGearCount() {
    this.userGearCount = this.userGear.size;
    this.importInfo = this.userGear.getImportInfo();
  }

  /** Whether a section shows: always, unless the sheet is narrow and it is folded. */
  isPanelOpen(key: FilterPanelKey): boolean {
    return !this.narrow || this.openPanels.has(key);
  }

  togglePanel(key: FilterPanelKey): void {
    if (this.openPanels.has(key)) {
      this.openPanels.delete(key);
    } else {
      this.openPanels.add(key);
    }
  }

  // The checklist's state, by the names the sheet has always used.
  get packOptions(): PackOption[] {
    return this.packs.options;
  }

  get packGroups(): PackGroup[] {
    return this.packs.groups;
  }

  get questingCoupons(): CouponOption[] {
    return this.packs.questingCoupons;
  }

  get packQuery(): string {
    return this.packs.query;
  }

  set packQuery(query: string) {
    this.packs.query = query;
  }

  onTroveDragOver(event: DragEvent) {
    // Without this the browser opens the dropped file itself.
    event.preventDefault();
    this.troveDragging = true;
  }

  onTroveDrop(event: DragEvent) {
    event.preventDefault();
    this.troveDragging = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      this.loadTroveFile(file);
    }
  }

  onClearUserGear() {
    this.userGear.clear();
    this.troveUploadStatus = '';
    this.updateUserGearCount();
  }


  onToggleBonusSystem(kind: ItemBonusKind, enabled: boolean) {
    this.itemBonusSettings.setEnabled(kind, enabled);
    this.analytics.track('toggle_item_bonus_system', { kind, enabled });
  }

  onChangeLevelRange() {
    this.filters.setLevelRange(this.minLevel, this.maxLevel);
    this.analytics.track('change_level_range', {
      min_level: this.minLevel,
      max_level: this.maxLevel,
      level_span: this.maxLevel - this.minLevel + 1
    });
  }
  
  onChangeShowRaidItems() {
    this.filters.setShowRaidItems(this.showRaidItems);
    this.analytics.track('toggle_raid_items', {
      enabled: this.showRaidItems
    });
  }

  onChangeShowRareItems() {
    this.filters.setShowRareItems(this.showRareItems);
    this.analytics.track('toggle_rare_items', {
      enabled: this.showRareItems
    });
  }

  /**
   * Stores the checklist's ticks as the hidden packs. Takes the options for the specs'
   * sake, which tick them by hand: they are always the checklist's own.
   */
  onChangePacks(itemsOrSource: ReadonlyArray<PackOption> | string, changeSource?: string): void {
    const source = typeof itemsOrSource === 'string' ? itemsOrSource : changeSource!;
    const hiddenPacks = this.packs.hiddenPacks();

    this.filters.setHiddenPacks(hiddenPacks);
    this.analytics.track('change_pack_filters', {
      interaction_level: source,
      hidden_pack_count: hiddenPacks.size
    });
  }

  /**
   * 'all' ticks every pack. 'owned' starts from the packs ticked the last time it was
   * open. The first time, it starts from what everyone could have for free: the free
   * content, the newest yearly coupon and the expansions coupons.
   */
  setPackMode(mode: PackMode): void {
    if (mode === this.packMode) {
      return;
    }

    if (mode === 'all') {
      this.ownedPacks = new Set(this.packs.options.filter(option => option.value).map(option => option.name));
      this.packs.tickAll();
    } else {
      const owned = this.ownedPacks;
      if (owned) {
        this.packs.options.forEach(option => option.value = owned.has(option.name));
      } else {
        this.packs.tickFreeStart();
      }
    }
    this.onChangePacks(mode === 'all' ? 'mode_all' : 'mode_owned');
    this.packMode = mode;
  }

  onTroveFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.loadTroveFile(file);
    }
    // The same file again should load again, so the input forgets it.
    input.value = '';
  }

  /** Hands the file on to be read (MainComponent parses it), or says why not. */
  private loadTroveFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      this.troveUploadStatus = `${file.name} isn't a .csv file: load the TroveExport.csv the Trove plugin wrote.`;
      return;
    }
    this.troveUploadStatus = '';
    this.troveFileSelected.emit(file);
  }

  onSortOwnedToTopChanged() {
    this.sortOwnedToTopChanged.emit(this.sortOwnedToTop);
  }
}
