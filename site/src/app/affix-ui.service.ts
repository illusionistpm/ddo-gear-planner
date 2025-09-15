import { Injectable } from '@angular/core';
import { Affix } from './affix';
import { AffixRank } from './affix-rank.enum';
import { EquippedService } from './equipped.service';
import { AffixService } from './affix.service';
import { GearDbService } from './gear-db.service';
import { Craftable } from './craftable';
import { CraftableOption } from './craftable-option';

@Injectable({
  providedIn: 'root'
})
export class AffixUiService {
  constructor(
    private equipped: EquippedService,
    private affixSvc: AffixService,
    private gearDb: GearDbService
  ) {}

  getAffixValue(affix: Affix): string {
    if (affix?.value) {
      return (affix.value > 0 ? '+' : '') + affix.value;
    }
    return '';
  }

  getClassForAffix(affix: Affix, option?: CraftableOption): string {
    if (!affix) {
      return AffixRank[AffixRank.Irrelevant];
    }

    // Check for set augments that don't have enough pieces equipped
    if (option?.set) {
      const setReq = this.checkSetRequirements(option.set);
      if (setReq && !setReq.meetsRequirements) {
        return AffixRank[AffixRank.Penalty];
      }
    }
    
    let affixRank = this.equipped.getAffixRanking(affix);
    if (affixRank === AffixRank.Irrelevant && this.affixSvc?.isAffixGroup(affix)) {
      affixRank = this.getAffixGroupRank(affix);
    }

    if (option?.set && affixRank === AffixRank.BestTied) {
      // If this is a set bonus, and tied for best, downgrade to Best so that they don't all show in Blue
      affixRank = AffixRank.Best;
    }

    return AffixRank[affixRank];
  }

  getAffixTooltip(affix: Affix, option?: CraftableOption): string {
    if (!affix) return '';
    
    // Check if this is a set bonus from an augment
    if (option?.set) {
      const setReq = this.checkSetRequirements(option.set);
      if (setReq && !setReq.meetsRequirements) {
        return `Need ${setReq.requiredCount} set items (currently have ${setReq.currentCount})`;
      }
    }

    let affixRank = this.equipped.getAffixRanking(affix);
    if (affixRank === AffixRank.Irrelevant) {
      if (this.affixSvc.isAffixGroup(affix)) {
        affixRank = this.getAffixGroupRank(affix);
      }
    }

    switch (affixRank) {
      case AffixRank.BetterThanBest:
        return 'Better than best equipped value';
      case AffixRank.Best:
        return 'Best equipped value';
      case AffixRank.BestTied:
        return 'Tied for best equipped value';
      case AffixRank.Outranked:
        return 'Overpowered by another affix';
      case AffixRank.Mixed:
        return 'Mixed effectiveness';
      case AffixRank.Penalty:
        return option?.set ? 'Not yet active - need more set items' : 'Penalty/negative effect';
      default:
        return '';
    }
  }

  getClassForCraftable(craft: Craftable): string {
    if (!craft?.selected?.affixes?.length) {
      return AffixRank[AffixRank.Irrelevant];
    }
    const affix = craft.selected.affixes[0];
    return this.getClassForAffix(affix, craft.selected);
  }

  getClassForCraftingOption(option: CraftableOption): string {
    if (!option?.affixes?.length) {
      return AffixRank[AffixRank.Irrelevant];
    }
    const affix = option.affixes[0];
    return this.getClassForAffix(affix, option);
  }

  private getAffixGroupRank(affixGroup: Affix): AffixRank {
    let affixRank = AffixRank.Irrelevant;
    const affixes = this.affixSvc.flattenAffixGroups([affixGroup]);
    for (const aff of affixes) {
      const curRank = this.equipped.getAffixRanking(aff);
      if (affixRank === AffixRank.Irrelevant) {
        affixRank = curRank;
      } else if (curRank === AffixRank.Irrelevant) {
        // Do nothing
      } else if (affixRank !== curRank) {
        return AffixRank.Mixed;
      }
    }
    return affixRank;
  }

  private checkSetRequirements(setName: string): { meetsRequirements: boolean, currentCount: number, requiredCount: number } {
    if (!setName) {
      return null;
    }

    const setCounts = this.equipped.getActiveSets();
    const currentCount = (setCounts.get(setName) || 0);
    const setThresholds = this.gearDb.getSetBonusThresholds(setName);
    const minRequirement = setThresholds.length > 0 ? setThresholds[0] : 0;
    
    return {
      meetsRequirements: currentCount >= minRequirement,
      currentCount,
      requiredCount: minRequirement
    };
  }
}
