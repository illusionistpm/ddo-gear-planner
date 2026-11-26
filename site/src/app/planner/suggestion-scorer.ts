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
 *  - For a build that fights with weapons, a weapon's [W] counts too (weaponDiceCredit): it is most of
 *    what separates an endgame weapon from an older one, and no affix carries it. It's a penalty for
 *    [W] below the best available, so it never lifts a weapon over a shield.
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

/** Tracking any of these marks a build that fights with weapons, whose weapon's [W] counts. */
export const WEAPON_BUILD_AFFIXES: ReadonlySet<string> = new Set(['Melee Power', 'Ranged Power', 'Doublestrike', 'Doubleshot']);
/**
 * The dice average one [W] is taken at: a 1d8+2, the typical endgame one-hander. A fixed die, not the
 * weapon's own, so that weapon types - the build's choice, made for its feats - aren't ranked by their
 * dice: a falchion would otherwise always beat a rapier.
 */
export const REFERENCE_DICE_AVERAGE = 6.5;
/** Damage per hit from 2 points of the attribute a weapon uses: the unit a [W] is valued in. */
const ATTRIBUTE_POINTS_PER_DAMAGE = 2;

/**
 * What a weapon's [W] is worth to the score of a build that fights with weapons, in the score's own
 * units: its damage, at REFERENCE_DICE_AVERAGE per [W], as the attribute points that would add as
 * much, at Strength's weight. One [W] is 13 points of the attribute, about 0.8 at cap.
 *
 * It's measured against the best [W] within the filters, so it's 0 for the best weapons and a
 * penalty below them, never a bonus: an Offhand's shields, orbs and rune arms have no [W], and a
 * bonus every weapon got would bury them (in players' saved builds it took the Offhand they chose
 * from rank 147 to 732 on average).
 */
