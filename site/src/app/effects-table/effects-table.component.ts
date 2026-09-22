import { Component, DoCheck, OnDestroy, OnInit, Input, ChangeDetectionStrategy } from '@angular/core';
import { Subscription } from 'rxjs';

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

interface SlotGroupChip {
  sourceAffixName: string;
  bonusType: string;
  label: string;
  currentValue: number;
  maxValue: number;
  valueClass: string;
  eliminated: boolean;
  ignored: boolean;
  tooltip: string;
}

interface SlotGroupRow {
  affixName: string;
  chips: SlotGroupChip[];
}

interface SlotGroup {
  key: string;
  label: string;
  order: number;
  rows: SlotGroupRow[];
  checklistAffixes: string[];
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

  @Input() sortOwnedToTop: boolean = true;

  constructor(
    public equipped: EquippedService,
    public gearDB: GearDbService,
    private affixSvc: AffixService,
    private onboarding: PlannerOnboardingService,
    private suggestionDrawer: SuggestionDrawerService,
    private availability: AffixAvailabilityService,
    private derivation: TrackedAffixDerivationService
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
    });
  }

  ngOnDestroy() {
    this.onboardingSubscription?.unsubscribe();
    this.coveredAffixesSubscription?.unsubscribe();
    this.viewStateSubscription?.unsubscribe();
    if (this.changedAffixTypesTimeout) {
      clearTimeout(this.changedAffixTypesTimeout);
    }
  }

  ngDoCheck() {
    this.refreshTrackedAffixDisplay();
  }

  isDerivedTrackedAffix(affixName: string) {
    return this.equipped.isDerivedTrackedAffix(affixName);
  }

  removeAffix(affixName: string) {
    this.equipped.removeImportantAffix(affixName);
  }

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
    const openSlots = this.equipped.getUnlockedSlots();
    const equippedSetCounts = this.equipped.getActiveSets();
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

    for (const affixName of this.affixNames) {
      for (const type of this.getVisibleTypes(affixName)) {
        const sourceAffixName = this.getSourceAffixName(affixName, type);
        const bonusType = this.getSourceBonusType(type);
        if (!bonusType || bonusType === 'Penalty' || bonusType === 'Bool') {
          continue;
        }
        const key = affixTypeKey(sourceAffixName, bonusType);
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);

        if (this.isBonusTypeSufficient(affixName, type)) {
          rowFor(bucket('fulfilled', 'Fulfilled', 100), affixName).chips.push({
            sourceAffixName,
            bonusType,
            label: this.getBonusTypeLabel(type),
            currentValue: type.value || 0,
            maxValue: this.getMaxValueForType(affixName, type),
            valueClass: this.getClassForValue(affixName, type),
            eliminated: false,
            ignored: false,
            tooltip: this.getValueTooltip(affixName, type)
          });
          continue;
        }

        if (this.equipped.isAffixTypeIgnored(sourceAffixName, bonusType)) {
          rowFor(bucket('ignored', 'Ignored', 90), affixName).chips.push({
            sourceAffixName,
            bonusType,
            label: this.getBonusTypeLabel(type),
            currentValue: type.value || 0,
            maxValue: this.getMaxValueForType(affixName, type),
            valueClass: '',
            eliminated: false,
            ignored: true,
            tooltip: 'Marked as ignored'
          });
          continue;
        }

        const info = this.availability.getRemainingAvailability(
          sourceAffixName, bonusType, openSlots, equippedSetCounts,
          this.equipped.getSlotsWithOpenAugmentForAffixType(sourceAffixName, bonusType)
        );

        let group: SlotGroup;
        if (info.eliminated) {
          group = bucket('ruled-out', 'Ruled out by gear', 99);
        } else if (info.tier === 'unavailable') {
          continue;
        } else if (sourceAffixName === MAX_FILIGREE_SLOTS_AFFIX) {
          // The artifact you wear shapes the rest of the build, so it sits above everything else.
          group = bucket('minor-artifact', 'Minor Artifact', -1);
        } else if (info.tier === 'set-only') {
          group = bucket('set-only', 'Set only', 0);
        } else if (info.slotCount >= 5) {
          group = bucket('5plus', '5+ open slots', 5);
        } else {
          group = bucket(
            String(info.slotCount),
            `${info.slotCount} open slot${info.slotCount === 1 ? '' : 's'}`,
            info.slotCount
          );
        }

        rowFor(group, affixName).chips.push({
          sourceAffixName,
          bonusType,
          label: this.getBonusTypeLabel(type),
          currentValue: type.value || 0,
          maxValue: this.getMaxValueForType(affixName, type),
          valueClass: type.value ? this.getClassForValue(affixName, type) : '',
          eliminated: info.eliminated,
          ignored: false,
          tooltip: this.getScarcityTooltip(info)
        });
      }
    }

    for (const affixName of this.boolAffixNames) {
      const boolAffix = this.boolAffixMap.get(affixName)?.[0];
      if (!boolAffix || boolAffix.bonusType === 'Penalty') {
        continue;
      }
      const bonusType = boolAffix.bonusType;
      const key = affixTypeKey(affixName, bonusType);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      if (boolAffix.value) {
        bucket('fulfilled', 'Fulfilled', 100).checklistAffixes.push(affixName);
        continue;
      }

      if (this.equipped.isAffixTypeIgnored(affixName, bonusType)) {
        rowFor(bucket('ignored', 'Ignored', 90), affixName).chips.push({
          sourceAffixName: affixName,
          bonusType,
          label: 'Checklist',
          currentValue: 0,
          maxValue: 0,
          valueClass: '',
          eliminated: false,
          ignored: true,
          tooltip: 'Marked as ignored'
        });
        continue;
      }

      const info = this.availability.getRemainingAvailability(
        affixName, bonusType, openSlots, equippedSetCounts,
        this.equipped.getSlotsWithOpenAugmentForAffixType(affixName, bonusType)
      );

      let group: SlotGroup;
      if (info.eliminated) {
        group = bucket('ruled-out', 'Ruled out by gear', 99);
      } else if (info.tier === 'set-only') {
        group = bucket('set-only', 'Set only', 0);
      } else if (info.tier === 'unavailable') {
        continue;
      } else if (info.slotCount >= 5) {
        group = bucket('5plus', '5+ open slots', 5);
      } else {
        group = bucket(
          String(info.slotCount),
          `${info.slotCount} open slot${info.slotCount === 1 ? '' : 's'}`,
          info.slotCount
        );
      }

      rowFor(group, affixName).chips.push({
        sourceAffixName: affixName,
        bonusType,
        label: 'Checklist',
        currentValue: 0,
        maxValue: 0,
        valueClass: '',
        eliminated: info.eliminated,
        ignored: false,
        tooltip: this.getScarcityTooltip(info)
      });
    }

    const groups = Array.from(buckets.values()).sort((a, b) => a.order - b.order);
    for (const group of groups) {
      // Alphabetical within a group, matching the category grouping.
      group.rows.sort((a, b) => a.affixName.localeCompare(b.affixName));
      group.checklistAffixes.sort((a, b) => a.localeCompare(b));
    }
    return groups;
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

  shouldShowMaxAvailable(affixName: string, type: TrackedBonusTypeSource): boolean {
    return this.gearDB.getBestValueForAffixType(this.getSourceAffixName(affixName, type), this.getSourceBonusType(type)) > 0;
  }

  getVisibleTypes(affixName: string): TrackedBonusTypeDisplay[] {
    return this.derivation.getVisibleTypes(this.affixMap, affixName);
  }

  getUnavailableTypes(affixName: string) {
    const currentTypesWithValue = new Set(
      this.getVisibleTypes(affixName)
        .filter(type => type.value)
        .map(type => affixTypeKey(type.sourceAffixName, type.sourceBonusType))
    );

    const unavailableTypes = this.derivation.getAllLevelDisplayTypes(affixName)
      .filter(bonusType =>
        bonusType.sourceBonusType !== 'Penalty' &&
        !currentTypesWithValue.has(affixTypeKey(bonusType.sourceAffixName, bonusType.sourceBonusType)) &&
        !this.isBonusTypeAvailable(affixName, bonusType)
      )
      .map(bonusType => bonusType.label);

    return sortBonusTypes(unavailableTypes.map(bonusType => ({ bonusType, label: bonusType, value: 0 })))
      .map(type => type.label || type.bonusType);
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

  /** The single covered entry of a checklist affix. */
  getChecklistType(affixName: string): CoveredBonusType {
    return this.boolAffixMap.get(affixName)?.[0] ?? { bonusType: 'Bool', value: 0 };
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

  trackSlotChip(index: number, chip: SlotGroupChip): string {
    return affixTypeKey(chip.sourceAffixName, chip.bonusType);
  }

  trackVisibleType(index: number, type: TrackedBonusTypeSource): string {
    return affixTypeKey(type.sourceAffixName || '', type.sourceBonusType || type.bonusType);
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
