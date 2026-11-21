import { Component, OnInit, ChangeDetectionStrategy, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TroveImportInfo, UserGearService } from '../planner/user-gear.service';

import { FiltersService } from '../planner/filters.service';
import { AnalyticsService } from '../shared/analytics.service';

import { Output, EventEmitter } from '@angular/core';
import { GameDataService } from '../gear/game-data.service';
import { getPackInfo, getPackKeys, NO_PACK_KEY, PACK_COUPONS, PSEUDO_PACKS } from '../gear/pack-filter';
import { ITEM_BONUS_KINDS, ItemBonusKind } from '../gear/item-bonus';
import { ItemBonusSettingsService } from '../planner/item-bonus-settings.service';

export interface PackOption {
  name: string;
  value: boolean;
  /** Release year, shown beside the name. Empty for free quests and the pseudo-packs. */
  year: string;
  /** ISO release date, for sorting. */
  released: string;
  expansion: boolean;
}

/** A titled run of pack checkboxes with a tick-all box of its own. */
export interface PackGroup {
  id: string;
  title: string;
  options: PackOption[];
}

/** A coupon as a shortcut: ticking it ticks every pack it granted. */
export interface CouponOption {
  /** The year it ran. */
  year: string;
  code: string;
  available: string;
  options: PackOption[];
}

export type PackSort = 'release' | 'name';

/** 'all' shows gear from every pack; 'owned' opens the checklist to pick the packs you have. */
export type PackMode = 'all' | 'owned';

/** Tick state of a set of pack options, for a tri-state checkbox. */
function allChecked(options: ReadonlyArray<PackOption>): boolean {
  return options.length > 0 && options.every(option => option.value);
}

