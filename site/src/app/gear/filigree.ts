import { Affix } from '../affixes/affix';
import { RawFiligree } from './game-data-types';

/**
 * Filigrees: the gems slotted into the sentient (main-hand) weapon and the minor artifact.
 *
 * Every filigree bonus is unique and stacks with everything, other filigrees included, so the
 * planner gives a filigree's own bonuses the "Filigree" type and adds them up rather than taking
 * the best, and does the same for filigree set bonuses under "Filigree Set". Text-only effects
 * are "Bool", as on items.
 */
export const FILIGREE_BONUS_TYPE = 'Filigree';
export const FILIGREE_SET_BONUS_TYPE = 'Filigree Set';
/** Bonus types whose values add up across sources instead of the best one counting. */
export const SUMMED_FILIGREE_BONUS_TYPES: ReadonlySet<string> = new Set([FILIGREE_BONUS_TYPE, FILIGREE_SET_BONUS_TYPE]);

/** A sentient weapon opens 7 slots by feeding and 3 more with the Sparks. */
export const MAX_WEAPON_FILIGREE_SLOTS = 10;
/** No minor artifact holds more than this today; the data's Max Filigree Slots says how many each does. */
export const MAX_ARTIFACT_FILIGREE_SLOTS = 10;

export type FiligreeHost = 'weapon' | 'artifact';
export const FILIGREE_HOSTS: ReadonlyArray<FiligreeHost> = ['weapon', 'artifact'];

export interface FiligreeChoice {
  name: string;
  rare: boolean;
}

/**
 * What the player has slotted in each host, in order with no gaps, kept apart from which weapon and
 * artifact are equipped. Only the first as many as the equipped host holds count; any past that
 * (after a swap to a smaller artifact, say) are kept, unshown, until a host can hold them again.
 */
export interface FiligreeLoadout {
  weapon: FiligreeChoice[];
  artifact: FiligreeChoice[];
}

export function emptyFiligreeLoadout(): FiligreeLoadout {
  return { weapon: [], artifact: [] };
}

export function isFiligreeLoadoutEmpty(loadout: FiligreeLoadout): boolean {
  return !loadout.weapon.length && !loadout.artifact.length;
}

/** One slotted filigree that counts: within what its equipped host holds. */
export interface CountedFiligree {
  host: FiligreeHost;
  index: number;
  choice: FiligreeChoice;
  /**
   * False for a second copy in the same host: it still counts as a set piece, but a host only
   * gets a filigree's own bonuses once. The copy that does is the rare one, else the first.
   */
  contributes: boolean;
}

/**
 * The first `capacity` of a host's filigrees, marking which copy of each gives its bonuses.
 */
export function countHostFiligree(
  host: FiligreeHost,
  choices: ReadonlyArray<FiligreeChoice>,
  capacity: number
): CountedFiligree[] {
  const counted: CountedFiligree[] = [];
  const best = new Map<string, CountedFiligree>();
  choices.slice(0, Math.max(0, capacity)).forEach((choice, index) => {
    const entry: CountedFiligree = { host, index, choice, contributes: false };
    counted.push(entry);
    const current = best.get(choice.name);
    if (!current || (choice.rare && !current.choice.rare)) {
      best.set(choice.name, entry);
    }
  });
  for (const entry of best.values()) {
    entry.contributes = true;
  }
  return counted;
}

/** Set name -> pieces, across both hosts. Every counted copy is a piece, duplicates included. */
export function countFiligreeSetPieces(
  counted: ReadonlyArray<CountedFiligree>,
  setsOf: (name: string) => ReadonlyArray<string>
): Map<string, number> {
  const pieces = new Map<string, number>();
  for (const entry of counted) {
    for (const set of setsOf(entry.choice.name)) {
      pieces.set(set, (pieces.get(set) ?? 0) + 1);
    }
  }
  return pieces;
}

/** A filigree's affixes, with the rare bonus when it's the rare copy. */
export function filigreeAffixes(filigree: RawFiligree | undefined, rare: boolean): Affix[] {
  if (!filigree) {
    return [];
  }
  return [...filigree.affixes, ...(rare ? filigree.rareAffixes : [])].map(affix => new Affix(affix));
}

/**
 * The most a build can get from filigrees' own bonuses to one affix: every distinct filigree that
 * gives it, best first, once in a 10-slot weapon and once in an artifact of `artifactSlots`.
 * `valuesByFiligree` is each filigree's best total for the affix (its rare copy's).
 */
export function maxFiligreeTotal(valuesByFiligree: ReadonlyArray<number>, artifactSlots: number): number {
  const sorted = [...valuesByFiligree].filter(value => value > 0).sort((a, b) => b - a);
  const sum = (count: number) => sorted.slice(0, Math.max(0, count)).reduce((total, value) => total + value, 0);
  return sum(MAX_WEAPON_FILIGREE_SLOTS) + sum(artifactSlots);
}

/**
 * The most filigree set bonuses can give one affix: bonuses from distinct sets stack, so this
 * spreads `pieces` slots across sets (a knapsack) to maximise their sum. `sets` holds, per set,
 * the tiers that give the affix; a set's value at k pieces is every such tier at or below k.
 */
export function maxFiligreeSetTotal(
  sets: ReadonlyArray<ReadonlyArray<{ threshold: number; value: number }>>,
  pieces: number
): number {
  // best[p]: the most the sets considered so far give with p pieces.
  let best = new Array<number>(Math.max(0, pieces) + 1).fill(0);
  for (const tiers of sets) {
    const next = [...best];
    for (const option of setOptions(tiers)) {
      for (let p = option.pieces; p < best.length; p++) {
        next[p] = Math.max(next[p], best[p - option.pieces] + option.value);
      }
    }
    best = next;
  }
  return best[best.length - 1];
}

/** A set's worthwhile piece counts: each threshold that gives the affix, with everything up to it. */
function setOptions(tiers: ReadonlyArray<{ threshold: number; value: number }>): Array<{ pieces: number; value: number }> {
  let total = 0;
  return [...tiers]
    .filter(tier => tier.value > 0)
    .sort((a, b) => a.threshold - b.threshold)
    .map(tier => ({ pieces: tier.threshold, value: (total += tier.value) }));
}
