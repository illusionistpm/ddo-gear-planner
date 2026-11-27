import { AffixAvailabilityService } from '../affixes/affix-availability.service';
import { Craftable } from '../gear/craftable';
import { GearDbService } from '../gear/gear-db.service';
import { Item } from '../gear/item';
import { EquippedService } from '../planner/equipped.service';
import { UTILITY_AFFIXES } from '../planner/suggestion-scorer';
import {
  BuildState, Contribution, fillCrafting, flatTotalValue, gainOf, legacyObjective, meanFill, Need, NeedIndex, Objective, optionChoices
} from './build-model';

export interface Ctx {
  equipped: EquippedService;
  gearDB: GearDbService;
  availability: AffixAvailabilityService;
  index: NeedIndex;
  maxLevel: number;
}

/**
 * Scores candidates for the slots still open. Called once per decision, so it can do per-decision
 * setup (filling the build's own crafting) and hand back a cheap per-item scorer.
 */
export type Scorer = (ctx: Ctx, state: BuildState, open: string[]) => (item: Item, slot: string) => number;

/** Which items a decision may consider: any, none that are minor artifacts, or only those. */
export type ArtifactRule = 'any' | 'none' | 'only';

export function candidates(ctx: Ctx, state: BuildState, slot: string, artifacts: ArtifactRule = 'any'): Item[] {
  const equippedNames = new Set(Array.from(state.items.values()).map(item => item.name));
  const hasArtifact = Array.from(state.items.values()).some(item => item.artifact);
  return (ctx.gearDB.getFilteredGearBySlot(slot) ?? [])
    .filter(item => !item.isGeneratedEssenceCraftingBlank())
    .filter(item => !equippedNames.has(item.name) && !(hasArtifact && item.artifact))
    .filter(item => artifacts === 'any' || (artifacts === 'only') === !!item.artifact);
}

export function argmax(ctx: Ctx, state: BuildState, open: string[], score: (item: Item, slot: string) => number,
                       artifacts: ArtifactRule = 'any') {
  let best: { slot: string; item: Item; score: number } | null = null;
  for (const slot of open) {
    for (const item of candidates(ctx, state, slot, artifacts)) {
      const s = score(item, slot);
      if (!best || s > best.score) {
        best = { slot, item, score: s };
      }
    }
  }
  return best;
}

/** The live scorer, EquippedService.getScore, with the state equipped (its open slots left empty). */
export const liveScorer: Scorer = (ctx, state, open) => {
  const slots = new Set([...state.items.keys(), ...open]);
  for (const slot of slots) {
    if (!state.items.has(slot)) {
      ctx.equipped.clearSlot(slot);
    }
  }
  for (const [slot, item] of state.items) {
    if (ctx.equipped.getSlotsSnapshot().get(slot) !== item) {
      ctx.equipped.set(item);
    }
  }
  return item => ctx.equipped.getScore(item);
};

/**
 * The app's own scorer v2 (EquippedService.getSuggestionScorer), with the state equipped like the
 * live scorer. It should reproduce the harness's "total value, augment-aware, planned artifact".
 */
export function appScorerWith(options: { weightFactor?: (affixName: string) => number; weaponDiceFactor?: number; weaponEffectFactor?: number } = {}): Scorer {
  return (ctx, state, open) => {
    liveScorer(ctx, state, open);
    const perSlot = new Map<string, (item: Item) => number>();
    return (item, slot) => {
      let score = perSlot.get(slot);
      if (!score) {
        score = ctx.equipped.getSuggestionScorer(slot, options);
        perSlot.set(slot, score);
      }
      return score(item);
    };
  };
}

export const appScorer: Scorer = appScorerWith();

