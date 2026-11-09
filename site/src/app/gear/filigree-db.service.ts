import { Injectable } from '@angular/core';

import { Affix } from '../affixes/affix';
import { GameDataService } from './game-data.service';
import { RawFiligree, RawFiligreeData, RawFiligreeGeneration } from './game-data-types';
import type { SetBonusThreshold } from './gear-db.service';
import {
  FILIGREE_BONUS_TYPE, FILIGREE_SET_BONUS_TYPE, FiligreeChoice, filigreeAffixes, MAX_WEAPON_FILIGREE_SLOTS,
  maxFiligreeSetTotal, maxFiligreeTotal
} from './filigree';

/** The best a build can get from filigrees for one affix, per bonus type. */
export interface FiligreeMaxima {
  /** affix name -> bonus type -> best value. */
  readonly byAffix: Map<string, Map<string, number>>;
}

/** The filigree game data (filigree.json), and the sums the planner needs from it. */
@Injectable({
  providedIn: 'root'
})
export class FiligreeDbService {
  private names?: string[];

  constructor(private gameData: GameDataService) {}

  private get data(): RawFiligreeData {
    return this.gameData.filigree;
  }

  getNames(): string[] {
    this.names ??= Object.keys(this.data.filigrees).sort((a, b) => a.localeCompare(b));
    return this.names;
  }

  get(name: string): RawFiligree | undefined {
    return this.data.filigrees[name];
  }

  getSets(name: string): ReadonlyArray<string> {
    return this.get(name)?.sets ?? [];
  }

  getAffixes(choice: FiligreeChoice): Affix[] {
    return filigreeAffixes(this.get(choice.name), choice.rare);
  }

  /** The filigrees in a set, in the wiki's order. A raid filigree is in each of its two sets. */
  getFiligreesInSet(set: string): string[] {
    return Object.keys(this.data.filigrees).filter(name => this.getSets(name).includes(set));
  }

  isRareSet(set: string): boolean {
    return !!this.data.sets[set]?.rare;
  }

  getGeneration(name: string): { key: string; generation: RawFiligreeGeneration } | null {
    const key = this.get(name)?.generation;
    const generation = key !== undefined ? this.data.generations[key] : undefined;
    return key !== undefined && generation ? { key, generation } : null;
  }

  /** Every tier of a filigree set, marked eligible up to `pieces`. Tiers add up. */
  getSetTiers(set: string, pieces: number): SetBonusThreshold[] {
    return (this.data.sets[set]?.bonuses ?? [])
      .map(tier => ({
        threshold: Number(tier.threshold),
        eligible: Number(tier.threshold) <= pieces,
        affixes: tier.affixes.map(affix => new Affix(affix)),
      }))
      .sort((a, b) => a.threshold - b.threshold);
  }

  getSetBonus(set: string, pieces: number): Affix[] {
    return this.getSetTiers(set, pieces).filter(tier => tier.eligible).flatMap(tier => tier.affixes);
  }

  /**
   * The filigrees whose own bonuses give `affixName` of `bonusType`, best first: what a normal copy
   * gives, and a rare one. `flatten` expands affix groups (keeping the group), as in getMaxima.
   */
  findFiligreesWithAffixAndType(
    affixName: string,
    bonusType: string,
    flatten: (affixes: Affix[]) => Affix[]
  ): Array<{ name: string; sets: ReadonlyArray<string>; value: number; rareValue: number }> {
    const total = (affixes: Affix[]) => flatten(affixes)
      .filter(affix => affix.name === affixName && affix.type === bonusType)
      .reduce((sum, affix) => sum + affix.value, 0);
    return this.getNames()
      .map(name => {
        const raw = this.get(name)!;
        return { name, sets: raw.sets, value: total(filigreeAffixes(raw, false)), rareValue: total(filigreeAffixes(raw, true)) };
      })
      .filter(match => match.rareValue > 0)
      .sort((a, b) => b.rareValue - a.rareValue || b.value - a.value || a.name.localeCompare(b.name));
  }

