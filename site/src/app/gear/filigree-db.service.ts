import { Injectable } from '@angular/core';

import { Affix } from '../affixes/affix';
import { GameDataService } from './game-data.service';
import { RawFiligree, RawFiligreeData, RawFiligreeGeneration } from './game-data-types';
import type { SetBonusThreshold } from './gear-db.service';
import {
  FILIGREE_BONUS_TYPE, FILIGREE_SET_BONUS_TYPE, FiligreeChoice, filigreeAffixes, maxFiligreeTotal
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
   * The most filigrees can give each affix: their own bonuses summed over the best distinct
   * filigrees for a 10-slot weapon and an `artifactSlots` artifact, the best single set's full
   * bonus, and 1 for an on/off effect. `flatten` expands an affix group onto its members (keeping
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

    for (const set of Object.keys(this.data.sets)) {
      for (const [affixName, value] of totals(this.getSetBonus(set, Number.MAX_SAFE_INTEGER), FILIGREE_SET_BONUS_TYPE)) {
        offer(affixName, FILIGREE_SET_BONUS_TYPE, value);
      }
    }

    return { byAffix };
  }
}
