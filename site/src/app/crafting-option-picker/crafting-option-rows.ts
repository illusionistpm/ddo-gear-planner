import { Affix } from '../affixes/affix';
import { isSummedBonusType } from '../affixes/summed-bonus-types';
import { AffixRank, bestRankClass, compareRankClasses } from '../affixes/affix-rank.enum';
import { AffixChange, CraftingOptionRanking } from '../affixes/affix-ui.service';
import { CraftableOption } from '../gear/craftable-option';
import { CraftingOptionFamily } from '../gear/crafting-option-families';

/** What an option would add to the build, as the figure at the end of its row. */
export interface GainChip {
  /** "+2", or "+2 Strength, +2 Dexterity" when the option touches several tracked affixes. */
  text: string;
  /** What the figure assumes, beside it: "at 3 pcs" for a set augment whose set is short. */
  condition: string;
  /** Whether the build ends up better or worse off, neither ('none'), or some of each ('mixed'). */
  direction: 'up' | 'down' | 'none' | 'mixed';
}

/** One tier of a family, as the picker lists it under the expanded family. */
export interface TierRow {
  option: CraftableOption;
  /** "+15 (ML 36)" for a tier of a single valued affix; otherwise the option's own description. */
  label: string;
  /** The option's name beside the value; empty when the label already is the option. */
  name: string;
  className: string;
  /** Whether the trove has this option. */
  owned: boolean;
  /** What switching to it would do to the tracked affixes; null when it touches none of them. */
  gain: GainChip | null;
  /** How much switching is worth when tiers are compared: the changes added up. */
  gainScore: number;
  /** The detail under the list while the row is highlighted: one "False Life: +55 → +57 Vitality · beats ..." per tracked affix. */
  changeLines: string[];
  /** What the change lines assume, above them: "With 3 set pieces", for a short set. */
  changeCondition: string;
}

/** One family, as the picker lists it. */
export interface FamilyRow {
  key: string;
  /** What it grants: "Dexterity", "Quickblade set", or '' for the empty option. */
  label: string;
  /**
   * Beside the label, each part kept whole when the row wraps: the bonus types and the tiers'
   * value range, the value too when there is one tier, or a set's bonuses.
   */
  detailParts: string[];
  /** On the right: the single option's name, or its note. */
  aside: string;
  /** Whether `aside` is a caveat (the set pieces) rather than plain information. */
  asideIsNote: boolean;
  /** The best rank class among the tiers. */
  className: string;
  tiers: TierRow[];
  searchText: string;
  /** Whether any tier does anything for the tracked affixes. */
  relevant: boolean;
  /**
   * Whether "hide options that don't help" may hide it: the empty option has nothing to judge. A named
   * option the planner can't express (a curse like Masterworks) can be, so it hides like any irrelevant one.
   */
  hideable: boolean;
  /** Whether the trove has any of its tiers. */
  owned: boolean;
  /** The tier that adds the most, whose gain the family shows while its tiers are folded away. */
  bestTier: TierRow;
}

/** The affix text the rows are written with; `AffixUiService` provides it. */
export interface CraftingOptionText {
  getAffixValue(affix: Affix): string;
  getAffixValueText(affix: Affix): string;
  describeSetBonusParts(set: string): string[];
}

const IRRELEVANT = AffixRank[AffixRank.Irrelevant];