export function weaponDiceCredit(gearDB: GearDbService): (item: Item) => number {
  const best = gearDB.getBestValueForAffix('Strength');
  const perPoint = best > 0 ? gearDB.getAffixWeight('Strength', best) / best : 0;
  const perW = REFERENCE_DICE_AVERAGE * ATTRIBUTE_POINTS_PER_DAMAGE * perPoint;
  let bestW = 0;
  for (const item of gearDB.getFilteredGearBySlot('Weapon') ?? []) {
    bestW = Math.max(bestW, item.damage?.w ?? 0);
  }
  return item => item.damage ? (item.damage.w - bestW) * perW : 0;
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
  /** A factor on weaponDiceCredit (default 1), for the suggestion harness to tune it. */
  weaponDiceFactor?: number;
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

/** An empty crafting slot of one item, with the options to try in it. */
interface Pending {
  craftable: Craftable;
  /** Its index in the item's crafting. */
  index: number;
  rules: CraftingRules;
  choices: Choice[];
}

/**
 * The crafting rules that span one item's slots, as the planner's UI applies them (Item.isCraftingSlotOpen,
 * Item.isOptionAllowed), tracked through a fill:
 *
 *  - A slot another slot's option can add (the Green, Orange or Purple slot a Legendary Alchemical Tier 3
 *    opens) is usable only once an option that adds it is chosen.
 *  - An option bound to other slots' element (Tier 3 takes Tier 1's or Tier 2's) needs one of them still
 *    empty or matching. Once chosen against empty ones, one of those must stay free for that element.
 */
export class CraftingRules {
  private readonly elements = new Map<string, string>();
  private readonly opened = new Set<string>();
  private readonly addable = new Set<string>();
  private readonly required: Array<{ systems: ReadonlyArray<string>; element: string }> = [];

  constructor(craftables: ReadonlyArray<Craftable>) {
    for (const craftable of craftables) {
      if (craftables.some(other => other !== craftable && other.canAddCraftingSystem(craftable.name))) {
        this.addable.add(craftable.name);
      }
    }
    for (const craftable of craftables) {
      const selected = craftable.selected;
      if (selected?.affixes.length || selected?.set) {
        this.choose(craftable, selected);
      }
    }
  }

  isOpen(craftable: Craftable): boolean {
    return !this.addable.has(craftable.name) || this.opened.has(craftable.name);
  }

  allows(craftable: Craftable, option: CraftableOption): boolean {
    if (option.elementFrom.length
      && !option.elementFrom.some(system => (this.elements.get(system) ?? option.element) === option.element)) {
      return false;
    }
    // Don't take the last slot a chosen element-bound option was counting on with another element.
    return this.required.every(({ systems, element }) => !systems.includes(craftable.name) || option.element === element
      || systems.some(system => system !== craftable.name && (this.elements.get(system) ?? element) === element));
  }

  choose(craftable: Craftable, option: CraftableOption) {
    if (option.element) {
      this.elements.set(craftable.name, option.element);
    }
    option.addsCrafting.forEach(name => this.opened.add(name));
    if (option.elementFrom.length && !option.elementFrom.some(system => this.elements.get(system) === option.element)) {
      this.required.push({ systems: option.elementFrom, element: option.element });
    }
  }
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
  const tracked = new Set(inputs.tracked);
  const weaponFactor = inputs.weaponDiceFactor ?? 1;
  const diceCredit = weaponDiceCredit(gearDB);
  const weaponCredit = weaponFactor && [...WEAPON_BUILD_AFFIXES].some(affix => tracked.has(affix))
    ? (item: Item) => diceCredit(item) * weaponFactor : () => 0;
  if (!needs.length) {
    return Object.assign((item: Item) => weaponCredit(item), { suggestedCrafting: () => [] });
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
  const setGainCache = new Map<string, Contribution>();
  const setGain = (sets: string[]): Contribution => {
    const key = sets.slice().sort().join('|');
    const cached = setGainCache.get(key);
    if (cached) {
      return cached;
    }
    const merged: Contribution = new Map();
    const counts = new Map<string, number>();
    [...otherSetNames, ...sets].forEach(set => counts.set(set, (counts.get(set) ?? 0) + 1));
    for (const set of new Set(sets)) {
      for (const [i, value] of setContribution(gearDB.getSetBonus(set, counts.get(set) ?? 0))) {
        merged.set(i, Math.max(merged.get(i) ?? 0, value));
      }
    }
    setGainCache.set(key, merged);
    return merged;
  };

  /**
   * Fills empty crafting slots greedily: repeatedly the (slot, option) that gains most, until none
   * does, within each item's crafting rules (CraftingRules). `values` and `sets` gain what is chosen;
   * `picked` hears of each choice.
   */
  const fillGreedily = (values: number[], pending: Pending[], sets: string[],
                        picked?: (entry: Pending, choice: Choice) => void) => {
    pending = pending.slice();
    while (pending.length) {
      let best: { p: number; choice: Choice; contribution: Contribution; gain: number } | null = null;
      for (let p = 0; p < pending.length; p++) {
        const entry = pending[p];
        if (!entry.rules.isOpen(entry.craftable)) {
          continue;
        }
        for (const choice of entry.choices) {
          if (!entry.rules.allows(entry.craftable, choice.option)) {
            continue;
          }
          const contribution = choice.set ? merge(choice.contribution, setGain([...sets, choice.set])) : choice.contribution;
          // An option that opens a slot is worth what that slot could then add, too.
          const gain = gainOf(values, contribution) + openedGain(values, contribution, entry, choice.option, pending);
          if (gain > 1e-9 && (!best || gain > best.gain)) {
            best = { p, choice, contribution, gain };
          }
        }
      }
      if (!best) {
        break;
      }
      const entry = pending[best.p];
      apply(values, best.contribution);
      if (best.choice.set) {
        sets.push(best.choice.set);
      }
      entry.rules.choose(entry.craftable, best.choice.option);
      picked?.(entry, best.choice);
      pending.splice(best.p, 1);
    }
  };
  /** The most a slot `option` opens on the item could add on top of `contribution`. */
  const openedGain = (values: number[], contribution: Contribution, entry: Pending, option: CraftableOption,
                      pending: Pending[]): number => {
    if (!option.addsCrafting.length) {
      return 0;
    }
    const after = values.slice();
    apply(after, contribution);
    let total = 0;
    for (const name of option.addsCrafting) {
      const opened = pending.find(other => other.rules === entry.rules && other.craftable.name === name
        && !entry.rules.isOpen(other.craftable));
      let bestGain = 0;
      for (const choice of opened?.choices ?? []) {
        if (!choice.set) {
          bestGain = Math.max(bestGain, gainOf(after, choice.contribution));
        }
      }
      total += bestGain;
    }
    return total;
  };
  /** An item's empty crafting slots, each with the options to try in it. */
  const pendingOf = (craftables: ReadonlyArray<Craftable>, choicesOf: (craftable: Craftable) => Choice[]): Pending[] => {
    const rules = new CraftingRules(craftables);
    return craftables
      .map((craftable, index) => ({ craftable, index, rules, choices: [] as Choice[] }))
      .filter(entry => !entry.craftable.selected?.affixes.length && !entry.craftable.selected?.set)
      .map(entry => ({ ...entry, choices: choicesOf(entry.craftable) }));
  };
  /** Fills the empty crafting slots of `items` (their craftables), returning the values reached. */
  const fill = (start: number[], items: ReadonlyArray<ReadonlyArray<Craftable>>): number[] => {
    const values = start.slice();
    fillGreedily(values, items.flatMap(craftables => pendingOf(craftables, choicesFor)), []);
    return values;
  };

  const filledBase = fill(baseValues, others.map(([, item]) => item.crafting ?? []));
  const hasArtifact = others.some(([, item]) => item.artifact);
  const stand = hasArtifact ? null : plannedArtifactCraftables(gearDB);
  const plannedBase = stand ? fill(filledBase, [stand]) : filledBase;

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
    fillGreedily(values, pendingOf(item.crafting ?? [], craftable => shortlistFor(craftable, base)), sets,
      (entry, choice) => crafts.push({ index: entry.index, option: choice.option, system: choice.system }));
    crafts.sort((a, b) => a.index - b.index);
    return { base, values, crafts };
  };

  const score = (item: Item) => {
    const { base, values } = evaluate(item);
    let total = weaponCredit(item);
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
