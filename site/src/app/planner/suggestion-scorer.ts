import { Affix } from '../affixes/affix';
import { AffixService } from '../affixes/affix.service';
import { BuildView, countSets, valuesForAffixType } from '../affixes/build-totals';
import { combineBonusTypeValues, isSummedBonusType } from '../affixes/summed-bonus-types';
import { Craftable } from '../gear/craftable';
import { CraftableOption } from '../gear/craftable-option';
import { GearDbService } from '../gear/gear-db.service';
import { Item } from '../gear/item';
import { isOptionHiddenByPacks } from '../gear/pack-filter';

/**
 * Scores a slot's candidate items for the suggestion drawer: what each would add to the build's
 * tracked affixes, in total value, once augments are accounted for.
 *
 * Total value is what the earlier scorer added up: each tracked affix is worth its weight in all,
 * and a bonus type counts for its share of the affix's best total. What changed is how sources are
 * credited (docs/suggestions-analysis.md, "Scorer v2"):
 *
 *  - The build's own empty crafting slots are filled first, greedily. A need an equipped item's open
 *    augment slot can carry stops counting for a candidate that carries it natively - Speed, which a
 *    level-8 Topaz gives almost anywhere, was the most over-suggested affix.
 *  - A candidate's own empty crafting slots count for what they would add, set-granting options (Lost
 *    Purpose, set augments) included, by the set bonus the extra piece would unlock.
 *  - Until the build has a minor artifact, one is assumed: endgame builds all wear one, and nearly
 *    all of those carry Blue, Green and Yellow augment slots. An artifact candidate is scored
 *    without that stand-in, since it would replace it.
 *
 *  - Basic's seldom-filled utility effects count for a quarter (UTILITY_AFFIXES).
 *
 * In a simulation, against an expert's priorities and against 1,316 slots of players' saved builds,
 * this beat the earlier scorer (docs/suggestions-analysis.md), and it is quicker. Crafting rules that span slots
 * (one of each Slaver's affix, say) aren't modelled, so the augment filling is optimistic.
 */

/**
 * Basic-bundle utility effects that saved endgame builds track but seldom fill (under 35% of the
 * builds tracking each cover it; Concealment 13%), and that an expert's priority lists leave out.
 * Concealment, a single bonus type, would otherwise give a whole affix's worth from one item and
 * crowd the suggestions. They count at UTILITY_WEIGHT of the usual.
 */
export const UTILITY_AFFIXES: ReadonlySet<string> = new Set([
  'Concealment', 'Immunity to Fear', 'Heroic Inspiration', 'Undying', 'Feather Falling', 'Incorporeality',
]);
export const UTILITY_WEIGHT = 0.25;

export function utilityWeightFactor(affixName: string): number {
  return UTILITY_AFFIXES.has(affixName) ? UTILITY_WEIGHT : 1;
}

/** What the scorer reads from the planner. */
export interface SuggestionScorerInputs {
  view: BuildView;
  affixSvc: AffixService;
  gearDB: GearDbService;
  /** Each slot and its item, for set counting. */
  slots: Iterable<[string, Item | null]>;
  /** The tracked affixes. */
  tracked: Iterable<string>;
  /** Bonus types the player ignores for an affix. */
  isIgnored(affixName: string, bonusType: string): boolean;
  maxLevel: number;
  hiddenPacks: ReadonlySet<string>;
  /** A factor on an affix's weight, for affixes to count for less than the usual (default: none). */
  weightFactor?: (affixName: string) => number;
}

interface Need {
  affix: string;
  type: string;
  best: number;
  /** The affix's best total over its bonus types times its weight: what a need's value is divided by. */
  scale: number;
  summed: boolean;
}

/** Need index -> value an item, option or set bonus gives it. */
type Contribution = Map<number, number>;

interface Choice {
  contribution: Contribution;
  set: string;
  option: CraftableOption;
  /** The crafting system the option belongs to, for a craftable with systems; '' otherwise. */
  system: string;
}

/** A crafting option the scorer would put in one of an item's empty crafting slots. */
export interface SuggestedCraft {
  /** The slot's index in the item's `crafting`. */
  index: number;
  option: CraftableOption;
  system: string;
}

