import { Injectable } from '@angular/core';
import { Affix } from './affix';
import { ITEM_BONUS_KINDS, ItemBonusKind } from '../gear/item-bonus';
import { AffixRank, HELPFUL_RANKS, rankClassName } from './affix-rank.enum';
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
/**
 * Where an option in a list would go if chosen: a crafting slot of the item, or (for a Mythic Boost,
 * Reaper bonus or Curse) the item's bonus of that kind. Each option is ranked as if it replaced
 * whatever is there now.
 */
export type CraftingOptionContext =
  | { item: Item; craft: Craftable }
  | { item: Item; bonusKind: ItemBonusKind };

/** The crafting slot a context's options are for, if it is a crafting slot. */
export function contextCraftable(context: CraftingOptionContext | undefined): Craftable | undefined {
  return context && 'craft' in context ? context.craft : undefined;
}

interface RankDetails {
  rank: AffixRank;
  sourceAffix: Affix;
  /** The build's best value today, when choosing the affix would lower it. */
  downgradeFrom?: number;
  /**
   * For a compound - an affix group, an option with several affixes, a set augment's bonuses -
   * each component's own ranking, in order. The compound's tooltip is one line per component.
   */
  parts?: RankDetails[];
  /** A compound that helps, but with some components outranked (which add nothing). */
  partial?: boolean;
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
   * something rather than add a bonus (where the "Untyped" bonus type would only be noise), and
   * nothing for an on/off effect, which is just its name (not "+1 Bool").
   */
  getAffixValueText(affix: Affix): string {
    if (!Affix.isRealType(affix.type)) {
      return '';
    }
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
    return this.classFor(this.getAffixRankDetails(affix, option, candidate));
  }