export function buildFamilyRows(
  families: CraftingOptionFamily[],
  rank: (option: CraftableOption) => CraftingOptionRanking,
  text: CraftingOptionText,
  isOwned: (option: CraftableOption) => boolean = () => false
): FamilyRow[] {
  return families.map(family => {
    const rankings = family.tiers.map(rank);
    const tiers = family.tiers.map((option, i) => {
      const ranking = rankings[i];
      const value = singleValuedAffix(option);
      const pieces = ranking.completeSetPieces;
      const gain = gainChip(ranking.changes, !isOnlyAbout(option, ranking.changes), pieces ? `at ${pieces} pcs` : '');
      return {
        option,
        label: value ? tierValueLabel(option, value, text) : option.describe(),
        name: value ? option.name : '',
        className: netRank(ranking.className, gain) ?? ranking.className,
        owned: isOwned(option),
        gain,
        gainScore: ranking.changes.reduce((total, change) => total + change.after - change.before, 0),
        changeLines: ranking.changes.map(describeChange),
        changeCondition: pieces && ranking.changes.length ? `With ${pieces} set pieces` : ''
      };
    });
    const first = family.tiers[0];
    const note = tiers.length === 1 ? rankings[0].note : '';
    const detailParts = familyDetailParts(family, text);
    return {
      key: family.key,
      label: family.label,
      detailParts,
      aside: note || familyAside(family),
      asideIsNote: !!note,
      className: bestRankClass(tiers.map(tier => tier.className)),
      tiers,
      searchText: [family.label, ...detailParts, ...family.tiers.map(option => option.describe())].join('\n').toLowerCase(),
      relevant: tiers.some(tier => tier.className !== IRRELEVANT),
      hideable: first.affixes.length > 0 || !!first.set || !!first.name,
      owned: tiers.some(tier => tier.owned),
      // The highest of equally good tiers, as `defaultTier` opens a family at.
      bestTier: tiers.reduce((best, tier) => tier.gainScore >= best.gainScore ? tier : best)
    };
  });
}

/**
 * The tier a user most likely wants when opening a family: the selected one if it is in the
 * family, otherwise the best-ranked, and the highest among equally ranked tiers.
 */
export function defaultTier(family: FamilyRow, selected: CraftableOption | null): TierRow {
  const current = family.tiers.find(tier => tier.option === selected);
  if (current) {
    return current;
  }
  let best = family.tiers[family.tiers.length - 1];
  for (let i = family.tiers.length - 2; i >= 0; i--) {
    if (compareRankClasses(family.tiers[i].className, best.className) < 0) {
      best = family.tiers[i];
    }
  }
  return best;
}

/** At most this many affixes are spelled out in a gain; the rest are counted. */
const MAX_GAIN_PARTS = 2;

/**
 * The gain an option's row ends with. `named` says the figures need their affix beside them: an
 * option with one affix is its own label, but "+2" on a set augment or a dual prefix could be anything.
 */
export function gainChip(changes: AffixChange[], named: boolean, condition = ''): GainChip | null {
  if (!changes.length) {
    return null;
  }
  // Bonus types of one affix add up, so the figure is the net change to its total: swapping a +5
  // Insight for a +2 Festive is -3, not "+2, -5". (An on/off effect has one type, so nets as itself.)
  const byAffix = new Map<string, { delta: number; type: string }>();
  for (const change of changes) {
    const entry = byAffix.get(change.name) ?? { delta: 0, type: change.type };
    entry.delta += change.after - change.before;
    byAffix.set(change.name, entry);
  }
  const moved = [...byAffix].filter(([, { delta }]) => Math.round(delta * 100) !== 0);
  if (!moved.length) {
    return { text: '\u2014', direction: 'none', condition: '' };
  }
  const parts = moved.map(([name, { delta, type }]) => {
    if (!Affix.isRealType(type)) {
      // An on/off effect has nothing to count: the build gets it, or loses it.
      return named ? `${delta > 0 ? '' : 'lose '}${name}` : delta > 0 ? 'new' : 'lost';
    }
    return named ? `${signed(delta)} ${name}` : signed(delta);
  });
  const shown = parts.slice(0, MAX_GAIN_PARTS);
  if (parts.length > shown.length) {
    shown.push(`+${parts.length - shown.length} more`);
  }
  const up = moved.some(([, { delta }]) => delta > 0);
  const down = moved.some(([, { delta }]) => delta < 0);
  return { text: shown.join(', '), direction: up && down ? 'mixed' : up ? 'up' : 'down', condition };
}

/** Ranks the net change may recolour: not a penalty or a mix with one, whose red says more than any total. */
const NET_RECOLOURABLE: ReadonlySet<string> = new Set([
  AffixRank.BetterThanBest, AffixRank.Best, AffixRank.BestTied, AffixRank.Outranked, AffixRank.Irrelevant
].map(rank => AffixRank[rank]));

/**
 * The colour the net change calls for, where it disagrees with the rank's. The rank judges each
 * bonus type alone, so swapping a +5 Insight for a +2 Festive ranks as the best Festive (purple)
 * while the total drops by 3; and a part of a tracked compound ranks Irrelevant while it completes
 * the compound. A loss is orange and a gain purple, as switching would make them. Null to keep the rank.
 */