/**
 * Scores a candidate (see makeSuggestionScorer). `suggestedCrafting` says what it would put in the
 * candidate's empty crafting slots - the options the score counts - so the drawer can show them.
 */
export type SuggestionScorer = ((item: Item) => number) & {
  suggestedCrafting(item: Item): SuggestedCraft[];
};

/** How many of each crafting list's options to try per candidate, best first against the build. */
const CHOICES_PER_LIST = 12;

const PLANNED_ARTIFACT_SLOTS = 'Blue Augment Slot|Green Augment Slot|Yellow Augment Slot';

export function makeSuggestionScorer(inputs: SuggestionScorerInputs, slot: string): SuggestionScorer {
  const { affixSvc, gearDB } = inputs;
  const needs = trackedNeeds(inputs);
  if (!needs.length) {
    return Object.assign(() => 0, { suggestedCrafting: () => [] });
  }
  const byAffix = new Map<string, number[]>();
  needs.forEach((need, i) => byAffix.set(need.affix, [...(byAffix.get(need.affix) ?? []), i]));
  const indexOf = new Map(needs.map((need, i) => [`${need.affix}|${need.type}`, i]));

  /** What `affixes` give the needs: an item's, flattened as the planner counts them. */
  const itemContribution = (affixes: ReadonlyArray<Affix>): Contribution => {
    const result: Contribution = new Map();
    for (const affix of affixSvc.flattenAffixGroups(affixes, true)) {
      const i = indexOf.get(`${affix.name}|${affix.type}`);
      if (i !== undefined && affix.value > 0) {
        result.set(i, needs[i].summed ? (result.get(i) ?? 0) + affix.value : Math.max(result.get(i) ?? 0, affix.value));
      }
    }
    return result;
  };
  /** What a set bonus gives the needs: each member of a group at the group's value, as sets do. */
  const setContribution = (affixes: ReadonlyArray<Affix>): Contribution => {
    const result: Contribution = new Map();
    for (const affix of affixes) {
      for (const [affixName, indexes] of byAffix) {
        if (!affixSvc.resolvesToAffix(affix.name, affixName)) {
          continue;
        }
        for (const i of indexes) {
          if (needs[i].type === affix.type && affix.value > 0) {
            result.set(i, Math.max(result.get(i) ?? 0, affix.value));
          }
        }
      }
    }
    return result;
  };

  const perNeed = (i: number, value: number) => Math.min(value, needs[i].best) / needs[i].scale;
  const gainOf = (values: readonly number[], contribution: Contribution) => {
    let gain = 0;
    for (const [i, value] of contribution) {
      const next = needs[i].summed ? values[i] + value : Math.max(values[i], value);
      gain += perNeed(i, next) - perNeed(i, values[i]);
    }
    return gain;
  };
  const apply = (values: number[], contribution: Contribution) => {
    for (const [i, value] of contribution) {
      values[i] = needs[i].summed ? values[i] + value : Math.max(values[i], value);
    }
  };

  // The build without this slot's item: its set bonuses recounted without it.
  const others = Array.from(inputs.slots).filter(([s, item]) => s !== slot && item) as Array<[string, Item]>;
  const setsWithout = [...countSets(others)].map(([set, pieces]) => [set, gearDB.getSetBonus(set, pieces)] as [string, Affix[]]);
  const baseValues = needs.map(need => combineBonusTypeValues(need.type,
    valuesForAffixType(inputs.view, affixSvc, need.affix, need.type, { skipSlot: slot, setBonuses: setsWithout })
      .map(entry => entry.value)));

  const choiceCache = new Map<string, Choice[]>();
  const choicesFor = (craftable: Craftable): Choice[] => {
    const key = [craftable.name, craftable.craftingSystemOptions.join(','), craftable.options.length,
      craftable.options[1]?.name ?? '', craftable.options[craftable.options.length - 1]?.name ?? ''].join('|');
    let choices = choiceCache.get(key);
    if (!choices) {
      choices = optionsOf(craftable, inputs.maxLevel, inputs.hiddenPacks)
        .map(({ option, system }) => ({ contribution: itemContribution(option.affixes), set: option.set, option, system }))
        .filter(choice => choice.contribution.size > 0 || choice.set);
      choiceCache.set(key, choices);
    }
    return choices;
  };

  const otherSetNames = others.flatMap(([, item]) => item.getSets() ?? []);
  /** What a set choice adds: the bonuses every set reaches with `sets` counted too. */
  const setGain = (sets: string[]): Contribution => {
    const merged: Contribution = new Map();
    const counts = new Map<string, number>();
    [...otherSetNames, ...sets].forEach(set => counts.set(set, (counts.get(set) ?? 0) + 1));
    for (const set of new Set(sets)) {
      for (const [i, value] of setContribution(gearDB.getSetBonus(set, counts.get(set) ?? 0))) {
        merged.set(i, Math.max(merged.get(i) ?? 0, value));
      }
    }
    return merged;
  };

  /**
   * Fills empty crafting slots greedily: repeatedly the (slot, option) that gains most, until none
   * does. Returns the values reached; `sets` gains the sets chosen.
   */
  const fill = (start: number[], craftables: Craftable[], sets: string[]): number[] => {
    const values = start.slice();
    const pending = craftables.filter(c => !c.selected?.affixes.length && !c.selected?.set).map(c => choicesFor(c));
    while (pending.length) {
      let best: { p: number; contribution: Contribution; set: string; gain: number } | null = null;
      for (let p = 0; p < pending.length; p++) {
        for (const choice of pending[p]) {
          const contribution = choice.set ? merge(choice.contribution, setGain([...sets, choice.set])) : choice.contribution;
          const gain = gainOf(values, contribution);
          if (gain > 1e-9 && (!best || gain > best.gain)) {
            best = { p, contribution, set: choice.set, gain };
          }
        }
      }
      if (!best) {
        break;
      }
      const { p, contribution, set } = best;
      apply(values, contribution);
      if (set) {
        sets.push(set);
      }
      pending.splice(p, 1);
    }
    return values;
  };

  const otherCraftables = others.flatMap(([, item]) => item.crafting ?? []);
  const filledBase = fill(baseValues, otherCraftables, []);
  const hasArtifact = others.some(([, item]) => item.artifact);
  const stand = hasArtifact ? null : plannedArtifactCraftables(gearDB);
  const plannedBase = stand ? fill(filledBase, stand, []) : filledBase;

  // Only the options worth anything against the filled build can be worth anything to a candidate
  // (a candidate only raises values), and only the best few are tried per list. Set-granting options
  // are judged apart: what one is worth depends on the candidate's other pieces, so every one whose
  // set gives a tracked affix at some piece count is kept.
  const setMatters = new Map<string, boolean>();
  const setGivesTracked = (set: string) => {
    let matters = setMatters.get(set);
    if (matters === undefined) {
      matters = setContribution(gearDB.getSetBonus(set, 99)).size > 0;
      setMatters.set(set, matters);
    }
    return matters;
  };
  const shortlist = new Map<Choice[], Choice[]>();
  const shortlistFor = (craftable: Craftable, against: number[]): Choice[] => {
    const all = choicesFor(craftable);
    let short = shortlist.get(all);
    if (!short) {
      const plain = all
        .filter(choice => !choice.set)
        .map(choice => ({ choice, gain: gainOf(against, choice.contribution) }))
        .filter(entry => entry.gain > 1e-9)
        .sort((a, b) => b.gain - a.gain)
        .slice(0, CHOICES_PER_LIST)
        .map(entry => entry.choice);
      short = [...plain, ...all.filter(choice => choice.set && setGivesTracked(choice.set))];
      shortlist.set(all, short);
    }
    return short;
  };

  /** The candidate's values with its own crafting filled, and what was put where. */
  const evaluate = (item: Item): { base: number[]; values: number[]; crafts: SuggestedCraft[] } => {
    const base = item.artifact ? filledBase : plannedBase;
    const values = base.slice();
    const crafts: SuggestedCraft[] = [];
    apply(values, itemContribution(affixSvc.getActiveAffixes(item)));
    const sets = [...(item.getSets() ?? [])];
    if (sets.length) {
      apply(values, setGain(sets));
    }
    (item.crafting ?? []).forEach((craftable, index) => {
      if (craftable.selected?.affixes.length || craftable.selected?.set) {
        return;
      }
      let best: { choice: Choice; contribution: Contribution; gain: number } | null = null;
      for (const choice of shortlistFor(craftable, base)) {
        const contribution = choice.set ? merge(choice.contribution, setGain([...sets, choice.set])) : choice.contribution;
        const gain = gainOf(values, contribution);
        if (gain > 1e-9 && (!best || gain > best.gain)) {
          best = { choice, contribution, gain };
        }
      }
      if (best) {
        apply(values, best.contribution);
        if (best.choice.set) {
          sets.push(best.choice.set);
        }
        crafts.push({ index, option: best.choice.option, system: best.choice.system });
      }
    });
    return { base, values, crafts };
  };

  const score = (item: Item) => {
    const { base, values } = evaluate(item);
    let total = 0;
    for (let i = 0; i < needs.length; i++) {
      if (values[i] !== base[i]) {
        total += perNeed(i, values[i]) - perNeed(i, base[i]);
      }
    }
    return total;
  };
  return Object.assign(score, { suggestedCrafting: (item: Item) => evaluate(item).crafts });
}

