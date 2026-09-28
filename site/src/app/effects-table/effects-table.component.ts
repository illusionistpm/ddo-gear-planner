import { Component, DoCheck, OnDestroy, OnInit, Input, ChangeDetectionStrategy } from '@angular/core';
import { Subscription } from 'rxjs';

import { preserveScrollOnMouseDown } from '../shared/preserve-scroll-position';
import { EquippedService, TrackedAffixGroupMode } from '../planner/equipped.service';
import { GearDbService } from '../gear/gear-db.service';
import { AffixService } from '../affixes/affix.service';
import { AffixGroupDisplay, getAffixGroupCssClass, groupAffixNames, UTILITY_CHECKLIST_CATEGORY } from '../affixes/affix-organization';
import { PlannerOnboardingService } from '../planner/planner-onboarding.service';
import { SuggestionDrawerService } from '../suggestion-drawer/suggestion-drawer.service';
import { AffixAvailabilityService, RemainingAvailability } from '../affixes/affix-availability.service';
import { TrackedAffixDerivationService } from '../affixes/tracked-affix-derivation.service';
import {
  buildTrackedAffixGroups,
  classForBonusValue,
  CoveredBonusType,
  moderateValueThreshold,
  sortBonusTypes,
  splitCoveredAffixes,
  TrackedAffixGroupDisplay,
  TrackedBonusTypeDisplay,
  TrackedBonusTypeRef,
  TrackedBonusTypeSource,
} from '../affixes/tracked-affix-derivation';
import { affixTypeKey } from '../affixes/affix-type-key';
import { MAX_FILIGREE_SLOTS_AFFIX } from '../affixes/filigree-affix';
import { RECENT_CHANGE_HIGHLIGHT_MS } from '../planner/recent-change-highlight';
import { AffixSourceHighlightService } from '../planner/affix-source-highlight.service';

/** One bonus-type chip. Both groupings render the same chip for the same type. */
interface TrackedChip {
  sourceAffixName: string;
  bonusType: string;
  label: string;
  currentValue: number;
  maxValue: number;
  valueClass: string;
  eliminated: boolean;
  ignored: boolean;
  /** Filtered out by the level range: shown disabled, so the row still lists every type. */
  unavailable: boolean;
  tooltip: string;
}

/** A checklist affix's chip, which names the affix rather than a bonus type. */
interface ChecklistChip {
  affixName: string;
  bonusType: string;
  checked: boolean;
  ignored: boolean;
  eliminated: boolean;
  tooltip: string;
}

interface SlotGroupRow {
  affixName: string;
  chips: TrackedChip[];
}

interface SlotGroup {
  key: string;
  label: string;
  order: number;
  rows: SlotGroupRow[];
  checklistAffixes: string[];
}

/** Everything both groupings render, built once per change to what they show. */
interface TrackedDisplay {
  /** Category view: each tracked affix's visible bonus types, in display order. */
  chipsByAffix: Map<string, TrackedChip[]>;
  checklistChips: Map<string, ChecklistChip>;
  slotGroups: SlotGroup[];
}

/** A chip plus what the scarcity grouping needs to file it. */
interface ChipBuild {
  chip: TrackedChip;
  sufficient: boolean;
  /** Absent for sufficient or ignored types, which never ask. */
  availability?: RemainingAvailability;
}

