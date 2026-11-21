import { Affix } from '../affixes/affix';
import { AffixService } from '../affixes/affix.service';
import { isSummedBonusType } from '../affixes/summed-bonus-types';
import { moderateValueThreshold } from '../affixes/tracked-affix-derivation';
import { Craftable } from '../gear/craftable';
import { CraftableOption } from '../gear/craftable-option';
import { GearDbService } from '../gear/gear-db.service';
import { Item } from '../gear/item';

/**
 * A self-contained model of how well a set of equipped items covers a list of tracked needs, for the
 * suggestion evaluation harness. It deliberately doesn't go through EquippedService, so policies can
 * ask "what if" questions cheaply: values combine incrementally (max per bonus type), and set bonuses
 * are recounted from the items' sets.
 *
 * A need is one tracked (affix, bonus type) with a best value above zero at the current filters.
 */
export interface Need {
  affix: string;
  type: string;
  best: number;
  /** The affix's best values summed over its bonus types - the current scorer's denominator. */
  affixBest: number;
  /** GearDbService.getAffixWeight for the affix. */
  affixWeight: number;
}

export type Contribution = Map<number, number>; // need index -> value

export class NeedIndex {
  readonly needs: Need[] = [];
  private byKey = new Map<string, number>();
  private byAffix = new Map<string, number[]>();
  private trackedAffixes: string[] = [];

  /**
   * `covered`: EquippedService's covered-affix map, for each tracked affix its bonus types. `tracked`,
   * when given, keeps only those affixes - the covered map also lists ones the planner adds itself
   * (Max Filigree Slots, while filigree tracking is on) that the live scorer doesn't score.
   */
  constructor(private affixSvc: AffixService, private gearDB: GearDbService,
              covered: Map<string, Array<{ bonusType: string; value: number }>>, tracked?: ReadonlySet<string>) {
    for (const [affix, types] of covered) {
      if (tracked && !tracked.has(affix)) {
        continue;
      }
      const affixBest = gearDB.getBestValueForAffix(affix);
      const affixWeight = gearDB.getAffixWeight(affix, affixBest);
      for (const { bonusType } of types) {
        const value = gearDB.getBestValueForAffixType(affix, bonusType);
        if (!(value > 0)) {
          continue;
        }
        const index = this.needs.length;
        this.needs.push({ affix, type: bonusType, best: value, affixBest, affixWeight });
        this.byKey.set(`${affix}|${bonusType}`, index);
        const list = this.byAffix.get(affix) ?? [];
        list.push(index);
        this.byAffix.set(affix, list);
      }
    }
    this.trackedAffixes = Array.from(this.byAffix.keys());
  }

  indexOf(affix: string, type: string): number | undefined {
    return this.byKey.get(`${affix}|${type}`);
  }

  /** Which needs a list of affixes feeds, and with what. Group affixes resolve onto their members. */
  contributionOf(affixes: ReadonlyArray<Affix>): Contribution {
    const result: Contribution = new Map();
    for (const affix of this.affixSvc.flattenAffixGroups(affixes, true)) {
      const value = Number(affix.value);
      if (!(value > 0)) {
        continue;
      }
      for (const tracked of this.trackedAffixes) {
        if (!this.affixSvc.resolvesToAffix(affix.name, tracked)) {
          continue;
        }
        const index = this.indexOf(tracked, affix.type);
        if (index === undefined) {
          continue;
        }
        if (isSummedBonusType(affix.type)) {
          result.set(index, (result.get(index) ?? 0) + value);
        } else {
          result.set(index, Math.max(result.get(index) ?? 0, value));
        }
      }
    }
    return result;
  }
}

/**
 * How a policy or a metric values the build: a sum over needs of `perNeed`, divided by the number of
 * needs when `mean` is set. Being a sum, a change to a few needs can be scored from those needs alone.
 */
export interface Objective {
  perNeed(need: Need, value: number): number;
  mean?: boolean;
}

