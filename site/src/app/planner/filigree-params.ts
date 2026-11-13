import {
  emptyFiligreeLoadout, FiligreeChoice, FiligreeLoadout, isFiligreeLoadoutEmpty, MAX_ARTIFACT_FILIGREE_SLOTS,
  MAX_WEAPON_FILIGREE_SLOTS
} from '../gear/filigree';

/**
 * The `filigree` query param: a FiligreeLoadout as JSON, each host's filigrees in order (the first
 * copy of a duplicate is the one that counts), empty hosts left out.
 *
 *   {"w": [["Celerity: Dexterity", 1], ["Zephyr: Tumble"]], "a": [["Celerity: Dexterity"]]}
 *
 * A slot is [name], plus 1 for the rare copy.
 */
export interface FiligreeParam {
  w?: FiligreeSlotParam[];
  a?: FiligreeSlotParam[];
}

export type FiligreeSlotParam = [string] | [string, 1];

/**
 * A param keeps no more filigrees per host than any host holds: the planner never slots more, and
 * a hand-made URL can't make the loadout grow without bound.
 */
const MAX_PARAM_FILIGREES_PER_HOST = Math.max(MAX_WEAPON_FILIGREE_SLOTS, MAX_ARTIFACT_FILIGREE_SLOTS);

/** A param holding the hosts' slots, the empty ones left out. */
export function filigreeParamOf<T>(weapon: T[], artifact: T[]): { w?: T[]; a?: T[] } {
  const param: { w?: T[]; a?: T[] } = {};
  if (weapon.length) {
    param.w = weapon;
  }
  if (artifact.length) {
    param.a = artifact;
  }
  return param;
}

export function filigreeLoadoutToParam(loadout: FiligreeLoadout): FiligreeParam | null {
  if (isFiligreeLoadoutEmpty(loadout)) {
    return null;
  }
  return filigreeParamOf(slotsToParam(loadout.weapon), slotsToParam(loadout.artifact));
}

function slotsToParam(choices: ReadonlyArray<FiligreeChoice>): FiligreeSlotParam[] {
  return choices.map(choice => choice.rare ? [choice.name, 1] : [choice.name]);
}

export function serializeFiligreeLoadout(loadout: FiligreeLoadout): string | null {
  const param = filigreeLoadoutToParam(loadout);
  return param ? JSON.stringify(param) : null;
}

/**
 * The well-formed slots of a `filigree` param, in order, or null when it isn't JSON of an object.
 * Names aren't checked against the data, so this is safe for carrying a param along unchanged.
 */
export function readFiligreeParam(raw: string): FiligreeParam | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const { w, a } = parsed as Record<string, unknown>;
  return filigreeParamOf(readSlots(w), readSlots(a));
}

function readSlots(entries: unknown): FiligreeSlotParam[] {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries
    .filter((entry): entry is unknown[] => Array.isArray(entry) && typeof entry[0] === 'string')
    .map((entry): FiligreeSlotParam => entry[1] === 1 ? [entry[0] as string, 1] : [entry[0] as string]);
}

/**
 * The loadout a `filigree` param describes. Anything malformed, or naming a filigree `isKnown`
 * rejects, is dropped rather than failing the whole build.
 */
export function parseFiligreeLoadout(raw: string | null | undefined, isKnown: (name: string) => boolean): FiligreeLoadout {
  const loadout = emptyFiligreeLoadout();
  const param = raw ? readFiligreeParam(raw) : null;
  if (!param) {
    return loadout;
  }
  loadout.weapon = toChoices(param.w, isKnown);
  loadout.artifact = toChoices(param.a, isKnown);
  return loadout;
}

function toChoices(slots: FiligreeSlotParam[] | undefined, isKnown: (name: string) => boolean): FiligreeChoice[] {
  return (slots ?? [])
    .filter(([name]) => isKnown(name))
    .slice(0, MAX_PARAM_FILIGREES_PER_HOST)
    .map(([name, rare]) => ({ name, rare: rare === 1 }));
}