@Component({
    selector: 'app-effects-table',
    templateUrl: './effects-table.component.html',
    styleUrls: ['./effects-table.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class EffectsTableComponent implements OnInit, DoCheck, OnDestroy {

  public affixMap = new Map<string, CoveredBonusType[]>();
  public affixNames: Array<string> = [];

  public boolAffixMap = new Map<string, CoveredBonusType[]>();
  public boolAffixNames: Array<string> = [];

  collapsedAffixGroups = new Set<string>();
  groupMode: TrackedAffixGroupMode = 'category';
  onboardingActive = true;
  trackedAffixGroups: TrackedAffixGroupDisplay[] = [];
  showAffixTypeHint = false;
  onboardingTargetChipKey = '';
  recentlyChangedAffixTypes = new Set<string>();
  private onboardingSubscription?: Subscription;
  private coveredAffixesSubscription?: Subscription;
  private viewStateSubscription?: Subscription;
  private previousAffixTypeValues?: Map<string, number>;
  private changedAffixTypesTimeout: ReturnType<typeof setTimeout> | null = null;
  private trackedAffixDisplaySignature = '';
  trackedDisplay: TrackedDisplay = { chipsByAffix: new Map(), checklistChips: new Map(), slotGroups: [] };
  private trackedDisplayDirty = true;
  private itemFiltersSubscription?: Subscription;

  @Input() sortOwnedToTop: boolean = true;

  constructor(
    public equipped: EquippedService,
    public gearDB: GearDbService,
    private affixSvc: AffixService,
    private onboarding: PlannerOnboardingService,
    private suggestionDrawer: SuggestionDrawerService,
    private availability: AffixAvailabilityService,
    private derivation: TrackedAffixDerivationService,
    public sourceHighlight: AffixSourceHighlightService
  ) {
    this.affixNames = [];
    this.boolAffixNames = [];
  }

  ngOnInit() {
    this.viewStateSubscription = this.equipped.getTrackedAffixViewState().subscribe(state => {
      this.groupMode = state.groupMode;
      this.collapsedAffixGroups = new Set(state.collapsed);
    });

    this.onboardingActive = this.onboarding.shouldShowOnboarding();
    this.onboardingSubscription = this.onboarding.getOnboardingState().subscribe(() => {
      this.onboardingActive = this.onboarding.shouldShowOnboarding();
      this.refreshTrackedAffixDisplay();
    });

    this.coveredAffixesSubscription = this.equipped.getCoveredAffixes().subscribe(map => {
      ({
        affixMap: this.affixMap,
        affixNames: this.affixNames,
        boolAffixMap: this.boolAffixMap,
        boolAffixNames: this.boolAffixNames,
      } = splitCoveredAffixes(map));

      this.updateRecentlyChangedAffixTypes();
      this.refreshTrackedAffixDisplay();
      this.trackedDisplayDirty = true;
    });

    // Covered affixes re-emit on any gear or ignore change, but not when the level
    // range moves the best available values and remaining slots.
    this.itemFiltersSubscription = this.gearDB.filters.getItemFilters().subscribe(() => {
      this.trackedDisplayDirty = true;
    });
  }

  ngOnDestroy() {
    this.sourceHighlight.clear();
    this.onboardingSubscription?.unsubscribe();
    this.coveredAffixesSubscription?.unsubscribe();
    this.viewStateSubscription?.unsubscribe();
    this.itemFiltersSubscription?.unsubscribe();
    if (this.changedAffixTypesTimeout) {
      clearTimeout(this.changedAffixTypesTimeout);
    }
  }

  ngDoCheck() {
    this.refreshTrackedAffixDisplay();
    if (this.trackedDisplayDirty) {
      this.trackedDisplayDirty = false;
      this.trackedDisplay = this.buildTrackedDisplay();
    }
  }

  isDerivedTrackedAffix(affixName: string) {
    return this.equipped.isDerivedTrackedAffix(affixName);
  }

  removeAffix(affixName: string) {
    this.equipped.removeImportantAffix(affixName);
  }

  readonly preserveScrollOnMouseDown = preserveScrollOnMouseDown;

  currentBonus(affixName: string) {
    const boolAffix = this.boolAffixMap.get(affixName)?.[0];
    if (boolAffix) {
      return boolAffix.value ? 1 : 0;
    }
    let total = 0;
    for (const type of this.getVisibleTypes(affixName)) {
      total += type.value;
    }
    return total;
  }

  maxBonus(affixName: string) {
    if (this.boolAffixMap.has(affixName)) {
      return 1;
    }
    let total = 0;
    for (const type of this.getVisibleTypes(affixName)) {
      const maxValue = this.gearDB.getBestValueForAffixType(type.sourceAffixName, type.sourceBonusType);
      if (maxValue > 0) {
        total += maxValue;
      }
    }
    return total;
  }

  getTotalProgressPercent(affixName: string) {
    const maxValue = this.maxBonus(affixName);
    if (maxValue <= 0) {
      return 0;
    }

    return Math.min(100, Math.max(0, this.currentBonus(affixName) / maxValue * 100));
  }

  showItemsWithBonusType(affixName: string, bonusType: string) {
    if (this.shouldShowAffixTypeHint()) {
      this.onboarding.completeIntro();
      this.onboardingActive = this.onboarding.shouldShowOnboarding();
      this.refreshTrackedAffixDisplay();
    }
    this.suggestionDrawer.openBonusType(affixName, bonusType, this.sortOwnedToTop);
  }

  /**
   * True once equipped gear already supplies at least the "moderate value"
   * threshold (3/4 of the best available) for this bonus type — at that point
   * it is no longer worth flagging as scarce or hard to place.
   */
  isBonusTypeSufficient(affixName: string, type: TrackedBonusTypeRef): boolean {
    if (!type.value) {
      return false;
    }
    const maxValue = this.getMaxValueForType(affixName, type);
    return maxValue > 0 && type.value >= moderateValueThreshold(maxValue);
  }

  /**
   * Tracked bonus types bucketed by how many places (open gear slots, or a
   * free augment slot) could still supply them — most restricted first, with
   * types ruled out by gear after that and types already covered to the
   * moderate-value threshold last. Backs the "Group by: Scarcity" view.
   */
  getSlotGroups(): SlotGroup[] {
    return this.buildTrackedDisplay().slotGroups;
  }

  chipsFor(affixName: string): TrackedChip[] {
    return this.trackedDisplay.chipsByAffix.get(affixName) ?? [];
  }

  checklistChipFor(affixName: string): ChecklistChip | undefined {
    return this.trackedDisplay.checklistChips.get(affixName);
  }

  /**
   * Builds every chip once, for both groupings, so the template reads fields
   * instead of re-deriving each chip on every change-detection pass.
   */
  private buildTrackedDisplay(): TrackedDisplay {
    const openSlots = this.equipped.getUnlockedSlots();
    const equippedSetCounts = this.equipped.getActiveSets();
    // A universal companion type shows under every affix it feeds; ask once.
    const availabilityByKey = new Map<string, RemainingAvailability>();
    const remainingFor = (affixName: string, bonusType: string): RemainingAvailability => {
      const key = affixTypeKey(affixName, bonusType);
      let info = availabilityByKey.get(key);
      if (!info) {
        info = this.availability.getRemainingAvailability(
          affixName, bonusType, openSlots, equippedSetCounts,
          this.equipped.getSlotsWithOpenAugmentForAffixType(affixName, bonusType)
        );
        availabilityByKey.set(key, info);
      }
      return info;
    };

    const chipsByAffix = new Map<string, TrackedChip[]>();
    const builds = new Map<string, ChipBuild[]>();
    for (const affixName of this.affixNames) {
      const affixBuilds = this.getVisibleTypes(affixName)
        .map(type => this.buildChip(affixName, type, remainingFor));
      builds.set(affixName, affixBuilds);
      // Filtered-out types sit in the same list, in the same order, as the rest.
      chipsByAffix.set(affixName, sortBonusTypes([
        ...affixBuilds.map(build => build.chip),
        ...this.getUnavailableTypes(affixName).map(type => this.buildUnavailableChip(type))
      ]));
    }

    const checklistChips = new Map<string, ChecklistChip>();
    for (const affixName of this.boolAffixNames) {
      const boolAffix = this.boolAffixMap.get(affixName)?.[0] ?? { bonusType: 'Bool', value: 0 };
      const checked = !!boolAffix.value;
      const ignored = this.equipped.isAffixTypeIgnored(affixName, boolAffix.bonusType);
      const availability = !checked && !ignored && boolAffix.bonusType !== 'Penalty'
        ? remainingFor(affixName, boolAffix.bonusType)
        : undefined;
      checklistChips.set(affixName, {
        affixName,
        bonusType: boolAffix.bonusType,
        checked,
        ignored,
        eliminated: availability?.eliminated ?? false,
        tooltip: this.getChipTooltip(affixName, boolAffix, availability)
      });
    }

    return {
      chipsByAffix,
      checklistChips,
      slotGroups: this.groupBySlots(builds, checklistChips, remainingFor)
    };
  }

  private buildChip(
    affixName: string,
    type: TrackedBonusTypeDisplay,
    remainingFor: (affixName: string, bonusType: string) => RemainingAvailability
  ): ChipBuild {
    const sourceAffixName = this.getSourceAffixName(affixName, type);
    const bonusType = this.getSourceBonusType(type);
    const ignored = this.equipped.isAffixTypeIgnored(sourceAffixName, bonusType);
    const sufficient = this.isBonusTypeSufficient(affixName, type);
    const asksAvailability = !sufficient && !ignored && bonusType !== 'Penalty' && bonusType !== 'Bool';
    const availability = asksAvailability ? remainingFor(sourceAffixName, bonusType) : undefined;
    return {
      chip: {
        sourceAffixName,
        bonusType,
        label: this.getBonusTypeLabel(type),
        currentValue: type.value || 0,
        maxValue: this.getMaxValueForType(affixName, type),
        valueClass: type.value ? this.getClassForValue(affixName, type) : '',
        eliminated: availability?.eliminated ?? false,
        ignored,
        unavailable: false,
        tooltip: this.getChipTooltip(affixName, type, availability)
      },
      sufficient,
      availability
    };
  }

  private buildUnavailableChip(type: TrackedBonusTypeDisplay): TrackedChip {
    return {
      sourceAffixName: type.sourceAffixName,
      bonusType: type.sourceBonusType,
      label: this.getBonusTypeLabel(type),
      currentValue: 0,
      maxValue: 0,
      valueClass: '',
      eliminated: false,
      ignored: false,
      unavailable: true,
      tooltip: 'No gear with this bonus type is available in the current level range.'
    };
  }

  private groupBySlots(
    builds: Map<string, ChipBuild[]>,
    checklistChips: Map<string, ChecklistChip>,
    remainingFor: (affixName: string, bonusType: string) => RemainingAvailability
  ): SlotGroup[] {
    const seen = new Set<string>();
    const buckets = new Map<string, SlotGroup>();
    const bucket = (key: string, label: string, order: number): SlotGroup => {
      let group = buckets.get(key);
      if (!group) {
        group = { key, label, order, rows: [], checklistAffixes: [] };
        buckets.set(key, group);
      }
      return group;
    };
    // Keep every bonus type of one tracked affix on the same row within a
    // bucket, mirroring the category grouping.
    const rowFor = (group: SlotGroup, affixName: string): SlotGroupRow => {
      let row = group.rows.find(candidate => candidate.affixName === affixName);
      if (!row) {
        row = { affixName, chips: [] };
        group.rows.push(row);
      }
      return row;
    };
    const scarcityBucket = (sourceAffixName: string, info: RemainingAvailability): SlotGroup | null => {
      if (info.eliminated) {
        return bucket('ruled-out', 'Ruled out by gear', 99);
      } else if (info.tier === 'unavailable') {
        return null;
      } else if (sourceAffixName === MAX_FILIGREE_SLOTS_AFFIX) {
        // The artifact you wear shapes the rest of the build, so it sits above everything else.
        return bucket('minor-artifact', 'Minor Artifact', -1);
      } else if (info.tier === 'set-only') {
        return bucket('set-only', 'Set only', 0);
      } else if (info.slotCount >= 5) {
        return bucket('5plus', '5+ open slots', 5);
      }
      return bucket(
        String(info.slotCount),
        `${info.slotCount} open slot${info.slotCount === 1 ? '' : 's'}`,
        info.slotCount
      );
    };
    const fileByScarcity = (affixName: string, chip: TrackedChip, info: RemainingAvailability) => {
      const group = scarcityBucket(chip.sourceAffixName, info);
      if (group) {
        rowFor(group, affixName).chips.push(chip);
      }
    };

    for (const [affixName, affixBuilds] of builds) {
      for (const { chip, sufficient, availability } of affixBuilds) {
        if (chip.bonusType === 'Penalty' || chip.bonusType === 'Bool') {
          continue;
        }
        const key = affixTypeKey(chip.sourceAffixName, chip.bonusType);
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);

        if (sufficient) {
          rowFor(bucket('fulfilled', 'Fulfilled', 100), affixName).chips.push(chip);
        } else if (chip.ignored) {
          rowFor(bucket('ignored', 'Ignored', 90), affixName).chips.push(chip);
        } else if (availability) {
          fileByScarcity(affixName, chip, availability);
        }
      }
    }

    for (const [affixName, checklist] of checklistChips) {
      if (checklist.bonusType === 'Penalty') {
        continue;
      }
      const key = affixTypeKey(affixName, checklist.bonusType);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      if (checklist.checked) {
        bucket('fulfilled', 'Fulfilled', 100).checklistAffixes.push(affixName);
        continue;
      }

      const chip: TrackedChip = {
        sourceAffixName: affixName,
        bonusType: checklist.bonusType,
        label: 'Checklist',
        currentValue: 0,
        maxValue: 0,
        valueClass: '',
        eliminated: checklist.eliminated,
        ignored: checklist.ignored,
        unavailable: false,
        tooltip: checklist.tooltip
      };
      if (chip.ignored) {
        rowFor(bucket('ignored', 'Ignored', 90), affixName).chips.push(chip);
      } else {
        fileByScarcity(affixName, chip, remainingFor(affixName, checklist.bonusType));
      }
    }

    const groups = Array.from(buckets.values()).sort((a, b) => a.order - b.order);
    for (const group of groups) {
      // Alphabetical within a group, matching the category grouping.
      group.rows.sort((a, b) => a.affixName.localeCompare(b.affixName));
      group.checklistAffixes.sort((a, b) => a.localeCompare(b));
    }
    return groups;
  }

  /**
   * The chip's value tooltip, what supplies the value that counts, and - for a
   * type still worth chasing - how many places can still supply it. The same
   * text in both groupings.
   */
  private getChipTooltip(affixName: string, type: TrackedBonusTypeRef, availability?: RemainingAvailability): string {
    const valueTooltip = this.getBonusTypeTooltip(affixName, type);
    const sourcesTooltip = this.getSourcesTooltip(affixName, type);
    const scarcityTooltip = availability ? this.getScarcityTooltip(availability) : '';
    return [valueTooltip, sourcesTooltip, scarcityTooltip].filter(Boolean).join('\n');
  }

  /** Every source of the best value - several when they tie. */
  private getSourcesTooltip(affixName: string, type: TrackedBonusTypeRef): string {
    const sources = this.equipped.getSourcesForAffixType(this.getSourceAffixName(affixName, type), this.getSourceBonusType(type));
    if (!sources.length) {
      return '';
    }
    return 'Provided by:\n' + sources
      .map(source => '- ' + (source.kind === 'set' ? `${source.itemName} set bonus` : `${source.slot}: ${source.itemName}`))
      .join('\n');
  }

  private getScarcityTooltip(info: RemainingAvailability): string {
    if (info.eliminated) {
      return 'Ruled out by your gear — no open slot, augment, or reachable set can still supply this.';
    }
    switch (info.tier) {
      case 'set-only':
        return 'Needs a multi-piece set — no single item or augment supplies it.';
      case 'scarce':
        return `Only ${info.slotCount === 1 ? '1 place' : info.slotCount + ' places'} can still supply this — fit it early.`;
      case 'limited':
      case 'common':
        return `${info.slotCount} places can still supply this.`;
      default:
        return '';
    }
  }

  sortTypes(affixName: string) {
    const types = this.affixMap.get(affixName) || [];
    return sortBonusTypes(types);
  }

  isBonusTypeAvailable(affixName: string, type: TrackedBonusTypeSource): boolean {
    return this.gearDB.getBestValueForAffixType(this.getSourceAffixName(affixName, type), this.getSourceBonusType(type)) > 0;
  }

  isBonusTypeUnavailableAtCurrentLevelRange(affixName: string, type: TrackedBonusTypeSource): boolean {
    return !this.isBonusTypeAvailable(affixName, type);
  }

  getVisibleTypes(affixName: string): TrackedBonusTypeDisplay[] {
    return this.derivation.getVisibleTypes(this.affixMap, affixName);
  }

  /** Bonus types the affix has at some level, but not from any gear in the current level range. */
  getUnavailableTypes(affixName: string): TrackedBonusTypeDisplay[] {
    const currentTypesWithValue = new Set(
      this.getVisibleTypes(affixName)
        .filter(type => type.value)
        .map(type => affixTypeKey(type.sourceAffixName, type.sourceBonusType))
    );

    const seen = new Set<string>();
    const unavailableTypes = this.derivation.getAllLevelDisplayTypes(affixName)
      .filter(bonusType => {
        const key = affixTypeKey(bonusType.sourceAffixName, bonusType.sourceBonusType);
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return bonusType.sourceBonusType !== 'Penalty' &&
          !currentTypesWithValue.has(key) &&
          !this.isBonusTypeAvailable(affixName, bonusType);
      });

    return sortBonusTypes(unavailableTypes);
  }

  getBonusTypeTooltip(affixName: string, type: TrackedBonusTypeRef): string {
    if (this.equipped.isAffixTypeIgnored(this.getSourceAffixName(affixName, type), this.getSourceBonusType(type))) {
      return 'Marked as ignored';
    }

    if (this.isBonusTypeUnavailableAtCurrentLevelRange(affixName, type)) {
      return 'No gear with this bonus type is available in the current level range.';
    }

    return this.getValueTooltip(affixName, type);
  }

  getFilteredBoolAffixNames(): string[] {
    return this.boolAffixNames
      .sort((left, right) => left.localeCompare(right));
  }

  getAffixGroups(): AffixGroupDisplay[] {
    return groupAffixNames(this.affixNames, '', this.affixSvc);
  }

  getTrackedAffixGroups(): TrackedAffixGroupDisplay[] {
    return this.buildTrackedAffixGroups();
  }

  private buildTrackedAffixGroups(): TrackedAffixGroupDisplay[] {
    return buildTrackedAffixGroups(this.affixNames, this.getFilteredBoolAffixNames(), this.affixSvc);
  }

  shouldShowAffixTypeHint(): boolean {
    return this.showAffixTypeHint;
  }

  dismissIntro() {
    this.onboarding.dismissIntro();
    this.onboardingActive = this.onboarding.shouldShowOnboarding();
    this.refreshTrackedAffixDisplay();
  }

  isOnboardingTargetChip(affixName: string, bonusType: string): boolean {
    return this.shouldShowAffixTypeHint() && this.onboardingTargetChipKey === affixTypeKey(affixName, bonusType);
  }

  private getOnboardingTargetChipKey(): string {
    let utilityFallbackChipKey = '';

    for (const group of this.trackedAffixGroups) {
      if (this.isAffixGroupCollapsed(group.name)) {
        continue;
      }

      const groupChipKey = this.getFirstOnboardingChipKeyForGroup(group, true);
      if (!groupChipKey) {
        continue;
      }

      if (group.name !== UTILITY_CHECKLIST_CATEGORY) {
        return groupChipKey;
      }

      utilityFallbackChipKey = utilityFallbackChipKey || groupChipKey;
    }

    if (utilityFallbackChipKey) {
      return utilityFallbackChipKey;
    }

    for (const group of this.trackedAffixGroups) {
      if (this.isAffixGroupCollapsed(group.name)) {
        continue;
      }

      const groupChipKey = this.getFirstOnboardingChipKeyForGroup(group, false);
      if (!groupChipKey) {
        continue;
      }

      if (group.name !== UTILITY_CHECKLIST_CATEGORY) {
        return groupChipKey;
      }

      utilityFallbackChipKey = utilityFallbackChipKey || groupChipKey;
    }

    return utilityFallbackChipKey;
  }

  private getFirstOnboardingChipKeyForGroup(group: TrackedAffixGroupDisplay, preferMissingValue: boolean): string {
    for (const affixName of group.checklistAffixes) {
      const boolAffix = this.boolAffixMap.get(affixName)?.[0];
      if (!boolAffix || boolAffix.bonusType === 'Penalty') {
        continue;
      }
      if (preferMissingValue && boolAffix.value) {
        continue;
      }

      return affixTypeKey(affixName, boolAffix.bonusType);
    }

    for (const affixName of group.affixes) {
      for (const type of this.getVisibleTypes(affixName)) {
        if (preferMissingValue && type.value) {
          continue;
        }

        const chipAffixName = this.getSourceAffixName(affixName, type);
        const chipBonusType = this.getSourceBonusType(type);
        return affixTypeKey(chipAffixName, chipBonusType);
      }
    }

    return '';
  }

  getAffixGroupCount(group: TrackedAffixGroupDisplay): number {
    return group.affixes.length + group.checklistAffixes.length;
  }

  getAffixGroupClass(groupName: string): string {
    return getAffixGroupCssClass(groupName);
  }

  toggleAffixGroup(groupName: string) {
    this.equipped.toggleTrackedAffixGroupCollapsed(groupName);
    this.refreshOnboardingTarget();
  }

  isAffixGroupCollapsed(groupName: string): boolean {
    return this.collapsedAffixGroups.has(groupName);
  }

  getClassForValue(affixName: string, type: TrackedBonusTypeRef) {
    return classForBonusValue(type.bonusType, type.value, this.getMaxValueForType(affixName, type));
  }

  getValueTooltip(affixName: string, type: TrackedBonusTypeRef): string {
    if (type.bonusType === 'Penalty') {
      return 'Penalty effect';
    }

    const maxValue = this.gearDB.getBestValueForAffixType(this.getSourceAffixName(affixName, type), this.getSourceBonusType(type));
    const shortBy = maxValue - type.value;

    if (maxValue === 0) {
      return 'No gear with this bonus type is available in the current level range.';
    }

    if (!type.value) {
      return type.bonusType === 'Bool' ? 'Not covered yet' : `Not covered yet (best available: ${maxValue})`;
    }

    if (type.value >= maxValue) {
      return 'Best possible value';
    } else if (type.value >= moderateValueThreshold(maxValue)) {
      return `Moderate value (${shortBy} below max)`;
    } else {
      return `Low value (${shortBy} below max)`;
    }
  }

  getBonusTypeLabel(type: TrackedBonusTypeRef): string {
    return type.label || (type.bonusType ? type.bonusType : 'Untyped');
  }

  trackAffixGroup(index: number, group: TrackedAffixGroupDisplay): string {
    return group.name;
  }

  trackSlotGroup(index: number, group: SlotGroup): string {
    return group.key;
  }

  trackSlotRow(index: number, row: SlotGroupRow): string {
    return row.affixName;
  }

  trackChip(index: number, chip: TrackedChip): string {
    return affixTypeKey(chip.sourceAffixName, chip.bonusType);
  }

  isRecentlyChangedAffixType(affixName: string, type: TrackedBonusTypeSource): boolean {
    return this.recentlyChangedAffixTypes.has(this.getDisplayedTypeKey(affixName, type));
  }

  getSourceAffixName(affixName: string, type: TrackedBonusTypeSource): string {
    return type.sourceAffixName || affixName;
  }

  getSourceBonusType(type: TrackedBonusTypeSource): string {
    return type.sourceBonusType || type.bonusType;
  }

  getMaxValueForType(affixName: string, type: TrackedBonusTypeSource): number {
    return this.gearDB.getBestValueForAffixType(this.getSourceAffixName(affixName, type), this.getSourceBonusType(type));
  }

  private getDisplayedTypeKey(affixName: string, type: TrackedBonusTypeSource): string {
    return affixTypeKey(this.getSourceAffixName(affixName, type), this.getSourceBonusType(type));
  }

  private updateRecentlyChangedAffixTypes() {
    const currentValues = this.getDisplayedAffixTypeValues();
    if (!this.previousAffixTypeValues) {
      this.previousAffixTypeValues = currentValues;
      return;
    }

    const changedKeys = new Set<string>();
    for (const [key, value] of currentValues.entries()) {
      if (this.previousAffixTypeValues.has(key) && this.previousAffixTypeValues.get(key) !== value) {
        changedKeys.add(key);
      }
    }

    this.previousAffixTypeValues = currentValues;
    if (changedKeys.size) {
      this.showRecentlyChangedAffixTypes(changedKeys);
    }
  }

  private getDisplayedAffixTypeValues(): Map<string, number> {
    const values = new Map<string, number>();
    for (const affixName of this.boolAffixNames) {
      const boolAffix = this.boolAffixMap.get(affixName)?.[0];
      if (boolAffix) {
        values.set(this.getDisplayedTypeKey(affixName, boolAffix), boolAffix.value || 0);
      }
    }

    for (const affixName of this.affixNames) {
      for (const type of this.getVisibleTypes(affixName)) {
        values.set(this.getDisplayedTypeKey(affixName, type), type.value || 0);
      }
    }
    return values;
  }

  private showRecentlyChangedAffixTypes(changedKeys: Set<string>) {
    if (this.changedAffixTypesTimeout) {
      clearTimeout(this.changedAffixTypesTimeout);
    }

    this.recentlyChangedAffixTypes = changedKeys;
    this.changedAffixTypesTimeout = setTimeout(() => {
      this.recentlyChangedAffixTypes = new Set<string>();
      this.changedAffixTypesTimeout = null;
    }, RECENT_CHANGE_HIGHLIGHT_MS);
  }

  private refreshTrackedAffixDisplay() {
    const signature = this.getTrackedAffixDisplaySignature();
    if (signature === this.trackedAffixDisplaySignature) {
      return;
    }

    this.trackedAffixDisplaySignature = signature;
    this.trackedAffixGroups = this.buildTrackedAffixGroups();
    this.showAffixTypeHint = this.onboardingActive && this.trackedAffixGroups.some(group => this.getAffixGroupCount(group) > 0);
    this.refreshOnboardingTarget();
  }

  private refreshOnboardingTarget() {
    this.onboardingTargetChipKey = this.showAffixTypeHint ? this.getOnboardingTargetChipKey() : '';
  }

  private getTrackedAffixDisplaySignature(): string {
    const boolAffixes = this.boolAffixNames.map(affixName => {
      const boolAffix = this.boolAffixMap.get(affixName)?.[0];
      return [affixName, boolAffix?.bonusType, boolAffix?.value].join(':');
    });
    const affixes = this.affixNames.map(affixName => {
      const types = (this.affixMap.get(affixName) || [])
        .map(type => [type.bonusType, type.value].join(':'))
        .join(',');
      return affixName + '=' + types;
    });

    return [
      this.onboardingActive ? '1' : '0',
      Array.from(this.collapsedAffixGroups).sort().join(','),
      boolAffixes.join('|'),
      affixes.join('|')
    ].join('\0');
  }
}
