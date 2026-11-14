import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { UserGearService } from '../planner/user-gear.service';

import { FiltersService } from '../planner/filters.service';
import { AnalyticsService } from '../shared/analytics.service';

import { Output, EventEmitter } from '@angular/core';
import { GameDataService } from '../gear/game-data.service';
import { getPackInfo, getPackKeys, NO_PACK_KEY, PACK_COUPONS, PSEUDO_PACKS } from '../gear/pack-filter';

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

/** Tick state of a set of pack options, for a tri-state checkbox. */
function allChecked(options: ReadonlyArray<PackOption>): boolean {
  return options.length > 0 && options.every(option => option.value);
}

function someChecked(options: ReadonlyArray<PackOption>): boolean {
  return options.some(option => option.value);
}

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
  showPackFilters: boolean = false;
  packOptions: PackOption[] = [];
  /** packOptions as the panel lays them out: always-available content, expansions, adventure packs. */
  packGroups: PackGroup[] = [];
  /** The yearly coupons, which grant adventure packs. */
  questingCoupons: CouponOption[] = [];
  /** Coupons that grant expansions. */
  expansionCoupons: CouponOption[] = [];
  packSort: PackSort = 'release';

  sortOwnedToTop: boolean = true;

  @Output() troveFileSelected = new EventEmitter<File>();
  @Output() sortOwnedToTopChanged = new EventEmitter<boolean>();
  troveUploadStatus: string = '';
  userGearCount: number = 0;

  constructor(
    public filters: FiltersService,
    private userGear: UserGearService,
    private analytics: AnalyticsService,
    private gameData: GameDataService
  ) {
    this.packOptions = this.getAllPackOptions();
    this.packGroups = this.getPackGroups();
    const coupons = this.getCouponOptions();
    this.expansionCoupons = coupons.filter(coupon => coupon.options.some(option => option.expansion));
    this.questingCoupons = coupons.filter(coupon => !this.expansionCoupons.includes(coupon));
    filters.getItemFilters().subscribe(itemFilters => {
      this.minLevel = itemFilters.levelRange[0];
      this.maxLevel = itemFilters.levelRange[1];
      this.showRaidItems = itemFilters.showRaidItems;
      this.showRareItems = itemFilters.showRareItems;
      this.packOptions.forEach(option => option.value = !itemFilters.hiddenPacks.has(this.packFilterValue(option.name)));
    });
    this.updateUserGearCount();
  }
  ngOnInit() {
    this.updateUserGearCount();
  }
  updateUserGearCount() {
    try {
      const data = localStorage.getItem('ddo-user-gear');
      if (data) {
        const arr = JSON.parse(data);
        this.userGearCount = Array.isArray(arr) ? arr.length : 0;
      } else {
        this.userGearCount = 0;
      }
    } catch {
      this.userGearCount = 0;
    }
  }

  onClearUserGear() {
    this.userGear.clear();
    this.updateUserGearCount();
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

  togglePackFilters() {
    this.showPackFilters = !this.showPackFilters;
  }

  areAllPacksChecked() {
    return this.packOptions.every(option => option.value);
  }

  areSomePacksChecked() {
    return this.packOptions.some(option => option.value);
  }

  toggleAllPacks() {
    const checked = !this.areAllPacksChecked();
    this.packOptions.forEach(option => option.value = checked);
    this.onChangePacks(this.packOptions, 'top_level');
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
    if (!input.files || input.files.length === 0) {
      this.troveUploadStatus = 'No file selected.';
      return;
    }
    const file = input.files[0];
    if (!file.name.endsWith('.csv')) {
      this.troveUploadStatus = 'Please upload a .csv file.';
      return;
    }
    this.troveUploadStatus = 'File loaded. Processing...';
    this.troveFileSelected.emit(file);
    // Update the userGearCount after the parent processes the file (with a small delay to ensure storage is updated)
    setTimeout(() => this.updateUserGearCount(), 100);
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
