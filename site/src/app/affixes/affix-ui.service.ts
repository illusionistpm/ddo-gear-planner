import { Injectable } from '@angular/core';
import { Affix } from './affix';
import { ITEM_BONUS_KINDS, ItemBonusKind } from '../gear/item-bonus';
import { AffixRank, HELPFUL_RANKS, rankClassName } from './affix-rank.enum';
import { EquippedService, RankCandidate } from '../planner/equipped.service';
import type { AffixSource } from './build-totals';
import { AffixService } from './affix.service';
import { GearDbService } from '../gear/gear-db.service';
import { Craftable } from '../gear/craftable';
import { CraftableOption } from '../gear/craftable-option';
import { Item } from '../gear/item';
import { FILIGREE_ONLY_BONUS_TYPES } from '../gear/filigree';
import { perfCount } from '../shared/perf-trace';
import { externalAffixAsAffix, ExternalAffixEntry } from './external-affix';
import { getCountAffixUnit } from './count-affix';
import { AffixDescriptionService } from './affix-description.service';

/** How a crafting option ranks against the build, as a list of options shows it. */
export interface CraftingOptionRanking {
  /** Rank class, e.g. 'Best'. */
  className: string;
  tooltip: string;
  /** A caveat to show beside the option: the set pieces a set augment would make, while short. */
  note: string;
  /** What the option is: the first part of `tooltip`. */
  optionTooltip: string;
  /** Why it has its rank: the rest of `tooltip`. */
  rankTooltip: string;
  /**
   * For a set augment whose set is short of pieces: the pieces its first bonus needs, which
   * `changes` assume it has. Null when `changes` are what choosing it would do now.
   */
  completeSetPieces: number | null;
  /** What choosing it would do to each tracked affix it touches; empty when it touches none. */
  changes: AffixChange[];
}

/**
 * What a crafting option does to one bonus type of a tracked affix: the build's value with the
 * current choice, and with the option in its place. The two are equal when something else
 * already gives as much, or for the current choice itself.
 */
export interface AffixChange {
  name: string;
  type: string;
  before: number;
  after: number;
  /** What gives the build its value now ("Ring of Prowess (Ring 1)"), when it has one. */
  beforeSources: string[];
}

/** A compound affix's part as its details list it: "Armor Class" and "+2 Insight" ('' for an on/off effect). */
export interface AffixDetailsPart {
  name: string;
  value: string;
}

/**
 * Affix groups whose members a compound's details name as one row when it has them all at one
 * value: the group whose members are exactly that family, and what to call them.
 */
const PART_FAMILIES: ReadonlyArray<{ group: string, label: string }> = [
  { group: 'All Saves', label: 'All saves' },
  { group: 'All Skills', label: 'All skills' },
  { group: 'Well Rounded', label: 'All abilities' },
  { group: 'Potency', label: 'All spell powers' },
  { group: 'Spell Lore', label: 'All spell lores' },
  { group: 'Spell Critical Damage', label: 'All spell critical damage' },
];

/** A labelled list in an affix's details: "Counts toward", "Grants", "Set bonus at 3 pieces". */
export interface AffixDetailsSection {
  label: string;
  parts: AffixDetailsPart[];
}

/** What an affix's, or a crafting option's, details show; see AffixUiService.getAffixDetails. */
export interface AffixDetails {
  name: string;
  /** DDO Wiki's account of what it does; '' when the wiki adds nothing the row doesn't say. */
  description: string;
  /** The affix the description is about, for a "More on DDO Wiki" search; '' with no description. */
  wikiName: string;
  /** A compound affix's parts, a crafting option's affixes or a set augment's bonuses. */
  sections: AffixDetailsSection[];
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
    private gearDb: GearDbService,
    private descriptions: AffixDescriptionService
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