function someChecked(options: ReadonlyArray<PackOption>): boolean {
  return options.some(option => option.value);
}

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
  readonly freeQuestsPackLabel = 'Free Quests';
  minLevel: number = 1;
  maxLevel: number = 30;
  showRaidItems: boolean = false;
  showRareItems: boolean = true;
  packOptions: PackOption[] = [];
  /** packOptions as the panel lays them out: always-available content, expansions, adventure packs. */
  packGroups: PackGroup[] = [];
  /** The yearly coupons, which grant adventure packs, newest first. */
  questingCoupons: CouponOption[] = [];
  /** Coupons that grant expansions. */
  expansionCoupons: CouponOption[] = [];
  packSort: PackSort = 'release';
  packMode: PackMode = 'all';
  /** The packs ticked when 'owned' was last left for 'all', so going back doesn't lose them. */
  private ownedPacks: Set<string> | null = null;
  private pickedCoupon: CouponOption | null = null;

  sortOwnedToTop: boolean = true;

  @Output() troveFileSelected = new EventEmitter<File>();
  @Output() sortOwnedToTopChanged = new EventEmitter<boolean>();
  readonly bonusSystems: BonusSystemOption[] = ITEM_BONUS_KINDS.map(kind => ({ kind, name: BONUS_SYSTEM_NAMES[kind] }));
  troveUploadStatus: string = '';
  userGearCount: number = 0;
  importInfo: TroveImportInfo | null = null;
  /** A file is being dragged over the Owned Gear drop area. */
  troveDragging = false;
  /** Narrows the pack checklist to names containing it. */
  packQuery = '';
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
    this.packOptions = this.getAllPackOptions();
    this.packGroups = this.getPackGroups();
    const coupons = this.getCouponOptions();
    this.expansionCoupons = coupons.filter(coupon => coupon.options.some(option => option.expansion));
    this.questingCoupons = coupons.filter(coupon => !this.expansionCoupons.includes(coupon)).reverse();
    filters.getEditedFilters().pipe(takeUntilDestroyed()).subscribe(itemFilters => {
      this.minLevel = itemFilters.levelRange[0];
      this.maxLevel = itemFilters.levelRange[1];
      this.showRaidItems = itemFilters.showRaidItems;
      this.showRareItems = itemFilters.showRareItems;
      this.packOptions.forEach(option => option.value = !itemFilters.hiddenPacks.has(this.packFilterValue(option.name)));
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

  /** A group's packs that match what's typed in Find a pack: all of them while it's empty. */
  visiblePacks(group: PackGroup): PackOption[] {
    const query = this.packQuery.trim().toLowerCase();
    return query ? group.options.filter(pack => pack.name.toLowerCase().includes(query)) : group.options;
  }

  anyPackMatches(): boolean {
    return this.packGroups.some(group => this.visiblePacks(group).length > 0);
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

  onChangePacks(items: ReadonlyArray<{name: string, value: boolean}>, changeSource: string): void {
    const hiddenPacks = new Set<string>();
    items.filter(item => !item.value)
      .forEach(item => hiddenPacks.add(this.packFilterValue(item.name)));

    this.filters.setHiddenPacks(hiddenPacks);
    this.analytics.track('change_pack_filters', {
      interaction_level: changeSource,
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
      this.ownedPacks = new Set(this.packOptions.filter(option => option.value).map(option => option.name));
      this.packOptions.forEach(option => option.value = true);
    } else {
      const owned = this.ownedPacks;
      if (owned) {
        this.packOptions.forEach(option => option.value = owned.has(option.name));
      } else {
        this.packOptions.forEach(option => option.value = !option.year);
        [...this.questingCoupons.slice(0, 1), ...this.expansionCoupons]
          .forEach(coupon => coupon.options.forEach(option => option.value = true));
        this.pickedCoupon = this.questingCoupons[0] ?? null;
      }
    }
    this.onChangePacks(this.packOptions, mode === 'all' ? 'mode_all' : 'mode_owned');
    this.packMode = mode;
  }

  onChangePackOption() {
    this.onChangePacks(this.packOptions, 'subgroup');
  }

  areAllChecked(options: ReadonlyArray<PackOption>): boolean {
    return allChecked(options);
  }

  areSomeChecked(options: ReadonlyArray<PackOption>): boolean {
    return someChecked(options);
  }

  /** A group's or coupon's own checkbox: ticks all of its packs, or unticks them when all are ticked. */
  togglePacks(options: ReadonlyArray<PackOption>, changeSource: string): void {
    const checked = !allChecked(options);
    options.forEach(option => option.value = checked);
    this.onChangePacks(this.packOptions, changeSource);
  }

  /**
   * The yearly coupon the dropdown shows: the one last picked while its packs are all
   * still ticked, else the fully ticked coupon that granted the most (the newer of two
   * that granted the same). Derived from the ticks, so a reloaded build shows it too.
   */
  get selectedQuestingCoupon(): CouponOption | null {
    if (this.pickedCoupon && allChecked(this.pickedCoupon.options)) {
      return this.pickedCoupon;
    }
    let best: CouponOption | null = null;
    for (const coupon of this.questingCoupons) {
      if (allChecked(coupon.options) && (!best || coupon.options.length > best.options.length)) {
        best = coupon;
      }
    }
    return best;
  }

  get selectedQuestingCouponIndex(): number {
    const selected = this.selectedQuestingCoupon;
    return selected ? this.questingCoupons.indexOf(selected) : -1;
  }

  /**
   * Swaps one yearly coupon for another: ticks the new one's packs and unticks those only
   * the old one granted (the coupons aren't strict supersets). Other ticks are left alone.
   */
  onSelectQuestingCoupon(index: string): void {
    const previous = this.selectedQuestingCoupon;
    const next = this.questingCoupons[Number(index)] ?? null;

    previous?.options.forEach(option => option.value = false);
    next?.options.forEach(option => option.value = true);
    this.pickedCoupon = next;
    this.onChangePacks(this.packOptions, 'coupon');
  }

  couponTitle(coupon: CouponOption): string {
    const packs = coupon.options.length === 1 ? '1 pack' : `${coupon.options.length} packs`;
    return `${packs}. Redeemable ${coupon.available}.`;
  }

  setPackSort(sort: PackSort): void {
    this.packSort = sort;
    this.packGroups = this.getPackGroups();
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

  /**
   * Every pack an item or augment drops in: Free Quests, then the DDO Store and Events
   * groups, then the real packs alphabetically. Augments with no source follow their host
   * item, so only those with sources add packs.
   */
  private getAllPackOptions(): PackOption[] {
    const keys = new Set<string>();

    for (const item of this.gameData.items) {
      getPackKeys(item.quests ?? []).forEach(key => keys.add(key));
    }
    for (const system of Object.values(this.gameData.crafting)) {
      for (const options of Object.values(system)) {
        for (const option of options) {
          if (option.quests?.length) {
            getPackKeys(option.quests).forEach(key => keys.add(key));
          }
        }
      }
    }

    const first = [NO_PACK_KEY, ...PSEUDO_PACKS].filter(key => keys.has(key));
    const packs = Array.from(keys)
      .filter(key => !first.includes(key))
      .sort((left, right) => left.localeCompare(right));

    return [...first, ...packs].map(key => {
      const info = getPackInfo(key);
      return {
        name: key === NO_PACK_KEY ? this.freeQuestsPackLabel : key,
        value: true,
        year: info?.released.slice(0, 4) ?? '',
        released: info?.released ?? '',
        expansion: info?.expansion ?? false,
      };
    });
  }

  /**
   * Free quests and the pseudo-packs, then expansions, then adventure packs - the last two
   * oldest first by default, which is how players remember them and keeps what a coupon
   * granted together. A pack the wiki's tables don't date is listed with the adventure
   * packs, last.
   */
  private getPackGroups(): PackGroup[] {
    const byName = (left: PackOption, right: PackOption) => left.name.localeCompare(right.name);
    const byRelease = (left: PackOption, right: PackOption) =>
      (left.released || '9999').localeCompare(right.released || '9999') || byName(left, right);
    const order = this.packSort === 'release' ? byRelease : byName;

    const always = new Set<string>([this.freeQuestsPackLabel, ...PSEUDO_PACKS]);
    const groups: PackGroup[] = [
      { id: 'always', title: 'Free and other', options: this.packOptions.filter(option => always.has(option.name)) },
      { id: 'expansions', title: 'Expansions', options: this.packOptions.filter(option => option.expansion).sort(order) },
      {
        id: 'adventure-packs',
        title: 'Adventure packs',
        options: this.packOptions.filter(option => !option.expansion && !always.has(option.name)).sort(order),
      },
    ];
    return groups.filter(group => group.options.length > 0);
  }

  /** The coupons that granted at least one pack the filter lists, oldest first. */
  private getCouponOptions(): CouponOption[] {
    const byName = new Map(this.packOptions.map(option => [option.name, option]));
    return PACK_COUPONS
      .map(coupon => ({
        // The wiki labels a yearly coupon by its year and anything else by a nickname
        // ("BIG26"); the dates it ran end with the year either way.
        year: /^\d{4}$/.test(coupon.label) ? coupon.label : (/\d{4}$/.exec(coupon.available)?.[0] ?? coupon.label),
        code: coupon.code,
        available: coupon.available,
        options: coupon.packs.map(pack => byName.get(pack)).filter((option): option is PackOption => !!option),
      }))
      .filter(coupon => coupon.options.length > 0);
  }

  private packFilterValue(packName: string): string {
    return packName === this.freeQuestsPackLabel ? NO_PACK_KEY : packName;
  }
}
