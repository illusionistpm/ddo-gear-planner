import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { EquippedService } from './equipped.service';
import { GearDbService } from './gear-db.service';
import { AffixService } from './affix.service';
import { AffixGroupDisplay, groupAffixNames, UTILITY_CHECKLIST_CATEGORY } from './affix-organization';

const UNIVERSAL_SPELL_POWER_AFFIX = 'Universal Spell Power';
const UNIVERSAL_SPELL_LORE_AFFIX = 'Universal Spell Lore';
const UNIVERSAL_SPELL_CRITICAL_DAMAGE_AFFIX = 'Universal Spell Critical Damage';
const UNIVERSAL_COMPANION_GROUPS = [
  UNIVERSAL_SPELL_POWER_AFFIX,
  UNIVERSAL_SPELL_LORE_AFFIX,
  UNIVERSAL_SPELL_CRITICAL_DAMAGE_AFFIX,
];

export interface SummaryBonusBadge {
  label: string;
  code: string;
  value: number;
  maxValue: number;
  qualityClass: string;
  tooltip: string;
  sourceAffixName: string;
  sourceBonusType: string;
}

export interface SummaryAffix {
  name: string;
  isChecklist: boolean;
  checked: boolean;
  badges: SummaryBonusBadge[];
  currentTotal: number;
  maxTotal: number;
}

export interface SummaryGroup {
  name: string;
  affixes: SummaryAffix[];
  count: number;
}

interface DisplayType {
  bonusType: string;
  value: number;
  label: string;
  sourceAffixName: string;
  sourceBonusType: string;
}

/**
 * Produces a compact, grouped view of the tracked ("important") affixes and how
 * well the equipped gear covers each bonus type. Shares the bonus-type
 * derivation rules used by the full Tracked Affixes table so the compact
 * equipment-tab sidebar stays in agreement with it.
 */
@Injectable({
  providedIn: 'root'
})
export class TrackedAffixSummaryService {
  private readonly sortOrder = ['Equipment', 'Enhancement', 'DUMMY', 'Insight', 'Quality', 'Exceptional', 'Artifact', undefined, 'Penalty'];

  private static readonly BONUS_TYPE_CODES: Record<string, string> = {
    'Equipment': 'Eq',
    'Enhancement': 'En',
    'Insight': 'Ins',
    'Quality': 'Ql',
    'Exceptional': 'Ex',
    'Artifact': 'Art',
    'Profane': 'Prf',
    'Sacred': 'Sac',
    'Competence': 'Cmp',
    'Resistance': 'Res',
    'Deflection': 'Dfl',
    'Determination': 'Det',
    'Natural': 'Nat',
    'Luck': 'Lck',
    'Legendary': 'Leg',
    'Epic': 'Epc',
    'Alchemical': 'Alc',
    'Primal': 'Prm',
    'Vitality': 'Vit',
    'Psionic': 'Psi',
    'Adamantine': 'Adm',
    'Armor': 'Arm',
    'Shield': 'Shl',
    'Implement': 'Imp',
    'Orb': 'Orb',
    'Penalty': 'Pen',
    'Chaotic': 'Cha',
    'Lawful': 'Law',
    'Evil': 'Evl',
    'Good': 'Gd',
    'Piercing': 'Prc',
    'Slashing': 'Sls',
    'Bludgeoning': 'Bld',
    'Sneak Attack': 'SnA',
  };

  constructor(
    private equipped: EquippedService,
    private gearDB: GearDbService,
    private affixSvc: AffixService
  ) {}

  getSummaryGroups(): Observable<SummaryGroup[]> {
    return this.equipped.getCoveredAffixes().pipe(map(covered => this.buildGroups(covered)));
  }

