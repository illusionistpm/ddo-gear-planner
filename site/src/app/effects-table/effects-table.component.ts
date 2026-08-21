import { Component, OnDestroy, OnInit, Input, ChangeDetectionStrategy } from '@angular/core';
import { Subscription } from 'rxjs';

import { EquippedService } from '../equipped.service';
import { GearDbService } from '../gear-db.service';
import { AffixService } from '../affix.service';
import { AffixGroupDisplay, groupAffixNames, UTILITY_CHECKLIST_CATEGORY } from '../affix-organization';
import { PlannerOnboardingService } from '../planner-onboarding.service';
import { SuggestionDrawerService } from '../suggestion-drawer/suggestion-drawer.service';

interface TrackedAffixGroupDisplay extends AffixGroupDisplay {
  checklistAffixes: string[];
}

interface TrackedBonusTypeDisplay {
  bonusType: string;
  value: number;
  label: string;
  sourceAffixName: string;
  sourceBonusType: string;
}

const UNIVERSAL_SPELL_POWER_AFFIX = 'Universal Spell Power';
const UNIVERSAL_SPELL_LORE_AFFIX = 'Universal Spell Lore';
const SPELL_POWER_AFFIXES_WITH_UNIVERSAL_COVERAGE = new Set([
  'Acid Spell Power',
  'Alignment Spell Power',
  'Cold Spell Power',
  'Electric Spell Power',
  'Evil Spell Power',
  'Fire Spell Power',
  'Force Spell Power',
  'Light Spell Power',
  'Negative Spell Power',
  'Physical Spell Power',
  'Poison Spell Power',
  'Positive Spell Power',
  'Repair Spell Power',
  'Rust Spell Power',
  'Sonic Spell Power',
  'Untyped Spell Power',
]);
const LORE_AFFIXES_WITH_UNIVERSAL_COVERAGE = new Set([
  'Acid Lore',
  'Alignment Lore',
  'Cold Lore',
  'Evil Lore',
  'Fire Lore',
  'Force Lore',
  'Healing Lore',
  'Kinetic Lore',
  'Light Lore',
  'Lightning Lore',
  'Negative Lore',
  'Physical Lore',
  'Poison Lore',
  'Repair Lore',
  'Rust Lore',
  'Sonic Lore',
  'Untyped Lore',
]);

@Component({
    selector: 'app-effects-table',
    templateUrl: './effects-table.component.html',
    styleUrls: ['./effects-table.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class EffectsTableComponent implements OnInit, OnDestroy {

  public affixMap: Map<string, Array<any>> = new Map<string, Array<any>>();
  public affixNames: Array<string> = [];

  public boolAffixMap: Map<string, Array<any>> = new Map<string, Array<any>>();
  public boolAffixNames: Array<string> = [];

  public sortOrder = ['Equipment', 'Enhancement', 'DUMMY', 'Insight', 'Quality', 'Exceptional', 'Artifact', undefined, 'Penalty'];
  collapsedAffixGroups = new Set<string>();
  hasOpenedAffixType = false;
  private onboardingSubscription?: Subscription;

  @Input() sortOwnedToTop: boolean = true;

  constructor(
    public equipped: EquippedService,
    public gearDB: GearDbService,
    private affixSvc: AffixService,
    private onboarding: PlannerOnboardingService,
    private suggestionDrawer: SuggestionDrawerService
  ) {
    this.affixNames = [];
    this.boolAffixNames = [];
  }

  ngOnInit() {
    this.hasOpenedAffixType = this.onboarding.hasOpenedAffixType();
    this.onboardingSubscription = this.onboarding.getAffixTypeOpened().subscribe(hasOpenedAffixType => {
      this.hasOpenedAffixType = hasOpenedAffixType;
    });

    this.equipped.getCoveredAffixes().subscribe(map => {
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
    });
  }

  ngOnDestroy() {
    this.onboardingSubscription?.unsubscribe();
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
    this.onboarding.markAffixTypeOpened();
    this.suggestionDrawer.openBonusType(affixName, bonusType, this.sortOwnedToTop);
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
      if (type.bonusType !== 'Penalty' && (type.value || this.isBonusTypeAvailable(affixName, type))) {
        typeMap.set(
          this.getTypeMapKey(affixName, type.bonusType),
          this.makeDisplayType(affixName, type.bonusType, type.value)
        );
      }
    }

    for (const bonusType of this.gearDB.getAllLevelTypesForAffix(affixName)) {
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
    return !this.hasOpenedAffixType && this.getTrackedAffixGroups().some(group => this.getAffixGroupCount(group) > 0);
  }

  isOnboardingTargetChip(affixName: string, bonusType: string): boolean {
    return this.shouldShowAffixTypeHint() && this.getOnboardingTargetChipKey() === this.getOnboardingChipKey(affixName, bonusType);
  }

  private getOnboardingTargetChipKey(): string {
    let utilityFallbackChipKey = '';

    for (const group of this.getTrackedAffixGroups()) {
      if (this.isAffixGroupCollapsed(group.name)) {
        continue;
      }

      const groupChipKey = this.getFirstOnboardingChipKeyForGroup(group);
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

  private getFirstOnboardingChipKeyForGroup(group: TrackedAffixGroupDisplay): string {
    for (const affixName of group.checklistAffixes) {
      const boolAffix = this.boolAffixMap.get(affixName)?.[0];
      if (!boolAffix || boolAffix.bonusType === 'Penalty') {
        continue;
      }

      return this.getOnboardingChipKey(affixName, boolAffix.bonusType);
    }

    for (const affixName of group.affixes) {
      for (const type of this.getVisibleTypes(affixName)) {
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
    return 'tracked-affix-section-' + groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  toggleAffixGroup(groupName: string) {
    if (this.collapsedAffixGroups.has(groupName)) {
      this.collapsedAffixGroups.delete(groupName);
    } else {
      this.collapsedAffixGroups.add(groupName);
    }
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
    if (SPELL_POWER_AFFIXES_WITH_UNIVERSAL_COVERAGE.has(affixName)) {
      return [UNIVERSAL_SPELL_POWER_AFFIX];
    }
    if (LORE_AFFIXES_WITH_UNIVERSAL_COVERAGE.has(affixName)) {
      return [UNIVERSAL_SPELL_LORE_AFFIX];
    }
    return [];
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
    return sourceAffixName === UNIVERSAL_SPELL_POWER_AFFIX || sourceAffixName === UNIVERSAL_SPELL_LORE_AFFIX
      ? 'Universal ' + label
      : label;
  }

  private getAllLevelDisplayTypes(affixName: string): TrackedBonusTypeDisplay[] {
    const displayTypes = this.gearDB.getAllLevelTypesForAffix(affixName)
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

  private getOnboardingChipKey(affixName: string, bonusType: string): string {
    return affixName + '\0' + bonusType;
  }
}