export interface MarginalOptions {
  /**
   * Fill the build's own empty crafting slots first, and credit a candidate's empty crafting slots
   * with the best each could add. A need an equipped item's open augment slot could carry then stops
   * counting for a candidate that carries it natively, and an item's augment slots count for it.
   */
  augmentAware: boolean;
  /** Per-need factor on its gain, e.g. scarcity. */
  scarcity?: (ctx: Ctx, need: Need, open: Set<string>) => number;
  /**
   * How much of what a candidate's own crafting slots could add counts (default 1). Later items
   * bring augment slots too, so full credit overrates augment-rich items early in a build.
   */
  ownCraftingCredit?: number;
  /**
   * While the build has no minor artifact, assume one is coming: count the augment slots most endgame
   * artifacts carry (Blue, Green, Yellow) as already there, empty. An artifact candidate is scored
   * without that stand-in, since it would replace it.
   */
  planArtifact?: boolean;
}

let plannedArtifactCache: { gearDB: GearDbService; item: Item | null } | null = null;
/** An endgame minor artifact with exactly Blue, Green and Yellow augment slots, stripped of its own affixes. */
function plannedArtifact(ctx: Ctx): Item | null {
  if (plannedArtifactCache?.gearDB !== ctx.gearDB) {
    let found: Item | null = null;
    for (const slot of ctx.gearDB.getSlots()) {
      for (const item of ctx.gearDB.getFilteredGearBySlot(slot) ?? []) {
        const names = (item.crafting ?? []).map(c => c.name).sort().join('|');
        if (!found && item.artifact && !item.getOwnSets().length && names === 'Blue Augment Slot|Green Augment Slot|Yellow Augment Slot') {
          found = new Item(item);
          found.affixes = [];
        }
      }
    }
    plannedArtifactCache = { gearDB: ctx.gearDB, item: found };
  }
  return plannedArtifactCache.item;
}

/** Marginal gain of a candidate under a separable objective (a sum over needs). */
export function marginalScorer(objective: Objective, opts: MarginalOptions): Scorer {
  return (ctx, state, open) => {
    const fill = (from: BuildState) => opts.augmentAware ? fillCrafting(from, ctx.index, objective, ctx.maxLevel) : from;
    const realBase = fill(state);
    let plannedBase = realBase;
    const stand = opts.planArtifact && !Array.from(state.items.values()).some(item => item.artifact) ? plannedArtifact(ctx) : null;
    if (stand) {
      const withStand = state.clone();
      withStand.setItem('(planned artifact)', stand);
      plannedBase = fill(withStand);
    }
    const realValues = realBase.values;
    const plannedValues = plannedBase === realBase ? realValues : plannedBase.values;
    const needs = ctx.index.needs;
    const openSet = new Set(open);
    const factors = needs.map(need => opts.scarcity ? opts.scarcity(ctx, need, openSet) : 1);
    return item => {
      const base = item.artifact ? realBase : plannedBase;
      const baseValues = item.artifact ? realValues : plannedValues;
      let values = base.valuesWithItem(item);
      if (opts.augmentAware) {
        const crafted = withOwnCrafting(ctx, base, item, values, objective);
        const credit = opts.ownCraftingCredit ?? 1;
        values = credit === 1 ? crafted : values.map((value, i) => value + (crafted[i] - value) * credit);
      }
      let total = 0;
      for (let i = 0; i < values.length; i++) {
        if (values[i] !== baseValues[i]) {
          total += (objective.perNeed(needs[i], values[i]) - objective.perNeed(needs[i], baseValues[i])) * factors[i];
        }
      }
      return total;
    };
  };
}

/**
 * Values with the candidate's own empty crafting slots filled greedily, one option per slot. An
 * option that puts the item in a set (Lost Purpose, Slaver's set bonuses, set augments) counts for
 * the set bonus the extra piece would unlock, recounted against the build's other pieces.
 */