function netRank(className: string, gain: GainChip | null): string | null {
  if (!gain || !NET_RECOLOURABLE.has(className.split(' ')[0])) {
    return null;
  }
  const target = gain.direction === 'down' ? AffixRank.Outranked : gain.direction === 'up' ? AffixRank.BetterThanBest : null;
  if (target === null || className === AffixRank[target]) {
    return null;
  }
  return AffixRank[target];
}

/** At most this many sources are named on a change line; the rest are counted. */
const MAX_SOURCES = 2;

/**
 * "False Life: +55 → +57 Vitality · beats Ring of Prowess (Ring 1)": the value before and after, and
 * what gives the build the value it has now - what the option would beat, lose, add to, or leave be.
 */
function describeChange(change: AffixChange): string {
  return describeValues(change) + describeSources(change);
}

function describeValues({ name, type, before, after }: AffixChange): string {
  if (!Affix.isRealType(type)) {
    return `${name}: ${after === before ? (after ? 'already have it' : 'no change') : after > before ? 'new' : 'lost'}`;
  }
  const value = (amount: number) => amount ? signed(amount) : '0';
  if (!after && !before) {
    return `${name}: no change`;
  }
  return after === before
    ? `${name}: stays ${value(before)} ${type}`
    : `${name}: ${value(before)} \u2192 ${value(after)} ${type}`;
}

function describeSources({ type, before, after, beforeSources }: AffixChange): string {
  if (!before || !beforeSources.length) {
    return '';
  }
  // A summed type's sources all count, so a gain adds to them rather than beating them.
  const verb = after > before ? (isSummedBonusType(type) ? 'adds to' : 'beats') : after < before ? 'loses' : 'from';
  const named = beforeSources.slice(0, MAX_SOURCES);
  if (beforeSources.length > named.length) {
    named.push(`${beforeSources.length - named.length} more`);
  }
  return ` \u00B7 ${verb} ${named.join(', ')}`;
}

/** Whether every change is to the option's one affix, so a bare figure can't be misread. */
function isOnlyAbout(option: CraftableOption, changes: AffixChange[]): boolean {
  return option.affixes.length === 1 && changes.every(change => change.name === option.affixes[0].name);
}

function signed(amount: number): string {
  // Summed fractions (a 0.5 on top of a 2.5) would otherwise trail floating-point noise.
  const rounded = Math.round(amount * 100) / 100;
  return rounded > 0 ? `+${rounded}` : `\u2212${Math.abs(rounded)}`;
}

/** The affix a tier's value is read from: its only affix, when that has a real bonus type. */
function singleValuedAffix(option: CraftableOption): Affix | null {
  return option.affixes.length === 1 && option.affixes[0].hasRealType() ? option.affixes[0] : null;
}

function tierValueLabel(option: CraftableOption, affix: Affix, text: CraftingOptionText): string {
  const value = text.getAffixValue(affix) || String(affix.value);
  return option.ml ? `${value} (ML ${option.ml})` : value;
}

function familyDetailParts(family: CraftingOptionFamily, text: CraftingOptionText): string[] {
  const first = family.tiers[0];
  if (!first.affixes.length) {
    return first.set ? text.describeSetBonusParts(first.set) : [];
  }
  const typed = first.affixes.filter(affix => affix.hasRealType());
  // Each only once: a Mythic Boost's +3 to PRR and MRR reads "+3 Mythic", not "+3 Mythic, +3 Mythic".
  if (family.tiers.length === 1) {
    return [...new Set(typed.map(affix => text.getAffixValueText(affix)))];
  }
  // Tiers differ in value, so a family shows its types and the range of values, keeping the
  // right-hand edge for what choosing it adds.
  return [...new Set(typed.map(affix => affix.type)), familyRange(family, text)];
}

function familyRange(family: CraftingOptionFamily, text: CraftingOptionText): string {
  const affix = singleValuedAffix(family.tiers[0]);
  const last = family.tiers[family.tiers.length - 1];
  return affix
    ? `${text.getAffixValue(affix)} to ${text.getAffixValue(last.affixes[0])}`
    : `${family.tiers.length} options`;
}

/** A single option's name; a set augment's only repeats the set, and an option with no affixes is labelled by its name. */
function familyAside(family: CraftingOptionFamily): string {
  const first = family.tiers[0];
  return family.tiers.length > 1 || first.set || !first.affixes.length ? '' : first.name;
}