export function evaluate(objective: Objective, needs: readonly Need[], values: readonly number[]): number {
  let total = 0;
  for (let i = 0; i < needs.length; i++) {
    total += objective.perNeed(needs[i], values[i]);
  }
  return objective.mean && needs.length ? total / needs.length : total;
}

/** What adding `contribution` to `values` gains, in the objective's per-need units (unnormalised). */
export function gainOf(objective: Objective, needs: readonly Need[], values: readonly number[], contribution: Contribution): number {
  let gain = 0;
  for (const [i, value] of contribution) {
    if (value > values[i]) {
      gain += objective.perNeed(needs[i], value) - objective.perNeed(needs[i], values[i]);
    }
  }
  return gain;
}

/** Share of needs at the effects table's "moderate" threshold (3/4 of best) or better. */
export const needsMet: Objective = {
  mean: true,
  perNeed: (need, value) => value >= moderateValueThreshold(need.best) ? 1 : 0,
};

/** Average fraction of best value, capped at 1, every need counting the same. */
export const meanFill: Objective = {
  mean: true,
  perNeed: (need, value) => Math.min(1, value / need.best),
};

/**
 * What the current scorer (EquippedService.getScore) adds up, without its scarcity factor: each
 * affix is worth its weight in total, split across its bonus types by value.
 */
export const legacyObjective: Objective = {
  perNeed: (need, value) => Math.min(value, need.best) / need.affixBest * need.affixWeight,
};

export class BuildState {
  readonly items = new Map<string, Item>();
  private itemValues: number[];
  private setValues: number[];

  /** `baseline`: values the build has whatever it wears, e.g. its non-gear entries. */
  constructor(private index: NeedIndex, private gearDB: GearDbService, private baseline?: readonly number[]) {
    this.itemValues = baseline ? baseline.slice() : new Array(index.needs.length).fill(0);
    this.setValues = new Array(index.needs.length).fill(0);
  }

  clone(): BuildState {
    const copy = new BuildState(this.index, this.gearDB, this.baseline);
    for (const [slot, item] of this.items) {
      copy.items.set(slot, item);
    }
    copy.itemValues = this.itemValues.slice();
    copy.setValues = this.setValues.slice();
    return copy;
  }

  get values(): number[] {
    return this.itemValues.map((value, i) => Math.max(value, this.setValues[i]));
  }

  /** The values the build would have with `contribution` added - no sets recounted. */
  valuesWith(contribution: Contribution, base: number[] = this.values): number[] {
    const values = base.slice();
    for (const [i, value] of contribution) {
      values[i] = Math.max(values[i], value);
    }
    return values;
  }

  setItem(slot: string, item: Item) {
    this.items.set(slot, item);
    this.recompute();
  }

  recompute() {
    this.itemValues = this.baseline ? this.baseline.slice() : new Array(this.index.needs.length).fill(0);
    for (const item of this.items.values()) {
      for (const [i, value] of this.index.contributionOf(item.getActiveAffixes())) {
        this.itemValues[i] = Math.max(this.itemValues[i], value);
      }
    }
    this.setValues = this.setValuesFor(this.setCounts());
  }

  setCounts(extraSets: readonly string[] = []): Map<string, number> {
    const counts = new Map<string, number>();
    for (const item of this.items.values()) {
      for (const set of item.getSets() ?? []) {
        counts.set(set, (counts.get(set) ?? 0) + 1);
      }
    }
    for (const set of extraSets) {
      counts.set(set, (counts.get(set) ?? 0) + 1);
    }
    return counts;
  }

  setValuesFor(counts: Map<string, number>): number[] {
    const values = new Array(this.index.needs.length).fill(0);
    for (const [set, pieces] of counts) {
      for (const [i, value] of this.index.contributionOf(this.gearDB.getSetBonus(set, pieces))) {
        values[i] = Math.max(values[i], value);
      }
    }
    return values;
  }