  /** The filigree sets whose bonuses give `affixName` of `bonusType`: the pieces the first needs, and the full set's total. */
  findSetsWithAffixAndType(
    affixName: string,
    bonusType: string,
    flatten: (affixes: Affix[]) => Affix[]
  ): Array<{ set: string; threshold: number; value: number }> {
    const matches: Array<{ set: string; threshold: number; value: number }> = [];
    for (const set of Object.keys(this.data.sets)) {
      let threshold = 0;
      let value = 0;
      for (const tier of this.getSetTiers(set, Number.MAX_SAFE_INTEGER)) {
        const tierValue = flatten(tier.affixes)
          .filter(affix => affix.name === affixName && affix.type === bonusType)
          .reduce((sum, affix) => sum + affix.value, 0);
        if (tierValue > 0) {
          threshold ||= tier.threshold;
          value += tierValue;
        }
      }
      if (value > 0) {
        matches.push({ set, threshold, value });
      }
    }
    return matches.sort((a, b) => b.value - a.value || a.threshold - b.threshold || a.set.localeCompare(b.set));
  }

  /**
   * The most filigrees can give each affix: their own bonuses summed over the best distinct
   * filigrees for a 10-slot weapon and an `artifactSlots` artifact, the best spread of set pieces
   * over those slots across distinct sets (whose bonuses stack), and 1 for an on/off effect. `flatten` expands an affix group onto its members (keeping
   * the group), so a "+1 to all Saving Throws" filigree counts toward Reflex Save too.
   */
  getMaxima(artifactSlots: number, flatten: (affixes: Affix[]) => Affix[]): FiligreeMaxima {
    const byAffix = new Map<string, Map<string, number>>();
    const offer = (name: string, type: string, value: number) => {
      if (!name || value <= 0) {
        return;
      }
      let types = byAffix.get(name);
      if (!types) {
        types = new Map<string, number>();
        byAffix.set(name, types);
      }
      if ((types.get(type) ?? 0) < value) {
        types.set(type, value);
      }
    };
    const totals = (affixes: Affix[], type: string) => {
      const out = new Map<string, number>();
      for (const affix of flatten(affixes)) {
        if (affix.type === type) {
          out.set(affix.name, (out.get(affix.name) ?? 0) + affix.value);
        } else if (!Affix.isRealType(affix.type)) {
          offer(affix.name, affix.type, 1);
        }
      }
      return out;
    };

    const perFiligree = new Map<string, number[]>();
    for (const name of this.getNames()) {
      for (const [affixName, value] of totals(filigreeAffixes(this.get(name), true), FILIGREE_BONUS_TYPE)) {
        perFiligree.set(affixName, [...(perFiligree.get(affixName) ?? []), value]);
      }
    }
    for (const [affixName, values] of perFiligree) {
      offer(affixName, FILIGREE_BONUS_TYPE, maxFiligreeTotal(values, artifactSlots));
    }

    // Bonuses from distinct sets stack, so the best spread of pieces across sets, within every slot
    // the weapon and artifact have between them. Duplicates count as pieces, so pieces aren't capped
    // by how many filigrees a set has.
    const tierValuesByAffix = new Map<string, Array<Array<{ threshold: number; value: number }>>>();
    for (const set of Object.keys(this.data.sets)) {
      const perAffix = new Map<string, Array<{ threshold: number; value: number }>>();
      for (const tier of this.getSetTiers(set, Number.MAX_SAFE_INTEGER)) {
        for (const [affixName, value] of totals(tier.affixes, FILIGREE_SET_BONUS_TYPE)) {
          perAffix.set(affixName, [...(perAffix.get(affixName) ?? []), { threshold: tier.threshold, value }]);
        }
      }
      for (const [affixName, tiers] of perAffix) {
        tierValuesByAffix.set(affixName, [...(tierValuesByAffix.get(affixName) ?? []), tiers]);
      }
    }
    for (const [affixName, sets] of tierValuesByAffix) {
      offer(affixName, FILIGREE_SET_BONUS_TYPE, maxFiligreeSetTotal(sets, MAX_WEAPON_FILIGREE_SLOTS + artifactSlots));
    }

    return { byAffix };
  }
}
