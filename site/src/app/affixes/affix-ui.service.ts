import { Injectable } from '@angular/core';
import { Affix } from './affix';
import { AffixRank } from './affix-rank.enum';
import { EquippedService, RankCandidate } from '../planner/equipped.service';
import { AffixService } from './affix.service';
import { GearDbService } from '../gear/gear-db.service';
import { Craftable } from '../gear/craftable';
import { CraftableOption } from '../gear/craftable-option';
import { Item } from '../gear/item';
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

/** The item a crafting option is being chosen for, and the crafting slot it would go in. */
export interface CraftingOptionContext {
  item: Item;
  craft: Craftable;
}

interface RankDetails {
  rank: AffixRank;
  sourceAffix: Affix;
  /** The build's best value today, when choosing the affix would lower it. */
  downgradeFrom?: number;
}

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

  /**
   * The rank class for an affix. With a `candidate`, the affix is ranked as it would be once the
   * candidate is equipped; without one, against the build as it is (for things already counted in it).
   */
  getClassForAffix(affix: Affix, option?: CraftableOption, candidate?: RankCandidate): string {
    perfCount('AffixUiService.getClassForAffix');
    return AffixRank[this.getAffixRank(affix, option, candidate)];
  }

  /** What equipping `item` in its slot would contribute, with `option` chosen in `craft` when given. */
  candidateFor(item: Item, craft?: Craftable, option?: CraftableOption | null): RankCandidate {
    const affixes = item.affixes.slice();
    const craftedSets: string[] = [];
    for (const itemCraft of item.crafting || []) {
      const selected = itemCraft === craft ? option : itemCraft.selected;
      if (selected?.affixes) {
        affixes.push(...selected.affixes);
      }
      if (selected?.set) {
        craftedSets.push(selected.set);
      }
    }
    return {
      slot: item.slot,
      activeAffixes: this.affixSvc.flattenAffixGroups(affixes, true),
      // As Item.getSets: a set augment takes the place of the item's own sets.
      sets: craftedSets.length ? craftedSets : item.getOwnSets()
    };
  }

  /**
   * A set augment ranked by one of its set's bonuses: as if the augment granted that bonus itself,
   * and without the piece it adds. So the bonus counts as already there when the set is complete
   * without the augment, and a set it would complete, or leave short, is ranked as if complete.
   */
  private candidateForSetBonus(candidate: RankCandidate, set: string, bonus: Affix): RankCandidate {
    const sets = candidate.sets.slice();
    const piece = sets.indexOf(set);
    if (piece >= 0) {
      sets.splice(piece, 1);
    }
    return {
      slot: candidate.slot,
      activeAffixes: candidate.activeAffixes.concat(this.affixSvc.flattenAffixGroups([bonus], true)),
      sets
    };
  }

  /** An augment going into an empty slot: added to the build without replacing anything. */
  candidateForAddedOption(option: CraftableOption): RankCandidate {
    return { slot: null, activeAffixes: this.affixSvc.flattenAffixGroups(option.affixes || [], true), sets: [] };
  }

  /** A set-bonus affix is ranked like any other once its tier is active, and greyed out until then. */
  getClassForSetAffix(affix: Affix, eligible: boolean): string {
    return eligible ? this.getClassForAffix(affix) : DISABLED_SET_BONUS_CLASS;
  }

  getSetBonusLockedTooltip(threshold: number, equippedPieces: number): string {
    return `Needs ${threshold} set items (currently have ${equippedPieces})`;
  }

  private getAffixRank(affix: Affix, option?: CraftableOption, candidate?: RankCandidate): AffixRank {
    return this.getAffixRankDetails(affix, option, candidate).rank;
  }

  // Compound affixes (affix groups) get their rank from whichever component affix is
  // responsible for it. We need to know which component that is, not just the overall
  // rank, so tooltips can point at the specific competing item/set for that component.
  private getAffixRankDetails(affix: Affix, option?: CraftableOption, candidate?: RankCandidate): RankDetails {
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

    let details = this.rankOne(affix, candidate);
    if (details.rank === AffixRank.Irrelevant && this.affixSvc?.isAffixGroup(affix)) {
      details = this.getAffixGroupRankDetails(affix, candidate);
    }
    let affixRank = details.rank;

    if (option?.set && affixRank === AffixRank.BestTied) {
      // If this is a set bonus, and tied for best, downgrade to Best so that they don't all show in Blue
      affixRank = AffixRank.Best;
    }

    return { ...details, rank: affixRank };
  }

  private rankOne(affix: Affix, candidate?: RankCandidate): RankDetails {
    if (!candidate) {
      return { rank: this.equipped.getAffixRanking(affix), sourceAffix: affix };
    }
    return { ...this.equipped.getAffixRankingAsEquipped(affix, candidate), sourceAffix: affix };
  }

  getAffixTooltip(affix: Affix, option?: CraftableOption, currentSlot?: string, candidate?: RankCandidate): string {
    perfCount('AffixUiService.getAffixTooltip');
    if (!affix) return '';

    // Check if this is a set bonus from an augment
    if (option?.set) {
      const setReq = this.checkSetRequirements(option.set);
      if (setReq && !setReq.meetsRequirements) {
        return `Need ${setReq.requiredCount} set items (currently have ${setReq.currentCount})`;
      }
    }

    const { rank: affixRank, sourceAffix, downgradeFrom } = this.getAffixRankDetails(affix, option, candidate);
    if (downgradeFrom !== undefined) {
      // The value it would lose comes from the slot being replaced, so that slot's source is named.
      const current = this.describeCompetingSources(sourceAffix);
      return `Lower than current ${downgradeFrom > 0 ? '+' : ''}${downgradeFrom}` + (current ? ` from ${current}` : '');
    }

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
  /**
   * Why a crafting option has its rank colour: its first affix's ranking tooltip or, for a set
   * augment, each set bonus's, ranked the same way getClassForCraftingOption ranks them.
   */
  getCraftingOptionRankTooltip(option: CraftableOption | null | undefined, slot?: string, candidate?: RankCandidate): string {
    if (option?.affixes?.[0]) {
      return this.getAffixTooltip(option.affixes[0], option, slot, candidate);
    }
    if (!option?.set) {
      return '';
    }
    const set = option.set;
    const bonuses = this.getSetBonusAffixes(set);
    const tooltips = bonuses.map(affix => {
      const tooltip = this.getAffixTooltip(affix, undefined, slot, candidate && this.candidateForSetBonus(candidate, set, affix));
      // With several bonuses, say which one each line is about.
      return tooltip && bonuses.length > 1 ? `${this.getAffixDescription(affix)}: ${tooltip}` : tooltip;
    });
    return tooltips.filter(tooltip => tooltip).join('\n');
  }

  rankCraftingOption(option: CraftableOption, slot?: string, alreadyEquipped = false, context?: CraftingOptionContext): CraftingOptionRanking {
    // Ranked as if chosen: on its item, in place of whatever that crafting slot holds now.
    const candidate = context ? this.candidateFor(context.item, context.craft, option) : undefined;
    const rankingTooltip = this.getCraftingOptionRankTooltip(option, slot, candidate);
    const setPieces = this.getSetPieces(option, alreadyEquipped);
    return {
      className: this.getClassForCraftingOption(option, candidate),
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

  getClassForCraftable(craft: Craftable, candidate?: RankCandidate): string {
    perfCount('AffixUiService.getClassForCraftable');
    return this.getClassForCraftingOption(craft?.selected, candidate);
  }

  getClassForCraftingOption(option: CraftableOption, candidate?: RankCandidate): string {
    perfCount('AffixUiService.getClassForCraftingOption');
    if (option?.affixes?.length) {
      return AffixRank[this.combineRanks(option.affixes.map(affix => this.getAffixRank(affix, option, candidate)))];
    }
    if (option?.set) {
      // A set augment has no affixes of its own, so it is ranked by its set's bonuses - as if
      // the set were complete, which is what choosing it is working towards. (Ranking them with
      // the option would make every set short of its pieces a Penalty.)
      const set = option.set;
      return AffixRank[this.combineRanks(this.getSetBonusAffixes(set).map(affix =>
        this.getAffixRank(affix, undefined, candidate && this.candidateForSetBonus(candidate, set, affix))))];
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

  private getAffixGroupRankDetails(affixGroup: Affix, candidate?: RankCandidate): RankDetails {
    let details: RankDetails = { rank: AffixRank.Irrelevant, sourceAffix: affixGroup };
    const affixes = this.affixSvc.flattenAffixGroups([affixGroup]);
    for (const aff of affixes) {
      const cur = this.rankOne(aff, candidate);
      if (details.rank === AffixRank.Irrelevant) {
        details = cur;
      } else if (cur.rank === AffixRank.Irrelevant) {
        // Do nothing
      } else if (details.rank !== cur.rank) {
        return { rank: AffixRank.Mixed, sourceAffix: affixGroup };
      }
    }
    return details;
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