    // A set augment without enough pieces equipped does nothing yet.
    if (option?.set) {
      const setReq = this.checkSetRequirements(option.set);
      if (setReq && !setReq.meetsRequirements) {
        return { rank: AffixRank.Inactive, sourceAffix: affix };
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

    const details = this.getAffixRankDetails(affix, option, candidate);
    // An affix row's compound says only how it ranks overall, as a plain affix does: its
    // underlined name opens what its parts are. An option's tooltip still goes part by part.
    if (!option && details.parts) {
      return this.describeOverallRank(details, currentSlot);
    }
    return this.describeShortSet(option) || this.describeRank(details, option, currentSlot);
  }

  /** A compound's rank in one line, naming what the parts that set it are tied with or overpowered by. */
  private describeOverallRank(details: RankDetails, currentSlot?: string): string {
    const { rank } = details;
    if (rank === AffixRank.Mixed) {
      return 'Some of its parts help; some are penalties';
    }
    let tooltip = this.rankSentence(rank);
    if (rank === AffixRank.BestTied || rank === AffixRank.Outranked) {
      const competing = new Set((details.parts ?? [])
        .filter(part => part.rank === rank)
        .map(part => this.describeCompetingSources(part.sourceAffix, currentSlot))
        .filter(sources => sources));
      if (competing.size) {
        tooltip += ` ${[...competing].join(', ')}`;
      }
    }
    return tooltip && details.partial ? `${tooltip} for some of its parts` : tooltip;
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

    let tooltip = this.rankSentence(affixRank);

    if (affixRank === AffixRank.BestTied || affixRank === AffixRank.Outranked) {
      const competing = this.describeCompetingSources(sourceAffix, currentSlot);
      if (competing) {
        tooltip += ` ${competing}`;
      }
    }

    return tooltip;
  }

  /** What a rank means, for a tooltip; Tied and Overpowered go on to name what with or by. */
  private rankSentence(rank: AffixRank): string {
    switch (rank) {
      case AffixRank.BetterThanBest:
        return 'Better than best equipped value';
      case AffixRank.Best:
        return 'Best equipped value';
      case AffixRank.BestTied:
        return 'Tied with';
      case AffixRank.Outranked:
        return 'Overpowered by';
      case AffixRank.Penalty:
        return 'Penalty/negative effect';
      case AffixRank.Inactive:
        return 'Not yet active - need more set items';
      default:
        return '';
    }
  }

  private describeCompetingSources(affix: Affix, currentSlot?: string): string {
    const sources = this.equipped.getSourcesForAffixType(affix.name, affix.type)
      .filter(source => source.slot !== currentSlot);

    if (!sources.length) {
      // The item's own bonus is the one in the way (a Heartshard's False Life against its augment's).
      return currentSlot && this.equipped.getSourcesForAffixType(affix.name, affix.type).length ? 'this item' : '';
    }

    return sources
      .map(source => source.kind === 'set' ? `${source.itemName} set bonus` : `${source.itemName} (${source.slot})`)
      .join(', ');
  }

  /**
   * What an affix's underlined name opens: what it does, in DDO Wiki's words, and - for a
   * compound affix - the planner affixes it counts toward, which only the planner can say.
   * Null when there's neither, and the name is plain text. `ml`, the item's, fills in the numbers
   * that scale with it (a proc's dice).
   */
  getAffixDetails(affix: Affix, ml?: number): AffixDetails | null {
    perfCount('AffixUiService.getAffixDetails');
    if (!affix) return null;
    const description = this.descriptions.describe(affix, ml);
    const parts = this.affixSvc.isAffixGroup(affix) ? this.detailsParts(this.affixSvc.ungroupAffix(affix)) : [];
    if (!description && !parts.length) return null;
    return {
      name: affix.name,
      description,
      wikiName: description ? affix.name : '',
      sections: parts.length ? [{ label: 'Counts toward', parts }] : [],
    };
  }

  /**
   * What a crafting option's details show: what it grants and, when that's one affix, what that
   * affix does - a set augment's bonuses by piece count instead. Null for an empty option, or one
   * whose label already says all there is ("+3 Fire Spell Power", which the wiki doesn't explain).
   */
  getCraftingOptionDetails(option: CraftableOption | null | undefined, ml?: number): AffixDetails | null {
    perfCount('AffixUiService.getCraftingOptionDetails');
    if (!option) return null;
    const name = option.name || option.set || option.describe(false);
    if (!option.affixes?.length) {
      const tiers = option.set ? this.gearDb.getSetBonusThresholdDetails(option.set, 0) : [];
      return tiers.length ? {
        name, description: '', wikiName: '',
        sections: tiers.map(tier => ({
          label: `Set bonus at ${tier.threshold} pieces`,
          parts: this.detailsParts(tier.affixes),
        })),
      } : null;
    }
    const granted = option.affixes.flatMap(affix => {
      const parts = this.affixSvc.ungroupAffix(affix);
      return parts.length ? parts : [affix];
    });
    // The one affix it grants (a compound one counting as one), which the wiki may explain.
    const only = option.affixes.length === 1 ? option.affixes[0] : null;
    const description = only ? this.descriptions.describe(only, ml) : '';
    // A plain "+3 Fire Spell Power" is its one affix already: listing it would only say it again.
    const saysItAll = !option.name && !option.set && granted.length === 1;
    const sections = saysItAll ? [] : [{ label: 'Grants', parts: this.detailsParts(granted) }];
    if (!description && !sections.length) return null;
    return { name, description, wikiName: description && only ? only.name : '', sections };
  }

  private detailsPart(affix: Affix): AffixDetailsPart {
    return { name: affix.name, value: this.getAffixValueText(affix) };
  }

  /**
   * A compound's parts as its details list them. A whole family at one value - every skill, every
   * spell power - is one row ("All skills: +2 Luck"): listed out, Good Luck alone is 24 rows.
   */
  private detailsParts(affixes: Affix[]): AffixDetailsPart[] {
    let rows: Array<{ affix: Affix | null, part: AffixDetailsPart }> =
      affixes.map(affix => ({ affix, part: this.detailsPart(affix) }));
    for (const family of PART_FAMILIES) {
      const members = this.affixSvc.affixGroups.get(family.group) ?? [];
      const inFamily = rows.filter(row => row.affix && members.includes(row.affix.name));
      const values = new Set(inFamily.map(row => row.part.value));
      if (!members.length || inFamily.length !== members.length || values.size !== 1) {
        continue;
      }
      // Where the family's first member was, so the rest keep their order around it.
      const at = rows.indexOf(inFamily[0]);
      const others = rows.filter(row => !inFamily.includes(row));
      rows = [...others.slice(0, at), { affix: null, part: { name: family.label, value: inFamily[0].part.value } }, ...others.slice(at)];
    }
    return rows.map(row => row.part);
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

  /** A set's bonuses in brief, one per part: "Doublestrike: +15 Artifact", "Doubleshot: +15 Artifact". */
  describeSetBonusParts(set: string): string[] {
    return this.getSetBonusAffixes(set).map(affix => this.getAffixDescription(affix));
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
    const shortSet = option!.affixes.length ? this.describeShortSet(option) : '';
    // Several parts (Good Luck's 24) say how they rank overall in one line, as an affix row's do:
    // the option's details list the parts.
    if (!shortSet && details.parts) {
      return this.describeOverallRank(details, slot);
    }
    return shortSet || this.describeRank(details, option!.affixes.length ? option! : undefined, slot);
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
    const optionTooltip = this.getCraftingOptionTooltip(option);
    const short = !!setPieces && setPieces.pieces < setPieces.required;
    return {
      className: this.getClassForCraftingOption(option, candidate),
      tooltip: [optionTooltip, rankingTooltip].filter(tooltip => tooltip).join('\n\n'),
      optionTooltip,
      // Only while the set is short; a complete set's colour already says what it gives.
      note: short ? `${setPieces!.pieces} of ${setPieces!.required} set pieces` : '',
      rankTooltip: rankingTooltip,
      // A short set gives nothing yet, which says nothing of why you'd choose it: what it gives
      // once it has its pieces is the figure, as its rank colour already assumes.
      changes: this.getCraftingOptionChanges(option, context, short ? setPieces!.required : undefined),
      completeSetPieces: short ? setPieces!.required : null
    };
  }

  /**
   * What choosing `option` in place of the current choice would do to the build, for each tracked
   * affix the option gives - the same comparison the rank colours make, so the current choice
   * changes nothing. What the current choice gives counts only towards the affixes the option
   * gives too: swapping one Dexterity augment for another is net of the one given up, but an
   * option for something else entirely isn't charged with the loss. A tracked compound the option
   * gives a part of counts too: Light Lore can complete Radiance Lore. Values are the build's own
   * totals with the item in its slot, so set bonuses are recounted with the pieces there really are -
   * or, with `setPieces`, for a set augment, as if its set had that many.
   */
  getCraftingOptionChanges(option: CraftableOption, context?: CraftingOptionContext, setPieces?: number): AffixChange[] {
    if (!context || !option) {
      return [];
    }
    const current = 'craft' in context ? context.craft.selected : context.item.bonuses[context.bonusKind];
    const withOption = new Item(context.item);
    if ('craft' in context) {
      withOption.crafting[context.item.crafting.indexOf(context.craft)].selected = option;
    } else {
      withOption.bonuses = { ...withOption.bonuses, [context.bonusKind]: option };
    }
    if (option.set && setPieces) {
      // The bonus the set would give at that count, as if the item gave it. (Best per bonus type,
      // so whatever of the set's bonus the build already has isn't counted twice.)
      withOption.affixes.push(...this.gearDb.getSetBonus(option.set, setPieces));
    }

    const given = (choice: CraftableOption | null | undefined) => this.affixSvc.flattenAffixGroups([
      ...(choice?.affixes ?? []),
      ...(choice?.set ? this.getSetBonusAffixes(choice.set) : [])
    ], true);
    const offered = given(option);
    const names = new Set(offered.map(affix => affix.name));
    const touched = [...offered, ...given(current).filter(affix => names.has(affix.name))];
    const tracked = this.equipped.getImportantAffixes();
    const compounds = [...tracked].filter(name => this.affixSvc.getCompoundParts(name)?.some(part => names.has(part)));

    const keys = new Map<string, { name: string; type: string }>();
    for (const affix of touched) {
      for (const name of [affix.name, ...compounds.filter(compound => this.affixSvc.getCompoundParts(compound)!.includes(affix.name))]) {
        if (tracked.has(name) && !FILIGREE_ONLY_BONUS_TYPES.has(affix.type)) {
          keys.set(`${name}\n${affix.type}`, { name, type: affix.type });
        }
      }
    }
    if (!keys.size) {
      return [];
    }
    const before = this.equipped.measureWith(context.item);
    const after = this.equipped.measureWith(withOption).value;
    return [...keys.values()].map(({ name, type }) => ({
      name, type,
      before: before.value(name, type),
      after: after(name, type),
      beforeSources: before.sources(name, type).map(source => describeSource(source, context.item.slot))
    }));
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
      // No helpful part means the parts are Outranked/Inactive: the first speaks for the whole.
      rank = HELPFUL_RANKS.find(helpful => ranks.includes(helpful)) ?? ranks[0];
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

/**
 * Where a value comes from, for a line of text: "Ring of Prowess (Ring 1)", an augment with the item
 * it's in, a set's bonus. The item the options are for, in `ownSlot`, is "this item".
 */
function describeSource(source: AffixSource, ownSlot: string): string {
  switch (source.kind) {
    case 'item': {
      const item = source.slot === ownSlot ? 'this item' : `${source.itemName}, ${source.slot}`;
      if (source.augmentName) {
        return `${source.augmentName} (${item})`;
      }
      return source.slot === ownSlot ? 'this item' : `${source.itemName} (${source.slot})`;
    }
    case 'set':
      return `${source.itemName} set bonus`;
    case 'filigree':
      return `${source.itemName} (filigree)`;
    case 'external':
      return `${source.itemName} (non-gear)`;
  }
}
