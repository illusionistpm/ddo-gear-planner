import { readFileSync } from 'node:fs';

import { GearDbService } from '../gear/gear-db.service';
import { NeedIndex } from './build-model';

/**
 * Lominal's gear priorities ("Gearing at cap", Lominal's Endgame Builds), from
 * tools/build-stats/lominal-priorities.json - shared with tools/build-stats/expert-check.py.
 */
interface PriorityFile {
  roles: Record<string, Array<{ tier: 'critical' | 'strong' | 'filler'; label: string; colour: string; pairs: Array<[string, string | null]> }>>;
}

export const TIER_WEIGHTS = { critical: 3, strong: 2, filler: 1 } as const;
const MAIN_TYPES = ['Enhancement', 'Competence', 'Equipment', 'Bool'];

let cached: PriorityFile | null = null;
function load(): PriorityFile {
  // Specs run from site/.
  cached ??= JSON.parse(readFileSync('../tools/build-stats/lominal-priorities.json', 'utf8')) as PriorityFile;
  return cached;
}

export function expertRoles(): string[] {
  return Object.keys(load().roles);
}

/**
 * A role's weight for each (affix, bonus type). An effect named without a type means its main type
 * and - an assumption, since Sun and Moon gems carry the same stats - its Artifact and Profane types
 * at the same tier. Where one pair is listed twice, the higher tier wins.
 */
export function expertWeights(role: string, gearDB: GearDbService): Map<string, number> {
  const weights = new Map<string, number>();
  const offer = (affix: string, type: string, weight: number) => {
    const key = `${affix}|${type}`;
    weights.set(key, Math.max(weights.get(key) ?? 0, weight));
  };
  for (const entry of load().roles[role] ?? []) {
    const weight = TIER_WEIGHTS[entry.tier];
    for (const [affix, type] of entry.pairs) {
      if (type) {
        offer(affix, type, weight);
        continue;
      }
      const main = MAIN_TYPES.find(t => gearDB.getBestValueForAffixType(affix, t) > 0);
      if (main) {
        offer(affix, main, weight);
      }
      for (const gemType of ['Artifact', 'Profane']) {
        if (gearDB.getBestValueForAffixType(affix, gemType) > 0) {
          offer(affix, gemType, weight);
        }
      }
    }
  }
  return weights;
}

/** The affixes a role's list names, to track. */
export function expertAffixes(role: string): string[] {
  return Array.from(new Set((load().roles[role] ?? []).flatMap(entry => entry.pairs.map(([affix]) => affix))));
}

export function applyExpertWeights(index: NeedIndex, weights: Map<string, number>) {
  for (const need of index.needs) {
    need.expertWeight = weights.get(`${need.affix}|${need.type}`) ?? 0;
  }
}