function trackedNeeds(inputs: SuggestionScorerInputs): Need[] {
  const needs: Need[] = [];
  for (const affix of inputs.tracked) {
    const types = inputs.gearDB.affixToBonusTypes.get(affix);
    if (!types) {
      continue;
    }
    const affixBest = inputs.gearDB.getBestValueForAffix(affix);
    const weight = inputs.gearDB.getAffixWeight(affix, affixBest) * (inputs.weightFactor?.(affix) ?? 1);
    if (!(affixBest > 0) || !(weight > 0)) {
      continue;
    }
    for (const type of types.keys()) {
      const best = inputs.gearDB.getBestValueForAffixType(affix, type);
      if (best > 0 && !inputs.isIgnored(affix, type)) {
        needs.push({ affix, type, best, scale: affixBest / weight, summed: isSummedBonusType(type) });
      }
    }
  }
  return needs;
}

function merge(a: Contribution, b: Contribution): Contribution {
  if (!b.size) {
    return a;
  }
  const merged: Contribution = new Map(a);
  for (const [i, value] of b) {
    merged.set(i, Math.max(merged.get(i) ?? 0, value));
  }
  return merged;
}

/** The options a craftable can take, across its crafting systems, within the filters. */
function optionsOf(craftable: Craftable, maxLevel: number, hiddenPacks: ReadonlySet<string>): Array<{ option: CraftableOption; system: string }> {
  const usable = (option: CraftableOption) => (option.affixes.length > 0 || !!option.set)
    && option.isWithinMaxLevel(maxLevel) && !isOptionHiddenByPacks(option, hiddenPacks);
  if (!craftable.hasCraftingSystemOptions()) {
    return craftable.options.filter(usable).map(option => ({ option, system: '' }));
  }
  const options: Array<{ option: CraftableOption; system: string }> = [];
  for (const system of craftable.craftingSystemOptions) {
    const probe = craftable.clone();
    probe.selectCraftingSystem(system);
    options.push(...probe.options.filter(usable).map(option => ({ option, system })));
  }
  return options;
}