  /** What equipping `item` in its slot would contribute, with `option` chosen in `craft` when given. */
  /**
   * The item as a candidate for its slot: its own affixes, its crafting choices and its Mythic Boost,
   * Reaper bonus and Curse - with `option` in place of `craft`'s choice, or `bonus` in place of the
   * item's bonus of that kind (a null option: none).
   */
  candidateFor(item: Item, craft?: Craftable, option?: CraftableOption | null,
      bonus?: { kind: ItemBonusKind; option: CraftableOption | null }): RankCandidate {
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
    for (const kind of ITEM_BONUS_KINDS) {
      const carried = bonus?.kind === kind ? bonus.option : item.bonuses[kind];
      if (carried) {
        affixes.push(...carried.affixes);
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

  private classFor(details: RankDetails): string {
    return rankClassName(details.rank, !!details.partial);
  }

  // A compound affix (affix group) is ranked as itself - which counts when the group's own name
  // is tracked - together with each of its components, and keeps each one's ranking, so its
  // tooltip can point at the specific competing item/set for each component.
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
    if (this.affixSvc?.isAffixGroup(affix)) {
      details = this.getAffixGroupRankDetails(affix, details, candidate);
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

    return this.describeShortSet(option)
      || this.describeRank(this.getAffixRankDetails(affix, option, candidate), option, currentSlot);
  }

  /** For an option from a set augment whose set is short of pieces: why it does nothing yet. */
  private describeShortSet(option?: CraftableOption | null): string {
    const setReq = option?.set ? this.checkSetRequirements(option.set) : null;
    return setReq && !setReq.meetsRequirements
      ? `Need ${setReq.requiredCount} set items (currently have ${setReq.currentCount})`
      : '';
  }

  /**
   * Why something has its rank. A compound gets one line per relevant component, each named and
   * described exactly as that component would be on its own.
   */
  private describeRank(details: RankDetails, option?: CraftableOption, currentSlot?: string): string {
    if (details.parts) {
      const lines = details.parts
        .map(part => ({ part, line: this.describeRank(part, option, currentSlot) }))
        .filter(({ line }) => line);
      // A line is named after its component - unless it is the only line and is about the whole.
      return lines
        .map(({ part, line }) => lines.length > 1 || part.sourceAffix !== details.sourceAffix
          ? `${this.getAffixDescription(part.sourceAffix)}: ${line}`
          : line)
        .join('\n');
    }

    const { rank: affixRank, sourceAffix, downgradeFrom } = details;
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
   * Why a crafting option has its rank colour, from the same ranking getClassForCraftingOption
   * uses: one line per relevant affix, group component or (for a set augment) set bonus.
   */
  getCraftingOptionRankTooltip(option: CraftableOption | null | undefined, slot?: string, candidate?: RankCandidate): string {
    const details = this.getCraftingOptionRankDetails(option, candidate);
    if (!details) {
      return '';
    }
    // A set augment is ranked as if its set were complete, so it isn't described as short.
    return (option!.affixes.length ? this.describeShortSet(option) : '')
      || this.describeRank(details, option!.affixes.length ? option! : undefined, slot);
  }

  /**
   * Ranks a crafting option for a list of options. `alreadyEquipped` says the option is the
   * chosen one on an equipped item, so a set augment already counts as one of its set's pieces.
   */
  rankCraftingOption(option: CraftableOption, slot?: string, alreadyEquipped = false, context?: CraftingOptionContext): CraftingOptionRanking {
    // Ranked as if chosen: on its item, in place of whatever that crafting slot holds now.
    const candidate = !context ? undefined
      : 'craft' in context ? this.candidateFor(context.item, context.craft, option)
      : this.candidateFor(context.item, undefined, undefined, { kind: context.bonusKind, option });
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
    const details = this.getCraftingOptionRankDetails(option, candidate);
    return details ? this.classFor(details) : AffixRank[AffixRank.Irrelevant];
  }

  private getCraftingOptionRankDetails(option: CraftableOption | null | undefined, candidate?: RankCandidate): RankDetails | null {
    if (option?.affixes?.length) {
      return this.combineRankDetails(option.affixes.map(affix => this.getAffixRankDetails(affix, option, candidate)), option.affixes[0]);
    }
    if (option?.set) {
      // A set augment has no affixes of its own, so it is ranked by its set's bonuses - as if
      // the set were complete, which is what choosing it is working towards. (Ranking them with
      // the option would make every set short of its pieces a Penalty.)
      const set = option.set;
      const bonuses = this.getSetBonusAffixes(set);
      if (!bonuses.length) {
        return null;
      }
      return this.combineRankDetails(bonuses.map(affix =>
        this.getAffixRankDetails(affix, undefined, candidate && this.candidateForSetBonus(candidate, set, affix))), bonuses[0]);
    }
    return null;
  }

  /**
   * One rank for several parts, ignoring irrelevant ones. Parts that all rank the same give that
   * rank. Otherwise a penalty among them makes the whole Mixed; failing that, it ranks as its most
   * useful part, since an outranked part adds nothing but takes nothing away - only marked
   * `partial`. A single part is returned as it is; nested compounds are flattened into their parts.
   */
  private combineRankDetails(parts: RankDetails[], whole: Affix): RankDetails {
    if (parts.length === 1) {
      return parts[0];
    }
    const leaves = parts.flatMap(part => part.parts ?? [part]);
    const ranks: AffixRank[] = leaves.map(leaf => leaf.rank).filter(rank => rank !== AffixRank.Irrelevant);
    let rank: AffixRank;
    if (!ranks.length) {
      rank = AffixRank.Irrelevant;
    } else if (ranks.every(r => r === ranks[0])) {
      rank = ranks[0];
    } else if (ranks.includes(AffixRank.Penalty)) {
      rank = AffixRank.Mixed;
    } else {
      rank = HELPFUL_RANKS.find(helpful => ranks.includes(helpful))!;
    }
    const partial = HELPFUL_RANKS.includes(rank) && ranks.includes(AffixRank.Outranked);
    return { rank, sourceAffix: whole, parts: leaves, partial };
  }

  /** Every bonus of a set, at any piece count. */
  private getSetBonusAffixes(set: string): Affix[] {
    return this.gearDb.getSetBonusThresholdDetails(set, 0).flatMap(tier => tier.affixes);
  }

  /** A group's own ranking, `asItself`, combined with its components'. */
  private getAffixGroupRankDetails(affixGroup: Affix, asItself: RankDetails, candidate?: RankCandidate): RankDetails {
    const affixes = this.affixSvc.flattenAffixGroups([affixGroup]);
    return this.combineRankDetails([asItself, ...affixes.map(aff => this.rankOne(aff, candidate))], affixGroup);
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
