import { Injectable } from '@angular/core';

import { AffixService } from './affix.service';
import { EquippedService } from '../planner/equipped.service';
import { GearDbService } from '../gear/gear-db.service';
import {
  CoveredBonusType, makeDisplayType, TrackedBonusTypeDisplay, universalCompanionsOf, visibleTypesOf, VisibleTypeRules
} from './tracked-affix-derivation';

/**
 * Decides which bonus types a tracked affix shows, for both the full Tracked
 * Affixes table and the compact equipment-tab summary, against the planner's
 * build and level range. The rules themselves are in tracked-affix-derivation.ts.
 */
@Injectable({
  providedIn: 'root'
})
export class TrackedAffixDerivationService {
  private readonly rules: VisibleTypeRules;

  constructor(
    private equipped: EquippedService,
    private gearDB: GearDbService,
    private affixSvc: AffixService
  ) {
    this.rules = {
      allLevelTypes: affixName => this.gearDB.getAllLevelTypesForAffix(affixName),
      isUniversalCompanionOnly: (affixName, bonusType) => this.gearDB.isBonusTypeOnlyFromUniversalCompanion(affixName, bonusType),
      isAvailable: (affixName, bonusType) => this.gearDB.getBestValueForAffixType(affixName, bonusType) > 0,
      isGroupMember: (affixName, groupName) => this.affixSvc.isGroupMember(affixName, groupName),
    };
  }

  /**
   * The bonus types to show for one tracked affix: those it currently has or
   * could get in the level range, plus a "Universal <type>" row for each
   * universal companion affix it belongs to. Penalties are excluded.
   */
  getVisibleTypes(affixMap: Map<string, CoveredBonusType[]>, affixName: string): TrackedBonusTypeDisplay[] {
    return visibleTypesOf(affixMap.get(affixName) || [], affixName,
      (source, bonusType) => this.equipped.getCurrentValueForAffixType(source, bonusType), this.rules);
  }

  /**
   * Every bonus type the affix can have at any level, as display types, with
   * the same universal-companion handling as getVisibleTypes.
   */
  getAllLevelDisplayTypes(affixName: string): TrackedBonusTypeDisplay[] {
    const displayTypes = this.gearDB.getAllLevelTypesForAffix(affixName)
      .filter(bonusType => !this.rules.isUniversalCompanionOnly(affixName, bonusType))
      .map(bonusType => makeDisplayType(affixName, bonusType, 0));

    for (const sourceAffixName of universalCompanionsOf(affixName, this.rules)) {
      for (const bonusType of this.gearDB.getAllLevelTypesForAffix(sourceAffixName)) {
        displayTypes.push(makeDisplayType(sourceAffixName, bonusType, 0));
      }
    }

    return displayTypes;
  }
}
