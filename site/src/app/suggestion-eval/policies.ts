import { AffixAvailabilityService } from '../affixes/affix-availability.service';
import { Craftable } from '../gear/craftable';
import { GearDbService } from '../gear/gear-db.service';
import { Item } from '../gear/item';
import { EquippedService } from '../planner/equipped.service';
import { BuildState, Contribution, fillCrafting, gainOf, legacyObjective, meanFill, Need, NeedIndex, Objective, optionChoices } from './build-model';

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
        const crafted = withOwnCrafting(ctx, item, values, objective);
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

/** Values with the candidate's own empty crafting slots filled greedily, one option per slot. */
function withOwnCrafting(ctx: Ctx, item: Item, values: number[], objective: Objective): number[] {
  let current = values;
  for (const craftable of item.crafting ?? []) {
    if (craftable.selected?.affixes.length) {
      continue;
    }
    let best: Contribution | null = null;
    let bestGain = 1e-9;
    for (const choice of cachedChoices(ctx, craftable)) {
      const gain = gainOf(objective, ctx.index.needs, current, choice);
      if (gain > bestGain) {
        bestGain = gain;
        best = choice;
      }
    }
    if (best) {
      current = current.slice();
      for (const [i, value] of best) {
        current[i] = Math.max(current[i], value);
      }
    }
  }
  return current;
}

const choiceCache = new Map<string, Contribution[]>();
let choiceCacheIndex: NeedIndex | null = null;
function cachedChoices(ctx: Ctx, craftable: Craftable): Contribution[] {
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
      .map(choice => ctx.index.contributionOf(choice.option.affixes))
      .filter(contribution => contribution.size > 0);
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

export const SCORERS: Array<[string, Scorer]> = [
  ['live getScore', liveScorer],
  ['total value, items only', marginalScorer(legacyObjective, { augmentAware: false })],
  ['total value, augment-aware', marginalScorer(legacyObjective, { augmentAware: true })],
  ['total value, augment-aware + discount', marginalScorer(legacyObjective, { augmentAware: true, scarcity: scarcityWithDiscount(0.35) })],
  ['total value, augment-aware + discount, half crafting credit', marginalScorer(legacyObjective, { augmentAware: true, scarcity: scarcityWithDiscount(0.35), ownCraftingCredit: 0.5 })],
  ['per-need fill, augment-aware + discount', marginalScorer(meanFill, { augmentAware: true, scarcity: scarcityWithDiscount(0.35) })],
  ['total value, augment-aware, planned artifact', marginalScorer(legacyObjective, { augmentAware: true, planArtifact: true })],
];