function withOwnCrafting(ctx: Ctx, base: BuildState, item: Item, values: number[], objective: Objective): number[] {
  let current = values;
  const sets = [...(item.getSets() ?? [])];
  for (const craftable of item.crafting ?? []) {
    if (craftable.selected?.affixes.length || craftable.selected?.set) {
      continue;
    }
    let best: { contribution: Contribution; set: string } | null = null;
    let bestGain = 1e-9;
    for (const choice of cachedChoices(ctx, craftable)) {
      const contribution = choice.set ? withSetBonus(base, choice.contribution, [...sets, choice.set], current) : choice.contribution;
      const gain = gainOf(objective, ctx.index.needs, current, contribution);
      if (gain > bestGain) {
        bestGain = gain;
        best = { contribution, set: choice.set };
      }
    }
    if (best) {
      current = current.slice();
      for (const [i, value] of best.contribution) {
        current[i] = Math.max(current[i], value);
      }
      if (best.set) {
        sets.push(best.set);
      }
    }
  }
  return current;
}

/** An option's own contribution plus whatever the build's set bonuses become with `sets` added. */
function withSetBonus(base: BuildState, own: Contribution, sets: string[], current: number[]): Contribution {
  const merged: Contribution = new Map(own);
  base.setValuesFor(base.setCounts(sets)).forEach((value, i) => {
    if (value > current[i] && value > (merged.get(i) ?? 0)) {
      merged.set(i, value);
    }
  });
  return merged;
}

interface CraftChoice {
  contribution: Contribution;
  set: string;
}

const choiceCache = new Map<string, CraftChoice[]>();
let choiceCacheIndex: NeedIndex | null = null;
function cachedChoices(ctx: Ctx, craftable: Craftable): CraftChoice[] {
  if (choiceCacheIndex !== ctx.index) {
    choiceCache.clear();
    choiceCacheIndex = ctx.index;
  }
  // Most crafting lists are shared between items (every Blue Augment Slot offers the same gems), so
  // key by what the list is rather than by the item.
  const key = [craftable.name, craftable.craftingSystemOptions.join(','), craftable.options.length,
    craftable.options[1]?.name ?? '', craftable.options[craftable.options.length - 1]?.name ?? ''].join('|');
  let cached = choiceCache.get(key);
  if (!cached) {
    cached = optionChoices(craftable, ctx.maxLevel)
      .map(choice => ({ contribution: ctx.index.contributionOf(choice.option.affixes), set: choice.option.set }))
      .filter(choice => choice.contribution.size > 0 || choice.set);
    choiceCache.set(key, cached);
  }
  return cached;
}

/**
 * The live scorer's scarcity weight, except a need an augment can carry at 3/4 of its best value or
 * more, in at least four of the slots still open, counts `discount` (<1): it can go almost anywhere.
 */
export function scarcityWithDiscount(discount: number) {
  return (ctx: Ctx, need: Need, open: Set<string>) => {
    const remaining = ctx.availability.getRemainingAvailability(need.affix, need.type, open, new Map());
    if (remaining.hasAugmentSource && remaining.augmentSlots.length >= 4 && augmentCarriesBest(ctx, need)) {
      return discount;
    }
    return remaining.scarcityWeight;
  };
}

const augmentBest = new Map<string, boolean>();
let augmentBestIndex: NeedIndex | null = null;
function augmentCarriesBest(ctx: Ctx, need: Need): boolean {
  if (augmentBestIndex !== ctx.index) {
    augmentBest.clear();
    augmentBestIndex = ctx.index;
  }
  const key = `${need.affix}|${need.type}`;
  let result = augmentBest.get(key);
  if (result === undefined) {
    result = ctx.gearDB.findAugmentsWithAffixAndType(need.affix, need.type)
      .some(craftable => craftable.options.some(option =>
        option.affixes.some(affix => affix.type === need.type && Number(affix.value) >= 0.75 * need.best)));
    augmentBest.set(key, result);
  }
  return result;
}

/**
 * Scarcity by item count rather than slot count: a need is hard to find when at most 25 items carry
 * it at 7/10 of its best value or more, or they fit at most 3 slots, and no augment reaches that.
 * That rule matches an expert's (Lominal's) "rare" calls on 92 of 100 effects, where the planner's
 * slot count (AffixAvailabilityService) matches 49 (tools/build-stats/expert-check.py).
 */