/**
 * A copy of `item` with `crafts` selected in its crafting slots: what the drawer shows, and equips,
 * for a suggestion. The gear database's item is left alone.
 */
export function withSuggestedCrafting(item: Item, crafts: ReadonlyArray<SuggestedCraft>): Item {
  // Always a copy, even with nothing to select: the drawer lets the player change the crafting
  // before equipping, and that must never touch the gear database's shared item.
  const copy = new Item(item);
  for (const { index, option, system } of crafts) {
    const craftable = copy.crafting?.[index];
    if (!craftable) {
      continue;
    }
    if (system) {
      craftable.selectCraftingSystem(system);
    }
    const match = craftable.options.find(candidate => candidate === option);
    if (match) {
      craftable.selected = match;
    }
  }
  return copy;
}

/** The Blue, Green and Yellow augment slots of a filtered minor artifact, or null if none has them. */
function plannedArtifactCraftables(gearDB: GearDbService): Craftable[] | null {
  for (const slot of gearDB.getSlots()) {
    for (const item of gearDB.getFilteredGearBySlot(slot) ?? []) {
      if (item.artifact && (item.crafting ?? []).map(c => c.name).sort().join('|') === PLANNED_ARTIFACT_SLOTS) {
        return item.crafting!;
      }
    }
  }
  return null;
}
