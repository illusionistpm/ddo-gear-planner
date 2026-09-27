import { Affix } from '../affixes/affix';
import { AffixRank, bestRankClass, compareRankClasses } from '../affixes/affix-rank.enum';
import { CraftingOptionRanking } from '../affixes/affix-ui.service';
import { CraftableOption } from '../gear/craftable-option';
import { CraftingOptionFamily } from '../gear/crafting-option-families';

/** One tier of a family, as the picker lists it under the expanded family. */
export interface TierRow {
  option: CraftableOption;
  /** "+15 (ML 36)" for a tier of a single valued affix; otherwise the option's own description. */
  label: string;
  /** The option's name beside the value; empty when the label already is the option. */
  name: string;
  className: string;
  tooltip: string;
}

/** One family, as the picker lists it. */
export interface FamilyRow {
  key: string;
  /** What it grants: "Dexterity", "Quickblade set", or '' for the empty option. */
  label: string;
  /** Beside the label: the bonus type, the value too when there is one tier, or a set's bonus. */
  detail: string;
  /** On the right: the tier range, the single option's name, or its note. */
  aside: string;
  /** Whether `aside` is a caveat (the set pieces) rather than plain information. */
  asideIsNote: boolean;
  /** The best rank class among the tiers. */
  className: string;
  tiers: TierRow[];
  searchText: string;
  /** Whether any tier does anything for the tracked affixes. */
  relevant: boolean;
  /** Whether "hide options that don't help" may hide it: the empty option has nothing to judge. */
  hideable: boolean;
}

/** The affix text the rows are written with; `AffixUiService` provides it. */
export interface CraftingOptionText {
  getAffixValue(affix: Affix): string;
  getAffixValueText(affix: Affix): string;
  describeSetBonus(set: string): string;
}

const IRRELEVANT = AffixRank[AffixRank.Irrelevant];

export function buildFamilyRows(
  families: CraftingOptionFamily[],
  rank: (option: CraftableOption) => CraftingOptionRanking,
  text: CraftingOptionText
): FamilyRow[] {
  return families.map(family => {
    const rankings = family.tiers.map(rank);
    const tiers = family.tiers.map((option, i) => {
      const value = singleValuedAffix(option);
      return {
        option,
        label: value ? tierValueLabel(option, value, text) : option.describe(),
        name: value ? option.name : '',
        className: rankings[i].className,
        tooltip: rankings[i].tooltip
      };
    });
    const first = family.tiers[0];
    const note = tiers.length === 1 ? rankings[0].note : '';
    const detail = familyDetail(family, text);
    return {
      key: family.key,
      label: family.label,
      detail,
      aside: note || familyAside(family, text),
      asideIsNote: !!note,
      className: bestRankClass(tiers.map(tier => tier.className)),
      tiers,
      searchText: [family.label, detail, ...family.tiers.map(option => option.describe())].join('\n').toLowerCase(),
      relevant: tiers.some(tier => tier.className !== IRRELEVANT),
      hideable: first.affixes.length > 0 || !!first.set
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

/** The affix a tier's value is read from: its only affix, when that has a real bonus type. */
function singleValuedAffix(option: CraftableOption): Affix | null {
  return option.affixes.length === 1 && option.affixes[0].hasRealType() ? option.affixes[0] : null;
}

function tierValueLabel(option: CraftableOption, affix: Affix, text: CraftingOptionText): string {
  const value = text.getAffixValue(affix) || String(affix.value);
  return option.ml ? `${value} (ML ${option.ml})` : value;
}

function familyDetail(family: CraftingOptionFamily, text: CraftingOptionText): string {
  const first = family.tiers[0];
  if (!first.affixes.length) {
    return first.set ? text.describeSetBonus(first.set) : '';
  }
  const typed = first.affixes.filter(affix => affix.hasRealType());
  // Tiers differ in value, so a family shows just the types; the range goes on the right.
  return family.tiers.length > 1
    ? typed.map(affix => affix.type).join(', ')
    : typed.map(affix => text.getAffixValueText(affix)).join(', ');
}

function familyAside(family: CraftingOptionFamily, text: CraftingOptionText): string {
  const first = family.tiers[0];
  if (family.tiers.length === 1) {
    // A set augment's name only repeats the set.
    return first.set ? '' : first.name;
  }
  const affix = singleValuedAffix(first);
  const last = family.tiers[family.tiers.length - 1];
  return affix
    ? `${text.getAffixValue(affix)} to ${text.getAffixValue(last.affixes[0])}`
    : `${family.tiers.length} options`;
}
