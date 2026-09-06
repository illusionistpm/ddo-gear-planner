import { Component, DoCheck, OnDestroy, OnInit, Input, ChangeDetectionStrategy } from '@angular/core';
import { Subscription } from 'rxjs';

import { EquippedService, AffixSource, TrackedAffixGroupMode } from '../equipped.service';
import { GearDbService } from '../gear-db.service';
import { AffixService, UNIVERSAL_COMPANION_AFFIXES } from '../affix.service';
import { AffixGroupDisplay, getAffixGroupCssClass, groupAffixNames, UTILITY_CHECKLIST_CATEGORY } from '../affix-organization';
import { PlannerOnboardingService } from '../planner-onboarding.service';
import { SuggestionDrawerService } from '../suggestion-drawer/suggestion-drawer.service';
import { AffixBuilderDrawerService } from '../affix-builder-drawer/affix-builder-drawer.service';
import { AffixAvailabilityService, RemainingAvailability } from '../affix-availability.service';

interface TrackedAffixGroupDisplay extends AffixGroupDisplay {
  checklistAffixes: string[];
}

interface SlotGroupChip {
  sourceAffixName: string;
  bonusType: string;
  label: string;
  currentValue: number;
  maxValue: number;
  valueClass: string;
  eliminated: boolean;
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
}

interface TrackedBonusTypeDisplay {
  bonusType: string;
  value: number;
  label: string;
  sourceAffixName: string;
  sourceBonusType: string;
}

const UNIVERSAL_COMPANION_GROUPS = UNIVERSAL_COMPANION_AFFIXES;

