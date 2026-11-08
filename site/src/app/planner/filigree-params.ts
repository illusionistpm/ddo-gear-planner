import { emptyFiligreeLoadout, FiligreeChoice, FiligreeLoadout, isFiligreeLoadoutEmpty } from '../gear/filigree';

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

/** Kept long enough for anything a host holds, but no longer: a param can't grow without bound. */
const MAX_PARAM_FILIGREES_PER_HOST = 20;

export function filigreeLoadoutToParam(loadout: FiligreeLoadout): FiligreeParam | null {
  if (isFiligreeLoadoutEmpty(loadout)) {
    return null;
  }
  const param: FiligreeParam = {};
  if (loadout.weapon.length) {
    param.w = slotsToParam(loadout.weapon);
  }
  if (loadout.artifact.length) {
    param.a = slotsToParam(loadout.artifact);
  }
  return param;
}

function slotsToParam(choices: ReadonlyArray<FiligreeChoice>): FiligreeSlotParam[] {
  return choices.map(choice => choice.rare ? [choice.name, 1] : [choice.name]);
}

export function serializeFiligreeLoadout(loadout: FiligreeLoadout): string | null {
  const param = filigreeLoadoutToParam(loadout);
  return param ? JSON.stringify(param) : null;
}

/**
 * The loadout a `filigree` param describes. Anything malformed, or naming a filigree `isKnown`
 * rejects, is dropped rather than failing the whole build.
 */
export function parseFiligreeLoadout(raw: string | null | undefined, isKnown: (name: string) => boolean): FiligreeLoadout {
  const loadout = emptyFiligreeLoadout();
  if (!raw) {
    return loadout;
  }
  let param: FiligreeParam;
  try {
    param = JSON.parse(raw);
  } catch {
    return loadout;
  }
  if (!param || typeof param !== 'object') {
    return loadout;
  }
  loadout.weapon = readSlots(param.w, isKnown);
  loadout.artifact = readSlots(param.a, isKnown);
  return loadout;
}

function readSlots(entries: unknown, isKnown: (name: string) => boolean): FiligreeChoice[] {
  if (!Array.isArray(entries)) {
    return [];
  }
  const out: FiligreeChoice[] = [];
  for (const entry of entries) {
    if (!Array.isArray(entry)) {
      continue;
    }
    const [name, rare] = entry;
    if (typeof name === 'string' && isKnown(name) && out.length < MAX_PARAM_FILIGREES_PER_HOST) {
      out.push({ name, rare: rare === 1 });
    }
  }
  return out;
}
