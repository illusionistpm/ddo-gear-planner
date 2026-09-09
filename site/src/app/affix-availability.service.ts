import { Injectable } from '@angular/core';

import { GearDbService } from './gear-db.service';
import { FiltersService } from './filters.service';

export type AvailabilityTier =
  | 'common'
  | 'limited'
  | 'scarce'
  | 'augment-only'
  | 'set-only'
  | 'unavailable';

export interface AvailabilitySetSource {
  setName: string;
  threshold: number;
  value: number;
}

export interface AffixAvailability {
  affixName: string;
  bonusType: string;
  slots: string[];
  slotCount: number;
  itemCount: number;
  setSources: AvailabilitySetSource[];
  /** Number of distinct augment options that grant this (affix, bonus type). */
  augmentCount: number;
  /** Slots whose items carry an augment slot able to host such an augment. */
  augmentSlots: string[];
  hasItemSource: boolean;
  hasAugmentSource: boolean;
  hasSetSource: boolean;
  tier: AvailabilityTier;
  scarcityWeight: number;
  bestValue: number;
}

export interface RemainingAvailability extends AffixAvailability {
  /** Data-capable slots (`AffixAvailability.slots`) that are not yet filled. */
  remainingSlots: string[];
  remainingSlotCount: number;
  /**
   * True when items could carry this bonus type but every slot that can has
   * already been filled and no set/augment fallback exists — i.e. the current
   * gear choices have ruled this bonus type out.
   */
  eliminated: boolean;
}

/**
 * Measures how *available* a given (affix, bonusType) pairing is across the
 * currently filtered gear: how many equipment slots carry an item source, how
 * many items / augments / sets grant it, and a derived scarcity tier + weight.
 *
 * The suggestion score (EquippedService.getScore) multiplies each tracked-affix
 * contribution by this weight so scarce needs beat abundant ones on a tie, and
 * the Tracked Affixes tab's "Scarcity" grouping buckets bonus types by the same
 * measure so the player fits the hardest-to-place ones first.
 *
 * Results are memoised and cleared whenever the item filters change, since the
 * level range moves the slot counts.
 */
@Injectable({
  providedIn: 'root'
})
export class AffixAvailabilityService {
  private cache = new Map<string, AffixAvailability>();
  private setSlotsCache = new Map<string, string[]>();

  constructor(
    private gearDB: GearDbService,
    private filters: FiltersService
  ) {
    this.filters.getItemFilters().subscribe(() => {
      this.cache.clear();
      this.setSlotsCache.clear();
    });
  }

  private slotsForSet(setName: string): string[] {
    let slots = this.setSlotsCache.get(setName);
    if (!slots) {
      slots = this.gearDB.findSlotsForSet(setName) || [];
      this.setSlotsCache.set(setName, slots);
    }
    return slots;
  }

  /**
   * Can this set still reach `threshold` pieces? True when the pieces already
   * equipped plus the still-open slots that could hold one of its pieces meet
   * the threshold.
   */
  isSetReachable(
    setName: string,
    threshold: number,
    openSlots: ReadonlySet<string>,
    equippedSetCounts: ReadonlyMap<string, number>
  ): boolean {
    const have = equippedSetCounts.get(setName) || 0;
    if (have >= threshold) {
      return true;
    }
    const openForSet = this.slotsForSet(setName).filter(slot => openSlots.has(slot)).length;
    return have + openForSet >= threshold;
  }

  getAvailability(affixName: string, bonusType: string): AffixAvailability {
    const key = affixName + '\0' + bonusType;
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }

    const items = this.gearDB.findGearWithAffixAndType(affixName, bonusType) || [];
    const slots = Array.from(new Set(items.map((item: { slot: string }) => item.slot)));

    const setSources: AvailabilitySetSource[] = (this.gearDB.findSetsWithAffixAndType(affixName, bonusType) || [])
      .map((entry: [string, number, string | number]) => ({
        setName: entry[0],
        threshold: Number(entry[1]),
        value: Number(entry[2])
      }));

    // findAugmentsWithAffixAndType returns one (often empty) craftable per
    // augment colour, so count the actual options, not the craftables.
    const augmentCraftables = this.gearDB.findAugmentsWithAffixAndType(affixName, bonusType) || [];
    const augmentCount = augmentCraftables.reduce(
      (total: number, craftable: { options?: unknown[] }) => total + (craftable.options?.length || 0),
      0
    );
    const augmentSlots = augmentCount > 0
      ? this.gearDB.findSlotsForAugmentAffixAndType(affixName, bonusType)
      : [];

    const hasItemSource = slots.length > 0;
    const hasAugmentSource = augmentSlots.length > 0;
    const hasSetSource = setSources.length > 0;

    const tier = this.deriveTier(slots.length, hasItemSource, hasAugmentSource, hasSetSource);