@Component({
    selector: 'app-effects-table',
    templateUrl: './effects-table.component.html',
    styleUrls: ['./effects-table.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class EffectsTableComponent implements OnInit, DoCheck, OnDestroy {

  public affixMap: Map<string, Array<any>> = new Map<string, Array<any>>();
  public affixNames: Array<string> = [];

  public boolAffixMap: Map<string, Array<any>> = new Map<string, Array<any>>();
  public boolAffixNames: Array<string> = [];

  public sortOrder = ['Equipment', 'Enhancement', 'DUMMY', 'Insight', 'Quality', 'Exceptional', 'Artifact', undefined, 'Penalty'];
  collapsedAffixGroups = new Set<string>();
  groupMode: TrackedAffixGroupMode = 'category';
  onboardingActive = true;
  trackedAffixGroups: TrackedAffixGroupDisplay[] = [];
  showAffixTypeHint = false;
  onboardingTargetChipKey = '';
  suppliedAffixCounts = new Map<string, number>();
  suppliedSetAffixCounts = new Map<string, number>();
  highlightedEquipmentSlots = new Set<string>();
  highlightedEquipmentSets = new Set<string>();
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
    private affixBuilder: AffixBuilderDrawerService,
    private availability: AffixAvailabilityService
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
      this.affixMap = new Map<string, Array<any>>();
      this.boolAffixMap = new Map<string, Array<any>>();
      this.affixNames = [];
      this.boolAffixNames = [];

      for (const entry of map.entries()) {
        if (this._isBoolAffix(entry)) {
          this.boolAffixMap.set(entry[0], entry[1]);
          this.boolAffixNames.push(entry[0]);
        } else {
          this.affixMap.set(entry[0], entry[1]);
          this.affixNames.push(entry[0]);
        }
      }

      this.updateRecentlyChangedAffixTypes();
      this.refreshSuppliedAffixCounts();
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

  removeAffix(affixName: string) {
    this.equipped.removeImportantAffix(affixName);
  }

  currentBonus(affixName: string) {
    let total = 0;
    for (const type of this.getVisibleTypes(affixName)) {
      total += type.value;
    }
    return total;
  }

  maxBonus(affixName: string) {
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
  isBonusTypeSufficient(affixName: string, type: any): boolean {
    if (!type.value) {
      return false;
    }
    const maxValue = this.getMaxValueForType(affixName, type);
    return maxValue > 0 && type.value >= this.getModerateThreshold(maxValue);
  }

  setGroupMode(mode: TrackedAffixGroupMode) {
    this.equipped.setTrackedAffixGroupMode(mode);
  }

  openBuilder() {
    this.affixBuilder.open('edit');
  }

  /**
   * Tracked bonus types that still need fitting, bucketed by how many places
   * (open gear slots, or a free augment slot) could still supply them — most
   * restricted first. Backs the "Group by: Scarcity" view. Types already covered
   * to the moderate-value threshold are omitted.
   */
  getSlotGroups(): SlotGroup[] {
    const openSlots = this.equipped.getUnlockedSlots();
    const equippedSetCounts = this.equipped.getActiveSets();
    const seen = new Set<string>();
    const buckets = new Map<string, SlotGroup>();
    const bucket = (key: string, label: string, order: number): SlotGroup => {
      let group = buckets.get(key);
      if (!group) {
        group = { key, label, order, rows: [] };
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
        if (this.isBonusTypeSufficient(affixName, type)) {
          continue;
        }
        const sourceAffixName = this.getSourceAffixName(affixName, type);
        const bonusType = this.getSourceBonusType(type);
        if (!bonusType || bonusType === 'Penalty' || bonusType === 'Bool') {
          continue;
        }
        const key = sourceAffixName + '\0' + bonusType;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);

        const info = this.availability.getRemainingAvailability(
          sourceAffixName, bonusType, openSlots, equippedSetCounts,
          this.equipped.getSlotsWithOpenAugmentForAffixType(sourceAffixName, bonusType)
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
          sourceAffixName,
          bonusType,
          label: this.getBonusTypeLabel(type),
          currentValue: type.value || 0,
          maxValue: this.getMaxValueForType(affixName, type),
          valueClass: type.value ? this.getClassForValue(affixName, type) : '',
          eliminated: info.eliminated,
          tooltip: this.getScarcityTooltip(info)
        });
      }
    }

    const groups = Array.from(buckets.values()).sort((a, b) => a.order - b.order);
    for (const group of groups) {
      // Alphabetical within a group, matching the category grouping.
      group.rows.sort((a, b) => a.affixName.localeCompare(b.affixName));
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

  getSourcesForType(affixName: string, type: any): AffixSource[] {
    return this.equipped.getSourcesForAffixType(this.getSourceAffixName(affixName, type), this.getSourceBonusType(type));
  }

  previewAffixTypeEquipment(affixName: string, type: any) {
    const sources = this.getSourcesForType(affixName, type);
    this.highlightedEquipmentSlots = new Set(
      sources.filter(source => source.kind === 'item').map(source => source.slot)
    );
    this.highlightedEquipmentSets = new Set(
      sources.filter(source => source.kind === 'set').map(source => source.itemName)
    );
  }

  clearAffixTypeEquipmentPreview() {
    this.highlightedEquipmentSlots = new Set<string>();
    this.highlightedEquipmentSets = new Set<string>();
  }

  private refreshSuppliedAffixCounts() {
    const counts = new Map<string, number>();
    for (const slot of this.equipped.getSlotNames()) {
      counts.set(slot, this.countSuppliedAffixes(source => source.kind === 'item' && source.slot === slot));
    }
    this.suppliedAffixCounts = counts;

    const setCounts = new Map<string, number>();
    for (const [setName] of this.equipped.getActiveSetBonuses()) {
      const count = this.countSuppliedAffixes(source => source.kind === 'set' && source.itemName === setName);
      if (count > 0) {
        setCounts.set(setName, count);
      }
    }
    this.suppliedSetAffixCounts = setCounts;
  }

  private countSuppliedAffixes(predicate: (source: AffixSource) => boolean): number {
    const supplied = new Set<string>();
    for (const group of this.getTrackedAffixGroups()) {
      for (const affixName of group.checklistAffixes) {
        const boolAffix = this.boolAffixMap.get(affixName)?.[0];
        if (boolAffix && this.getSourcesForType(affixName, boolAffix).some(predicate)) {
          supplied.add(affixName + '\0' + boolAffix.bonusType);
        }
      }

      for (const affixName of group.affixes) {
        for (const type of this.getVisibleTypes(affixName)) {
          if (this.getSourcesForType(affixName, type).some(predicate)) {
            supplied.add(this.getSourceAffixName(affixName, type) + '\0' + this.getSourceBonusType(type));
          }
        }
      }
    }
    return supplied.size;
  }

  sortTypes(affixName: string) {
    const types = this.affixMap.get(affixName) || [];
    return this.sortTypeList(types);
  }

  private sortTypeList<T extends { bonusType: string; label?: string; sourceAffixName?: string }>(types: Array<T>) {
    return types.sort((a, b) => {
      let aIndex = this.sortOrder.indexOf(a.bonusType);
      if (aIndex === -1) {
        aIndex = this.sortOrder.indexOf('DUMMY');
      }

      let bIndex = this.sortOrder.indexOf(b.bonusType);
      if (bIndex === -1) {
        bIndex = this.sortOrder.indexOf('DUMMY');
      }

      const diff = aIndex - bIndex;
      if (diff !== 0) {
        return diff;
      }

      const affixDiff = (a.sourceAffixName || '').localeCompare(b.sourceAffixName || '');
      if (affixDiff !== 0) {
        return affixDiff;
      }

      return (a.label || a.bonusType).localeCompare(b.label || b.bonusType);
    });
  }

  isBonusTypeAvailable(affixName: string, type: any): boolean {
    return this.gearDB.getBestValueForAffixType(this.getSourceAffixName(affixName, type), this.getSourceBonusType(type)) > 0;
  }

  isBonusTypeUnavailableAtCurrentLevelRange(affixName: string, type: any): boolean {
    return !this.isBonusTypeAvailable(affixName, type);
  }

  shouldShowMaxAvailable(affixName: string, type: any): boolean {
    return this.gearDB.getBestValueForAffixType(this.getSourceAffixName(affixName, type), this.getSourceBonusType(type)) > 0;
  }

  getVisibleTypes(affixName: string): TrackedBonusTypeDisplay[] {
    const currentTypes = this.affixMap.get(affixName) || [];
    const typeMap = new Map<string, TrackedBonusTypeDisplay>();

    for (const type of currentTypes) {
      if (this.isUniversalCompanionOnlyBonusType(affixName, type.bonusType)) {
        continue;
      }
      if (type.bonusType !== 'Penalty' && (type.value || this.isBonusTypeAvailable(affixName, type))) {
        typeMap.set(
          this.getTypeMapKey(affixName, type.bonusType),
          this.makeDisplayType(affixName, type.bonusType, type.value)
        );
      }
    }

    for (const bonusType of this.gearDB.getAllLevelTypesForAffix(affixName)) {
      if (this.isUniversalCompanionOnlyBonusType(affixName, bonusType)) {
        continue;
      }
      const type = { bonusType, value: 0 };
      const key = this.getTypeMapKey(affixName, bonusType);
      if (bonusType !== 'Penalty' && !typeMap.has(key) && this.isBonusTypeAvailable(affixName, type)) {
        typeMap.set(key, this.makeDisplayType(affixName, bonusType, 0));
      }
    }

    for (const sourceAffixName of this.getUniversalCompanionAffixes(affixName)) {
      for (const bonusType of this.gearDB.getAllLevelTypesForAffix(sourceAffixName)) {
        const type = {
          bonusType,
          value: this.equipped.getCurrentValueForAffixType(sourceAffixName, bonusType),
          sourceAffixName,
          sourceBonusType: bonusType,
        };
        const key = this.getTypeMapKey(sourceAffixName, bonusType);
        if (bonusType !== 'Penalty' && !typeMap.has(key) && (type.value || this.isBonusTypeAvailable(affixName, type))) {
          typeMap.set(key, this.makeDisplayType(sourceAffixName, bonusType, type.value));
        }
      }
    }

    return this.sortTypeList(Array.from(typeMap.values()));
  }

  getUnavailableTypes(affixName: string) {
    const currentTypesWithValue = new Set(
      this.getVisibleTypes(affixName)
        .filter(type => type.value)
        .map(type => this.getTypeMapKey(type.sourceAffixName, type.sourceBonusType))
    );

    const unavailableTypes = this.getAllLevelDisplayTypes(affixName)
      .filter(bonusType =>
        bonusType.sourceBonusType !== 'Penalty' &&
        !currentTypesWithValue.has(this.getTypeMapKey(bonusType.sourceAffixName, bonusType.sourceBonusType)) &&
        !this.isBonusTypeAvailable(affixName, bonusType)
      )
      .map(bonusType => bonusType.label);

    return this.sortTypeList(unavailableTypes.map(bonusType => ({ bonusType, label: bonusType, value: 0 })))
      .map(type => type.label || type.bonusType);
  }

  getBonusTypeTooltip(affixName: string, type: any): string {
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
    const groups = this.getAffixGroups().map(group => ({
      ...group,
      checklistAffixes: [] as string[]
    }));
    const checklistAffixes = this.getFilteredBoolAffixNames();
    if (!checklistAffixes.length) {
      return groups;
    }

    const utilityGroup = groups.find(group => group.name === UTILITY_CHECKLIST_CATEGORY);
    if (utilityGroup) {
      utilityGroup.checklistAffixes = checklistAffixes;
      return groups;
    }

    const utilityIndex = groups.findIndex(group => group.name === 'Immunities' || group.name === 'Other');
    const insertIndex = utilityIndex >= 0 ? utilityIndex : groups.length;
    groups.splice(insertIndex, 0, {
      name: UTILITY_CHECKLIST_CATEGORY,
      affixes: [],
      checklistAffixes
    });
    return groups;
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
    return this.shouldShowAffixTypeHint() && this.onboardingTargetChipKey === this.getOnboardingChipKey(affixName, bonusType);
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

      return this.getOnboardingChipKey(affixName, boolAffix.bonusType);
    }

    for (const affixName of group.affixes) {
      for (const type of this.getVisibleTypes(affixName)) {
        if (preferMissingValue && type.value) {
          continue;
        }

        const chipAffixName = this.getSourceAffixName(affixName, type);
        const chipBonusType = this.getSourceBonusType(type);
        return this.getOnboardingChipKey(chipAffixName, chipBonusType);
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

  private _isBoolAffix(entry: [string, Array<any>]) {
    return entry[1].length === 1 && entry[1][0].bonusType === 'Bool';
  }

  private getModerateThreshold(maxValue: number): number {
    return maxValue * 3 / 4;
  } 

  getClassForValue(affixName: string, type: any) {
    if (type.bonusType === 'Penalty') {
      return 'penalty-value';
    }

    const maxValue = this.gearDB.getBestValueForAffixType(this.getSourceAffixName(affixName, type), this.getSourceBonusType(type));

    if (type.value >= maxValue) {
      return 'max-value';
    } else if (type.value >= this.getModerateThreshold(maxValue)) {
      return 'mid-value';
    } else {
      return 'low-value';
    }
  }

  getValueTooltip(affixName: string, type: any): string {
    if (type.bonusType === 'Penalty') {
      return 'Penalty effect';
    }

    const maxValue = this.gearDB.getBestValueForAffixType(this.getSourceAffixName(affixName, type), this.getSourceBonusType(type));
    const shortBy = maxValue - type.value;

    if (maxValue === 0) {
      return 'No gear with this bonus type is available in the current level range.';
    }

    if (type.value >= maxValue) {
      return 'Best possible value';
    } else if (type.value >= this.getModerateThreshold(maxValue)) {
      return `Moderate value (${shortBy} below max)`;
    } else {
      return `Low value (${shortBy} below max)`;
    }
  }

  getBonusTypeLabel(type: any): string {
    return type.label || (type.bonusType ? type.bonusType : 'Untyped');
  }

  trackAffixGroup(index: number, group: TrackedAffixGroupDisplay): string {
    return group.name;
  }

  trackSlotGroup(index: number, group: SlotGroup): string {
    return group.key;
  }

  trackVisibleType(index: number, type: any): string {
    return (type.sourceAffixName || '') + '\0' + (type.sourceBonusType || type.bonusType);
  }

  isRecentlyChangedAffixType(affixName: string, type: any): boolean {
    return this.recentlyChangedAffixTypes.has(this.getDisplayedTypeKey(affixName, type));
  }

  getSourceAffixName(affixName: string, type: any): string {
    return type.sourceAffixName || affixName;
  }

  getSourceBonusType(type: any): string {
    return type.sourceBonusType || type.bonusType;
  }

  getMaxValueForType(affixName: string, type: any): number {
    return this.gearDB.getBestValueForAffixType(this.getSourceAffixName(affixName, type), this.getSourceBonusType(type));
  }

  private getUniversalCompanionAffixes(affixName: string): string[] {
    return UNIVERSAL_COMPANION_GROUPS.filter(groupName => this.affixSvc.isGroupMember(affixName, groupName));
  }

  /**
   * A bonus type that only reaches this per-element affix by ungrouping a
   * universal companion affix (e.g. "Implement" on "Cold Spell Power"). It is
   * already rendered as a "Universal <type>" companion row, so the plain
   * per-element row for it would be a duplicate.
   */
  private isUniversalCompanionOnlyBonusType(affixName: string, bonusType: string): boolean {
    return this.gearDB.isBonusTypeOnlyFromUniversalCompanion(affixName, bonusType);
  }

  private makeDisplayType(sourceAffixName: string, bonusType: string, value: number): TrackedBonusTypeDisplay {
    return {
      bonusType,
      value,
      label: this.getDisplayTypeLabel(sourceAffixName, bonusType),
      sourceAffixName,
      sourceBonusType: bonusType,
    };
  }

  private getDisplayTypeLabel(sourceAffixName: string, bonusType: string): string {
    const label = bonusType ? bonusType : 'Untyped';
    return UNIVERSAL_COMPANION_GROUPS.includes(sourceAffixName)
      ? 'Universal ' + label
      : label;
  }

  private getAllLevelDisplayTypes(affixName: string): TrackedBonusTypeDisplay[] {
    const displayTypes = this.gearDB.getAllLevelTypesForAffix(affixName)
      .filter(bonusType => !this.isUniversalCompanionOnlyBonusType(affixName, bonusType))
      .map(bonusType => this.makeDisplayType(affixName, bonusType, 0));

    for (const sourceAffixName of this.getUniversalCompanionAffixes(affixName)) {
      for (const bonusType of this.gearDB.getAllLevelTypesForAffix(sourceAffixName)) {
        displayTypes.push(this.makeDisplayType(sourceAffixName, bonusType, 0));
      }
    }

    return displayTypes;
  }

  private getTypeMapKey(sourceAffixName: string, bonusType: string): string {
    return sourceAffixName + '\0' + bonusType;
  }

  private getDisplayedTypeKey(affixName: string, type: any): string {
    return this.getTypeMapKey(this.getSourceAffixName(affixName, type), this.getSourceBonusType(type));
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
    }, 1900);
  }

  private getOnboardingChipKey(affixName: string, bonusType: string): string {
    return affixName + '\0' + bonusType;
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
        .map(type => [type.bonusType, type.value, type.sourceAffixName, type.sourceBonusType].join(':'))
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