  private buildGroups(covered: Map<string, Array<any>>): SummaryGroup[] {
    const affixMap = new Map<string, Array<any>>();
    const boolAffixMap = new Map<string, Array<any>>();
    const affixNames: string[] = [];
    const boolAffixNames: string[] = [];

    for (const entry of covered.entries()) {
      if (this.isBoolAffix(entry)) {
        boolAffixMap.set(entry[0], entry[1]);
        boolAffixNames.push(entry[0]);
      } else {
        affixMap.set(entry[0], entry[1]);
        affixNames.push(entry[0]);
      }
    }
    boolAffixNames.sort((left, right) => left.localeCompare(right));

    const groups = this.buildTrackedAffixGroups(affixNames, boolAffixNames);

    return groups
      .map(group => {
        const affixes: SummaryAffix[] = [];

        for (const affixName of group.checklistAffixes) {
          const boolAffix = boolAffixMap.get(affixName)?.[0];
          if (!boolAffix || boolAffix.bonusType === 'Penalty') {
            continue;
          }
          affixes.push({
            name: affixName,
            isChecklist: true,
            checked: !!boolAffix.value,
            badges: [{
              label: 'Checklist',
              code: boolAffix.value ? '✓' : '–',
              value: boolAffix.value ? 1 : 0,
              maxValue: 1,
              qualityClass: boolAffix.value ? 'max-value' : 'no-value',
              tooltip: boolAffix.value ? `${affixName}: covered` : `${affixName}: not covered`,
              sourceAffixName: affixName,
              sourceBonusType: boolAffix.bonusType
            }],
            currentTotal: boolAffix.value ? 1 : 0,
            maxTotal: 1
          });
        }

        for (const affixName of group.affixes) {
          const types = this.getVisibleTypes(affixMap, affixName);
          const badges = types.map(type => this.makeBadge(type));
          affixes.push({
            name: affixName,
            isChecklist: false,
            checked: false,
            badges,
            currentTotal: badges.reduce((total, badge) => total + badge.value, 0),
            maxTotal: badges.reduce((total, badge) => total + Math.max(0, badge.maxValue), 0)
          });
        }

        return { name: group.name, affixes, count: affixes.length };
      })
      .filter(group => group.count > 0);
  }

  private makeBadge(type: DisplayType): SummaryBonusBadge {
    const maxValue = this.gearDB.getBestValueForAffixType(type.sourceAffixName, type.sourceBonusType);
    return {
      label: type.label,
      code: this.abbreviateBonusType(type.label),
      value: type.value,
      maxValue,
      qualityClass: this.getClassForValue(type, maxValue),
      tooltip: this.getBadgeTooltip(type, maxValue),
      sourceAffixName: type.sourceAffixName,
      sourceBonusType: type.sourceBonusType
    };
  }

  /**
   * A short, human-recognisable code for a bonus type, e.g. "Equipment" -> "Eq",
   * "Insight" -> "Ins", "Universal Enhancement" -> "uEn", "Artifact Natural" ->
   * "ArtN". Common DDO bonus types get a curated code; anything unrecognised
   * falls back to the leading letters of each word.
   */
  abbreviateBonusType(label: string): string {
    if (!label) {
      return 'Un';
    }

    let prefix = '';
    let rest = label;
    if (rest.startsWith('Universal ')) {
      prefix = 'u';
      rest = rest.slice('Universal '.length);
    }

    if (rest === '-' || rest === 'Untyped' || rest === '') {
      return prefix + 'Un';
    }

    const curated = TrackedAffixSummaryService.BONUS_TYPE_CODES[rest];
    if (curated) {
      return prefix + curated;
    }

    const words = rest.split(/\s+/).filter(Boolean);
    const shorten = (word: string) => word.length <= 3 ? word : word[0].toUpperCase() + word.slice(1, 3).toLowerCase();
    if (words.length === 1) {
      return prefix + shorten(words[0]);
    }
    return prefix + shorten(words[0]) + words.slice(1).map(word => word[0].toUpperCase()).join('');
  }

  private getBadgeTooltip(type: DisplayType, maxValue: number): string {
    if (type.bonusType === 'Penalty') {
      return `${type.label}: penalty`;
    }
    if (maxValue <= 0) {
      return `${type.label}: no gear available in the current level range`;
    }
    // Match the "current/max" convention used on the Tracked Affixes page
    // (e.g. "0/30") instead of a "+N" / "none" style unique to this tooltip.
    return `${type.label}: ${type.value || 0}/${maxValue}`;
  }

  private getClassForValue(type: DisplayType, maxValue: number): string {
    if (type.bonusType === 'Penalty') {
      return 'penalty-value';
    }
    if (!type.value) {
      return 'no-value';
    }
    if (type.value >= maxValue) {
      return 'max-value';
    }
    if (type.value >= maxValue * 3 / 4) {
      return 'mid-value';
    }
    return 'low-value';
  }