export function itemCountScarcity(boost: number) {
  return (ctx: Ctx, need: Need) => isHardToFind(ctx, need) ? boost : 1;
}

const hardCache = new Map<string, boolean>();
let hardCacheIndex: NeedIndex | null = null;
function isHardToFind(ctx: Ctx, need: Need): boolean {
  if (hardCacheIndex !== ctx.index) {
    hardCache.clear();
    hardCacheIndex = ctx.index;
  }
  const key = `${need.affix}|${need.type}`;
  let hard = hardCache.get(key);
  if (hard === undefined) {
    const near = 0.7 * need.best;
    const i = ctx.index.indexOf(need.affix, need.type) ?? -1;
    // Rings are listed under both Ring1 and Ring2, so count each item once.
    const strong = new Map<string, Item>();
    for (const item of ctx.gearDB.findGearWithAffixAndType(need.affix, need.type)) {
      if ((ctx.index.contributionOf(item.affixes).get(i) ?? 0) >= near) {
        strong.set(item.name, item);
      }
    }
    const slots = new Set(Array.from(strong.values()).map(item => item.slot.replace(/\d$/, '')));
    const augmentable = ctx.gearDB.findAugmentsWithAffixAndType(need.affix, need.type)
      .some(craftable => craftable.options.some(option =>
        option.affixes.some(affix => affix.type === need.type && Number(affix.value) >= near)));
    hard = !augmentable && (strong.size <= 25 || slots.size <= 3);
    hardCache.set(key, hard);
  }
  return hard;
}

export const utilityWeight = (weight: number) => (_ctx: Ctx, need: Need) => UTILITY_AFFIXES.has(need.affix) ? weight : 1;

export const SCORERS: Array<[string, Scorer]> = [
  ['live getScore', liveScorer],
  ['app v2', appScorer],
  ['app v2, no utility weighting', appScorerWith({ weightFactor: () => 1 })],
  // The [W] credit (weaponDiceCredit) at other weights; it only moves Weapon and Offhand.
  ...[0, 0.5, 2, 4].map(factor => [`app v2, [W] x${factor}`, appScorerWith({ weaponDiceFactor: factor })] as [string, Scorer]),
  // The weapon effects' values (weapon-effect-values.ts) at other weights; they only move Weapon and Offhand.
  ...[0, 0.25, 0.5, 2].map(factor => [`app v2, effects x${factor}`, appScorerWith({ weaponEffectFactor: factor })] as [string, Scorer]),
  ['total value, items only', marginalScorer(legacyObjective, { augmentAware: false })],
  ['total value, augment-aware', marginalScorer(legacyObjective, { augmentAware: true })],
  ['total value, augment-aware + discount', marginalScorer(legacyObjective, { augmentAware: true, scarcity: scarcityWithDiscount(0.35) })],
  ['total value, augment-aware + discount, half crafting credit', marginalScorer(legacyObjective, { augmentAware: true, scarcity: scarcityWithDiscount(0.35), ownCraftingCredit: 0.5 })],
  ['per-need fill, augment-aware + discount', marginalScorer(meanFill, { augmentAware: true, scarcity: scarcityWithDiscount(0.35) })],
  ['total value, augment-aware, planned artifact', marginalScorer(legacyObjective, { augmentAware: true, planArtifact: true })],
  ['flat weights, augment-aware, planned artifact', marginalScorer(flatTotalValue, { augmentAware: true, planArtifact: true })],
  ['total value, augment-aware, planned artifact, utility 0.25',
    marginalScorer(legacyObjective, { augmentAware: true, planArtifact: true, scarcity: utilityWeight(0.25) })],
  ['flat weights, augment-aware, planned artifact + item scarcity',
    marginalScorer(flatTotalValue, { augmentAware: true, planArtifact: true, scarcity: itemCountScarcity(1.5) })],
];