    const availability: AffixAvailability = {
      affixName,
      bonusType,
      slots,
      slotCount: slots.length,
      itemCount: items.length,
      setSources,
      augmentCount,
      augmentSlots,
      hasItemSource,
      hasAugmentSource,
      hasSetSource,
      tier,
      scarcityWeight: this.weightForTier(tier, slots.length),
      bestValue: this.gearDB.getBestValueForAffixType(affixName, bonusType)
    };

    this.cache.set(key, availability);
    return availability;
  }

  /**
   * Availability narrowed to the slots still open for gear. As keystone pieces
   * fill slots, a bonus type's remaining slots shrink, its scarcity weight
   * climbs, and it can flip to `set-only` / `augment-only` / eliminated — so the
   * planner converges on a final set instead of re-suggesting spoken-for slots.
   */
  getRemainingAvailability(
    affixName: string,
    bonusType: string,
    openSlots: ReadonlySet<string>,
    equippedSetCounts?: ReadonlyMap<string, number>,
    equippedOpenAugmentSlots?: ReadonlySet<string>
  ): RemainingAvailability {
    const base = this.getAvailability(affixName, bonusType);
    const remainingItemSlots = base.slots.filter(slot => openSlots.has(slot));
    const remainingAugmentSlots = base.augmentSlots.filter(slot => openSlots.has(slot));

    // Every place that could still carry this bonus type, and so relieves the
    // pressure to fit it now:
    //   - an empty gear slot whose items can carry it natively;
    //   - an empty gear slot whose items can host a compatible augment;
    //   - a *filled* slot whose equipped item still has a free compatible
    //     augment slot (filling a slot does not consume its augment slots).
    const remainingSlots = Array.from(new Set([
      ...remainingItemSlots,
      ...remainingAugmentSlots,
      ...(equippedOpenAugmentSlots ?? [])
    ]));
    const remainingSlotCount = remainingSlots.length;

    // A set only counts if it can still reach its piece-count threshold: the
    // pieces already equipped plus the open slots that could still hold one.
    const remainingSetSources = equippedSetCounts
      ? base.setSources.filter(source =>
          this.isSetReachable(source.setName, source.threshold, openSlots, equippedSetCounts))
      : base.setSources;
    const hasSetRemaining = remainingSetSources.length > 0;

    const tier = this.deriveTier(
      remainingSlotCount,
      remainingSlotCount > 0,
      false,
      hasSetRemaining
    );
    // Ruled out by gear: an item, augment, or set could have carried it, but no
    // path is still reachable with the slots left open.
    const eliminated =
      (base.hasItemSource || base.hasAugmentSource || base.hasSetSource) && tier === 'unavailable';

    return {
      ...base,
      slots: remainingSlots,
      slotCount: remainingSlotCount,
      augmentSlots: remainingAugmentSlots,
      setSources: remainingSetSources,
      hasItemSource: remainingItemSlots.length > 0,
      hasAugmentSource: remainingAugmentSlots.length > 0,
      hasSetSource: hasSetRemaining,
      remainingSlots,
      remainingSlotCount,
      eliminated,
      tier,
      scarcityWeight: this.weightForTier(tier, remainingSlotCount)
    };
  }

  /** Multiplier applied to a tracked-affix contribution in the suggestion score. */
  getScarcityWeight(
    affixName: string,
    bonusType: string,
    openSlots?: ReadonlySet<string>,
    equippedSetCounts?: ReadonlyMap<string, number>,
    equippedOpenAugmentSlots?: ReadonlySet<string>
  ): number {
    if (!affixName || !bonusType) {
      return 1;
    }
    if (openSlots) {
      return this.getRemainingAvailability(
        affixName, bonusType, openSlots, equippedSetCounts, equippedOpenAugmentSlots
      ).scarcityWeight;
    }
    return this.getAvailability(affixName, bonusType).scarcityWeight;
  }

  private deriveTier(
    slotCount: number,
    hasItemSource: boolean,
    hasAugmentSource: boolean,
    hasSetSource: boolean
  ): AvailabilityTier {
    if (hasItemSource) {
      if (slotCount <= 2) {
        return 'scarce';
      }
      if (slotCount <= 4) {
        return 'limited';
      }
      return 'common';
    }
    // No item carries it. A set is the more constraining commitment (several
    // pieces across the build) so it wins the label over an augment fallback.
    if (hasSetSource) {
      return 'set-only';
    }
    if (hasAugmentSource) {
      return 'augment-only';
    }
    return 'unavailable';
  }

  private weightForTier(tier: AvailabilityTier, slotCount: number): number {
    switch (tier) {
      case 'scarce':
        return slotCount <= 1 ? 2.2 : 1.9;
      case 'augment-only':
        return 1.5;
      case 'limited':
        return 1.35;
      case 'common':
      case 'set-only':
      case 'unavailable':
      default:
        return 1;
    }
  }
}