  /** The build's values with `item` added in an empty slot, sets recounted. */
  valuesWithItem(item: Item): number[] {
    const values = this.valuesWith(this.index.contributionOf(item.getActiveAffixes()), this.itemValues);
    const sets = item.getSets() ?? [];
    const setValues = sets.length ? this.setValuesFor(this.setCounts(sets)) : this.setValues;
    return values.map((value, i) => Math.max(value, setValues[i]));
  }
}

/** The options a craftable can take, by system where it has systems, within the max level. */
export function optionChoices(craftable: Craftable, maxLevel: number): Array<{ system: string; option: CraftableOption }> {
  const choices: Array<{ system: string; option: CraftableOption }> = [];
  if (craftable.hasCraftingSystemOptions()) {
    for (const system of craftable.craftingSystemOptions) {
      const probe = craftable.clone();
      probe.selectCraftingSystem(system);
      for (const option of probe.options) {
        if (option.affixes.length && option.isWithinMaxLevel(maxLevel)) {
          choices.push({ system, option });
        }
      }
    }
  } else {
    for (const option of craftable.options) {
      if ((option.affixes.length || option.set) && option.isWithinMaxLevel(maxLevel)) {
        choices.push({ system: '', option });
      }
    }
  }
  return choices;
}

export function selectChoice(craftable: Craftable, choice: { system: string; option: CraftableOption }) {
  if (choice.system) {
    craftable.selectCraftingSystem(choice.system);
    const match = craftable.options.find(option => option === choice.option);
    if (match) {
      craftable.selected = match;
    }
  } else {
    craftable.selected = choice.option;
  }
}

/**
 * Fills every empty crafting slot of the build's items greedily: repeatedly takes the single
 * (slot, option) with the biggest gain under `objective`, until nothing helps. Items are cloned first,
 * so the gear database's copies are never touched. Crafting rules that span slots (one of each
 * Slaver's affix, say) aren't modelled, so this is an optimistic fill.
 */
export function fillCrafting(state: BuildState, index: NeedIndex, objective: Objective, maxLevel: number): BuildState {
  const filled = state.clone();
  const pending: Array<{ slot: string; craftable: Craftable; choices: Array<{ system: string; option: CraftableOption; contribution: Contribution }> }> = [];
  for (const [slot, item] of state.items) {
    const copy = new Item(item);
    filled.items.set(slot, copy);
    for (const craftable of copy.crafting ?? []) {
      if (craftable.selected?.affixes.length || craftable.selected?.set) {
        continue;
      }
      const choices = optionChoices(craftable, maxLevel)
        .map(choice => ({ ...choice, contribution: index.contributionOf(choice.option.affixes) }))
        .filter(choice => choice.contribution.size || choice.option.set);
      if (choices.length) {
        pending.push({ slot, craftable, choices });
      }
    }
  }
  filled.recompute();

  let values = filled.values;
  let current = evaluate(objective, index.needs, values);
  while (pending.length) {
    let best: { p: number; c: number; gain: number } | null = null;
    for (let p = 0; p < pending.length; p++) {
      const { choices } = pending[p];
      for (let c = 0; c < choices.length; c++) {
        const choice = choices[c];
        let gain: number;
        if (choice.option.set) {
          const trial = filled.clone();
          const craftable = pending[p].craftable;
          const previous = craftable.selected;
          selectChoice(craftable, choice);
          trial.recompute();
          gain = evaluate(objective, index.needs, trial.values) - current;
          craftable.selected = previous;
          if (choice.system) {
            craftable.selectCraftingSystem('');
            craftable.selected = previous;
          }
        } else {
          gain = gainOf(objective, index.needs, values, choice.contribution) / (objective.mean ? index.needs.length || 1 : 1);
        }
        if (gain > 1e-9 && (!best || gain > best.gain)) {
          best = { p, c, gain };
        }
      }
    }
    if (!best) {
      break;
    }
    const { craftable, choices } = pending[best.p];
    selectChoice(craftable, choices[best.c]);
    pending.splice(best.p, 1);
    filled.recompute();
    values = filled.values;
    current = evaluate(objective, index.needs, values);
  }
  return filled;
}
