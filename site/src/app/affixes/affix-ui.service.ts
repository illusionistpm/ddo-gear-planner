import { Injectable } from '@angular/core';
import { Affix } from './affix';
import { AffixRank } from './affix-rank.enum';
import { EquippedService } from '../planner/equipped.service';
import { AffixService } from './affix.service';
import { GearDbService } from '../gear/gear-db.service';
import { Craftable } from '../gear/craftable';
import { CraftableOption } from '../gear/craftable-option';
import { perfCount } from '../shared/perf-trace';
import { externalAffixAsAffix, ExternalAffixEntry } from './external-affix';
import { getCountAffixUnit } from './count-affix';

/** How a crafting option ranks against the build, as a list of options shows it. */
export interface CraftingOptionRanking {
  /** Rank class, e.g. 'Best'. */
  className: string;
  tooltip: string;
  /** A caveat to show beside the option: the set pieces a set augment would make, while short. */
  note: string;
}

/** CSS class for a set bonus whose piece threshold isn't met yet. Styled in each view's stylesheet. */
export const DISABLED_SET_BONUS_CLASS = 'DisabledSetBonus';

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
    perfCount('AffixUiService.getAffixValue');
    if (affix?.value) {
      return (affix.value > 0 ? '+' : '') + affix.value;
    }
    return '';
  }

  /**
   * The value column for an affix on an item: "+5 Insight", or "3 slots" for the affixes that count
   * something rather than add a bonus (where the "Untyped" bonus type would only be noise).
   */
  getAffixValueText(affix: Affix): string {
    const unit = getCountAffixUnit(affix.name);
    if (unit && affix.value) {
      return `${affix.value} ${unit}`;
    }
    return [this.getAffixValue(affix), affix.type].filter(part => part).join(' ');
  }

  /**
   * The value column for a non-gear affix entry: "+5 Insight", "Covered" for a
   * checklist entry, or the ignored bonus type. `includeLabel` appends the
   * entry's own label, for views that do not show it separately.
   */
  describeExternalAffix(entry: ExternalAffixEntry, includeLabel = false): string {
    let text: string;
    if (entry.kind === 'ignored') {
      text = Affix.isRealType(entry.bonusType) ? entry.bonusType : 'Ignored';
    } else if (entry.bonusType === 'Bool') {
      text = 'Covered';
    } else {
      text = [this.getAffixValue(externalAffixAsAffix(entry)), entry.bonusType].filter(part => part).join(' ');
    }
    return includeLabel ? `${text} (${entry.label})` : text;
  }

  getClassForAffix(affix: Affix, option?: CraftableOption): string {
    perfCount('AffixUiService.getClassForAffix');
    return AffixRank[this.getAffixRank(affix, option)];
  }

  /** A set-bonus affix is ranked like any other once its tier is active, and greyed out until then. */
  getClassForSetAffix(affix: Affix, eligible: boolean): string {
    return eligible ? this.getClassForAffix(affix) : DISABLED_SET_BONUS_CLASS;
  }

  getSetBonusLockedTooltip(threshold: number, equippedPieces: number): string {
    return `Needs ${threshold} set items (currently have ${equippedPieces})`;
  }

  private getAffixRank(affix: Affix, option?: CraftableOption): AffixRank {
    return this.getAffixRankDetails(affix, option).rank;
  }

  // Compound affixes (affix groups) get their rank from whichever component affix is
  // responsible for it. We need to know which component that is, not just the overall
  // rank, so tooltips can point at the specific competing item/set for that component.
  private getAffixRankDetails(affix: Affix, option?: CraftableOption): { rank: AffixRank; sourceAffix: Affix } {
    if (!affix) {
      return { rank: AffixRank.Irrelevant, sourceAffix: affix };
    }

    // Check for set augments that don't have enough pieces equipped
    if (option?.set) {
      const setReq = this.checkSetRequirements(option.set);
      if (setReq && !setReq.meetsRequirements) {
        return { rank: AffixRank.Penalty, sourceAffix: affix };
      }
    }

    let affixRank = this.equipped.getAffixRanking(affix);
    let sourceAffix = affix;
    if (affixRank === AffixRank.Irrelevant && this.affixSvc?.isAffixGroup(affix)) {
      const groupResult = this.getAffixGroupRankDetails(affix);
      affixRank = groupResult.rank;
      sourceAffix = groupResult.sourceAffix;
    }

    if (option?.set && affixRank === AffixRank.BestTied) {
      // If this is a set bonus, and tied for best, downgrade to Best so that they don't all show in Blue
      affixRank = AffixRank.Best;
    }

    return { rank: affixRank, sourceAffix };
  }

  getAffixTooltip(affix: Affix, option?: CraftableOption, currentSlot?: string): string {
    perfCount('AffixUiService.getAffixTooltip');
    if (!affix) return '';

    // Check if this is a set bonus from an augment
    if (option?.set) {
      const setReq = this.checkSetRequirements(option.set);
      if (setReq && !setReq.meetsRequirements) {
        return `Need ${setReq.requiredCount} set items (currently have ${setReq.currentCount})`;
      }
    }

    const { rank: affixRank, sourceAffix } = this.getAffixRankDetails(affix, option);

    let tooltip: string;
    switch (affixRank) {
      case AffixRank.BetterThanBest:
        tooltip = 'Better than best equipped value';
        break;
      case AffixRank.Best:
        tooltip = 'Best equipped value';
        break;
      case AffixRank.BestTied:
        tooltip = 'Tied with';
        break;
      case AffixRank.Outranked:
        tooltip = 'Overpowered by';
        break;
      case AffixRank.Mixed:
        tooltip = 'Mixed effectiveness';
        break;
      case AffixRank.Penalty:
        tooltip = option?.set ? 'Not yet active - need more set items' : 'Penalty/negative effect';
        break;
      default:
        tooltip = '';
    }

    if (affixRank === AffixRank.BestTied || affixRank === AffixRank.Outranked) {
      const competing = this.describeCompetingSources(sourceAffix, currentSlot);
      if (competing) {
        tooltip += ` ${competing}`;
      }
    }

    return tooltip;
  }

  private describeCompetingSources(affix: Affix, currentSlot?: string): string {
    const sources = this.equipped.getSourcesForAffixType(affix.name, affix.type)
      .filter(source => source.slot !== currentSlot);

    if (!sources.length) return '';

    return sources
      .map(source => source.kind === 'set' ? `${source.itemName} set bonus` : `${source.itemName} (${source.slot})`)
      .join(', ');
  }

  getAffixGroupTooltip(affix: Affix): string {
    perfCount('AffixUiService.getAffixGroupTooltip');
    if (!affix || !this.affixSvc.isAffixGroup(affix)) return '';
    const groupAffixes = this.affixSvc.ungroupAffix(affix);
    return groupAffixes.length ? affix.name + ' is:\n' + groupAffixes.map(groupAffix => '- ' + this.getAffixDescription(groupAffix)).join('\n') : '';
  }

  getCraftingOptionTooltip(option: CraftableOption): string {
    perfCount('AffixUiService.getCraftingOptionTooltip');
    if (!option?.affixes?.length && option?.set) {
      return this.gearDb.getSetBonusThresholdDetails(option.set, 0)
        .map(tier => `${option.set} set bonus at ${tier.threshold} pieces:\n`
          + tier.affixes.map(affix => '- ' + this.getAffixDescription(affix)).join('\n'))
        .join('\n');
    }
    if (!option?.affixes?.length) return '';
    const optionName = option.name || option.set || option.describe(false);
    const optionAffixes = option.affixes.flatMap(affix => {
      const expandedAffixes = this.affixSvc.ungroupAffix(affix);
      return expandedAffixes.length ? expandedAffixes : [affix];
    });
    return optionName + ' is:\n' + optionAffixes.map(affix => '- ' + this.getAffixDescription(affix)).join('\n');
  }

  private getAffixDescription(affix: Affix): string {
    if (affix.type === 'Bool' && affix.value === 1) {
      return affix.name;
    }

    const bonus = this.getAffixValueText(affix);
    return bonus ? `${affix.name}: ${bonus}` : affix.name;
  }

  /** A set's bonuses in brief: "Doublestrike: +15 Artifact, Doubleshot: +15 Artifact". */
  describeSetBonus(set: string): string {
    return this.getSetBonusAffixes(set).map(affix => this.getAffixDescription(affix)).join(', ');
  }

  /**
   * Ranks a crafting option for a list of options. `alreadyEquipped` says the option is the
   * chosen one on an equipped item, so a set augment already counts as one of its set's pieces.
   */
  rankCraftingOption(option: CraftableOption, slot?: string, alreadyEquipped = false): CraftingOptionRanking {
    const rankingTooltip = option.affixes?.[0] ? this.getAffixTooltip(option.affixes[0], option, slot) : '';
    const setPieces = this.getSetPieces(option, alreadyEquipped);
    return {
      className: this.getClassForCraftingOption(option),
      tooltip: [this.getCraftingOptionTooltip(option), rankingTooltip].filter(tooltip => tooltip).join('\n\n'),
      // Only while the set is short; a complete set's colour already says what it gives.
      note: setPieces && setPieces.pieces < setPieces.required ? `${setPieces.pieces} of ${setPieces.required} set pieces` : ''
    };
  }

  /**
   * The pieces of a set augment's set there would be with the augment - counting it unless it
   * is already one of the equipped pieces - against the pieces its first bonus needs.
   */
  getSetPieces(option: CraftableOption, alreadyEquipped: boolean): { pieces: number; required: number } | null {
    const setReq = option?.set ? this.checkSetRequirements(option.set) : null;
    if (!setReq) {
      return null;
    }
    return { pieces: setReq.currentCount + (alreadyEquipped ? 0 : 1), required: setReq.requiredCount };
  }

  getClassForCraftable(craft: Craftable): string {
    perfCount('AffixUiService.getClassForCraftable');
    return this.getClassForCraftingOption(craft?.selected);
  }

  getClassForCraftingOption(option: CraftableOption): string {
    perfCount('AffixUiService.getClassForCraftingOption');
    if (option?.affixes?.length) {
      return AffixRank[this.combineRanks(option.affixes.map(affix => this.getAffixRank(affix, option)))];
    }
    if (option?.set) {
      // A set augment has no affixes of its own, so it is ranked by its set's bonuses - as if
      // the set were complete, which is what choosing it is working towards. (Ranking them with
      // the option would make every set short of its pieces a Penalty.)
      return AffixRank[this.combineRanks(this.getSetBonusAffixes(option.set).map(affix => this.getAffixRank(affix)))];
    }
    return AffixRank[AffixRank.Irrelevant];
  }

  /** One rank for several affixes: the one rank they share, ignoring irrelevant ones, or Mixed. */
  private combineRanks(ranks: AffixRank[]): AffixRank {
    let combined = AffixRank.Irrelevant;
    for (const rank of ranks) {
      if (rank === AffixRank.Irrelevant) {
        continue;
      }
      if (combined === AffixRank.Irrelevant) {
        combined = rank;
      } else if (combined !== rank) {
        return AffixRank.Mixed;
      }
    }
    return combined;
  }

  /** Every bonus of a set, at any piece count. */
  private getSetBonusAffixes(set: string): Affix[] {
    return this.gearDb.getSetBonusThresholdDetails(set, 0).flatMap(tier => tier.affixes);
  }

  private getAffixGroupRankDetails(affixGroup: Affix): { rank: AffixRank; sourceAffix: Affix } {
    let affixRank = AffixRank.Irrelevant;
    let sourceAffix = affixGroup;
    const affixes = this.affixSvc.flattenAffixGroups([affixGroup]);
    for (const aff of affixes) {
      const curRank = this.equipped.getAffixRanking(aff);
      if (affixRank === AffixRank.Irrelevant) {
        affixRank = curRank;
        sourceAffix = aff;
      } else if (curRank === AffixRank.Irrelevant) {
        // Do nothing
      } else if (affixRank !== curRank) {
        return { rank: AffixRank.Mixed, sourceAffix: affixGroup };
      }
    }
    return { rank: affixRank, sourceAffix };
  }

  private checkSetRequirements(setName: string): { meetsRequirements: boolean, currentCount: number, requiredCount: number } | null {
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
