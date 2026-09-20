import { Injectable } from '@angular/core';

import { AffixService, UNIVERSAL_COMPANION_AFFIXES } from './affix.service';
import { EquippedService } from '../planner/equipped.service';
import { GearDbService } from '../gear/gear-db.service';
import { CoveredBonusType, sortBonusTypes, TrackedBonusTypeDisplay } from './tracked-affix-derivation';
import { affixTypeKey } from './affix-type-key';
import { getCountAffixChipLabel } from './count-affix';

/**
 * Decides which bonus types a tracked affix shows, for both the full Tracked
 * Affixes table and the compact equipment-tab summary. The pure half of these
 * rules is in tracked-affix-derivation.ts.
 */
@Injectable({
  providedIn: 'root'
})
export class TrackedAffixDerivationService {
  constructor(
    private equipped: EquippedService,
    private gearDB: GearDbService,
    private affixSvc: AffixService
  ) {}

  /**
   * The bonus types to show for one tracked affix: those it currently has or
   * could get in the level range, plus a "Universal <type>" row for each
   * universal companion affix it belongs to. Penalties are excluded.
   */
  getVisibleTypes(affixMap: Map<string, CoveredBonusType[]>, affixName: string): TrackedBonusTypeDisplay[] {
    const currentTypes = affixMap.get(affixName) || [];
    const typeMap = new Map<string, TrackedBonusTypeDisplay>();

    for (const type of currentTypes) {
      if (this.isUniversalCompanionOnlyBonusType(affixName, type.bonusType)) {
        continue;
      }
      if (type.bonusType !== 'Penalty' && (type.value || this.isBonusTypeAvailable(affixName, type.bonusType))) {
        typeMap.set(
          affixTypeKey(affixName, type.bonusType),
          this.makeDisplayType(affixName, type.bonusType, type.value)
        );
      }
    }

    for (const bonusType of this.gearDB.getAllLevelTypesForAffix(affixName)) {
      if (this.isUniversalCompanionOnlyBonusType(affixName, bonusType)) {
        continue;
      }
      const key = affixTypeKey(affixName, bonusType);
      if (bonusType !== 'Penalty' && !typeMap.has(key) && this.isBonusTypeAvailable(affixName, bonusType)) {
        typeMap.set(key, this.makeDisplayType(affixName, bonusType, 0));
      }
    }

    for (const sourceAffixName of this.getUniversalCompanionAffixes(affixName)) {
      for (const bonusType of this.gearDB.getAllLevelTypesForAffix(sourceAffixName)) {
        const value = this.equipped.getCurrentValueForAffixType(sourceAffixName, bonusType);
        const key = affixTypeKey(sourceAffixName, bonusType);
        if (bonusType !== 'Penalty' && !typeMap.has(key) && (value || this.isBonusTypeAvailable(sourceAffixName, bonusType))) {
          typeMap.set(key, this.makeDisplayType(sourceAffixName, bonusType, value));
        }
      }
    }

    return sortBonusTypes(Array.from(typeMap.values()));
  }

  /**
   * Every bonus type the affix can have at any level, as display types, with
   * the same universal-companion handling as getVisibleTypes.
   */
  getAllLevelDisplayTypes(affixName: string): TrackedBonusTypeDisplay[] {
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

  makeDisplayType(sourceAffixName: string, bonusType: string, value: number): TrackedBonusTypeDisplay {
    const label = getCountAffixChipLabel(sourceAffixName) ?? (bonusType ? bonusType : 'Untyped');
    return {
      bonusType,
      value,
      label: UNIVERSAL_COMPANION_AFFIXES.includes(sourceAffixName) ? 'Universal ' + label : label,
      sourceAffixName,
      sourceBonusType: bonusType,
    };
  }

  private isBonusTypeAvailable(sourceAffixName: string, bonusType: string): boolean {
    return this.gearDB.getBestValueForAffixType(sourceAffixName, bonusType) > 0;
  }

  private getUniversalCompanionAffixes(affixName: string): string[] {
    return UNIVERSAL_COMPANION_AFFIXES.filter(groupName => this.affixSvc.isGroupMember(affixName, groupName));
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
}
