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

export const FREE_QUESTS_PACK_LABEL = 'Free Quests';

/** Tick state of a set of pack options, for a tri-state checkbox. */
export function allChecked(options: ReadonlyArray<PackOption>): boolean {
  return options.length > 0 && options.every(option => option.value);
}

export function someChecked(options: ReadonlyArray<PackOption>): boolean {
  return options.some(option => option.value);
}

/**
 * The "packs I own" checklist's state: every pack with a tick, its groups, the
 * coupons that tick several at once, the search and the sort. Ticked means
 * shown; hiddenPacks() is what the item filter stores. The filter sheet and the
 * start page's setup each keep one, and PackChecklistComponent shows it.
 */
export class PackChecklistModel {
  readonly options: PackOption[];
  /** The options as the checklist lays them out: always-available content, expansions, adventure packs. */
  groups: PackGroup[];
  /** The yearly coupons, which grant adventure packs, newest first. */
  readonly questingCoupons: CouponOption[];
  /** Coupons that grant expansions. */
  readonly expansionCoupons: CouponOption[];
  sort: PackSort = 'release';
  /** Narrows the checklist to names containing it. */
  query = '';
  private pickedCoupon: CouponOption | null = null;

  constructor(gameData: Pick<GameDataService, 'items' | 'crafting'>) {
    this.options = allPackOptions(gameData);
    this.groups = this.makeGroups();
    const coupons = this.makeCouponOptions();
    this.expansionCoupons = coupons.filter(coupon => coupon.options.some(option => option.expansion));
    this.questingCoupons = coupons.filter(coupon => !this.expansionCoupons.includes(coupon)).reverse();
  }

  /** Ticks every pack but those hidden. */
  syncFromHidden(hidden: ReadonlySet<string>): void {
    this.options.forEach(option => option.value = !hidden.has(packFilterValue(option.name)));
  }

  /** The unticked packs, as the item filter stores them. */
  hiddenPacks(): Set<string> {
    return new Set(this.options.filter(option => !option.value).map(option => packFilterValue(option.name)));
  }

  tickAll(): void {
    this.options.forEach(option => option.value = true);
  }

  /** What everyone could have for free: the free content, the newest yearly coupon and the expansions coupons. */
  tickFreeStart(): void {
    this.options.forEach(option => option.value = !option.year);
    [...this.questingCoupons.slice(0, 1), ...this.expansionCoupons]
      .forEach(coupon => coupon.options.forEach(option => option.value = true));
    this.pickedCoupon = this.questingCoupons[0] ?? null;
  }

  setSort(sort: PackSort): void {
    this.sort = sort;
    this.groups = this.makeGroups();
  }

  /** A group's packs that match what's typed in Find a pack: all of them while it's empty. */
  visiblePacks(group: PackGroup): PackOption[] {
    const query = this.query.trim().toLowerCase();
    return query ? group.options.filter(pack => pack.name.toLowerCase().includes(query)) : group.options;
  }

  anyPackMatches(): boolean {
    return this.groups.some(group => this.visiblePacks(group).length > 0);
  }

  /** A group's or coupon's own checkbox: ticks all of its packs, or unticks them when all are ticked. */
  togglePacks(options: ReadonlyArray<PackOption>): void {
    const checked = !allChecked(options);
    options.forEach(option => option.value = checked);
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
  selectQuestingCoupon(index: number): void {
    const previous = this.selectedQuestingCoupon;
    const next = this.questingCoupons[index] ?? null;

    previous?.options.forEach(option => option.value = false);
    next?.options.forEach(option => option.value = true);
    this.pickedCoupon = next;
  }

  /**
   * Free quests and the pseudo-packs, then expansions, then adventure packs - the last two
   * oldest first by default, which is how players remember them and keeps what a coupon
   * granted together. A pack the wiki's tables don't date is listed with the adventure
   * packs, last.
   */
  private makeGroups(): PackGroup[] {
    const byName = (left: PackOption, right: PackOption) => left.name.localeCompare(right.name);
    const byRelease = (left: PackOption, right: PackOption) =>
      (left.released || '9999').localeCompare(right.released || '9999') || byName(left, right);
    const order = this.sort === 'release' ? byRelease : byName;

    const always = new Set<string>([FREE_QUESTS_PACK_LABEL, ...PSEUDO_PACKS]);
    const groups: PackGroup[] = [
      { id: 'always', title: 'Free and other', options: this.options.filter(option => always.has(option.name)) },
      { id: 'expansions', title: 'Expansions', options: this.options.filter(option => option.expansion).sort(order) },
      {
        id: 'adventure-packs',
        title: 'Adventure packs',
        options: this.options.filter(option => !option.expansion && !always.has(option.name)).sort(order),
      },
    ];
    return groups.filter(group => group.options.length > 0);
  }

  /** The coupons that granted at least one pack the checklist lists, oldest first. */
  private makeCouponOptions(): CouponOption[] {
    const byName = new Map(this.options.map(option => [option.name, option]));
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
}

/** The item filter's key for a pack's name: Free Quests is NO_PACK_KEY. */
export function packFilterValue(packName: string): string {
  return packName === FREE_QUESTS_PACK_LABEL ? NO_PACK_KEY : packName;
}

/**
 * Every pack an item or augment drops in: Free Quests, then the DDO Store and Events
 * groups, then the real packs alphabetically. Augments with no source follow their host
 * item, so only those with sources add packs.
 */
function allPackOptions(gameData: Pick<GameDataService, 'items' | 'crafting'>): PackOption[] {
  const keys = new Set<string>();

  for (const item of gameData.items) {
    getPackKeys(item.quests ?? []).forEach(key => keys.add(key));
  }
  for (const system of Object.values(gameData.crafting)) {
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
      name: key === NO_PACK_KEY ? FREE_QUESTS_PACK_LABEL : key,
      value: true,
      year: info?.released.slice(0, 4) ?? '',
      released: info?.released ?? '',
      expansion: info?.expansion ?? false,
    };
  });
}