  private isBoolAffix(entry: [string, Array<any>]): boolean {
    return entry[1].length === 1 && entry[1][0].bonusType === 'Bool';
  }

  private buildTrackedAffixGroups(affixNames: string[], boolAffixNames: string[]): Array<AffixGroupDisplay & { checklistAffixes: string[] }> {
    const groups = groupAffixNames(affixNames, '', this.affixSvc).map(group => ({
      ...group,
      checklistAffixes: [] as string[]
    }));

    if (!boolAffixNames.length) {
      return groups;
    }

    const utilityGroup = groups.find(group => group.name === UTILITY_CHECKLIST_CATEGORY);
    if (utilityGroup) {
      utilityGroup.checklistAffixes = boolAffixNames;
      return groups;
    }

    const utilityIndex = groups.findIndex(group => group.name === 'Immunities' || group.name === 'Other');
    const insertIndex = utilityIndex >= 0 ? utilityIndex : groups.length;
    groups.splice(insertIndex, 0, {
      name: UTILITY_CHECKLIST_CATEGORY,
      affixes: [],
      checklistAffixes: boolAffixNames
    });
    return groups;
  }

  private getVisibleTypes(affixMap: Map<string, Array<any>>, affixName: string): DisplayType[] {
    const currentTypes = affixMap.get(affixName) || [];
    const typeMap = new Map<string, DisplayType>();

    for (const type of currentTypes) {
      if (type.bonusType !== 'Penalty' && (type.value || this.isBonusTypeAvailable(type.bonusType, type.value, affixName))) {
        typeMap.set(
          this.getTypeMapKey(affixName, type.bonusType),
          this.makeDisplayType(affixName, type.bonusType, type.value)
        );
      }
    }

    for (const bonusType of this.gearDB.getAllLevelTypesForAffix(affixName)) {
      const key = this.getTypeMapKey(affixName, bonusType);
      if (bonusType !== 'Penalty' && !typeMap.has(key) && this.isBonusTypeAvailable(bonusType, 0, affixName)) {
        typeMap.set(key, this.makeDisplayType(affixName, bonusType, 0));
      }
    }

    for (const sourceAffixName of this.getUniversalCompanionAffixes(affixName)) {
      for (const bonusType of this.gearDB.getAllLevelTypesForAffix(sourceAffixName)) {
        const value = this.equipped.getCurrentValueForAffixType(sourceAffixName, bonusType);
        const key = this.getTypeMapKey(sourceAffixName, bonusType);
        if (bonusType !== 'Penalty' && !typeMap.has(key) && (value || this.isBonusTypeAvailable(bonusType, value, sourceAffixName))) {
          typeMap.set(key, this.makeDisplayType(sourceAffixName, bonusType, value));
        }
      }
    }

    return this.sortTypeList(Array.from(typeMap.values()));
  }

  private isBonusTypeAvailable(bonusType: string, _value: number, sourceAffixName: string): boolean {
    return this.gearDB.getBestValueForAffixType(sourceAffixName, bonusType) > 0;
  }

  private makeDisplayType(sourceAffixName: string, bonusType: string, value: number): DisplayType {
    const label = bonusType ? bonusType : 'Untyped';
    return {
      bonusType,
      value,
      label: UNIVERSAL_COMPANION_GROUPS.includes(sourceAffixName) ? 'Universal ' + label : label,
      sourceAffixName,
      sourceBonusType: bonusType
    };
  }

  private getUniversalCompanionAffixes(affixName: string): string[] {
    return UNIVERSAL_COMPANION_GROUPS.filter(groupName => this.affixSvc.isGroupMember(affixName, groupName));
  }

  private getTypeMapKey(sourceAffixName: string, bonusType: string): string {
    return sourceAffixName + '\0' + bonusType;
  }

  private sortTypeList(types: DisplayType[]): DisplayType[] {
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
      const affixDiff = a.sourceAffixName.localeCompare(b.sourceAffixName);
      if (affixDiff !== 0) {
        return affixDiff;
      }
      return (a.label || a.bonusType).localeCompare(b.label || b.bonusType);
    });
  }
}
