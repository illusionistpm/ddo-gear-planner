import {
  emptyFiligreeLoadout, FiligreeChoice, FiligreeLoadout, isFiligreeLoadoutEmpty,
  MAX_ARTIFACT_FILIGREE_SLOTS, MAX_WEAPON_FILIGREE_SLOTS
} from '../gear/filigree';

/**
 * The `filigree` query param: a FiligreeLoadout as JSON, slot positions kept (the first copy of a
 * duplicate is the one that counts), defaults left out.
 *
 *   {"ws": 7, "as": 3, "w": [[0, "Celerity: Dexterity", 1], [4, "Zephyr: Tumble"]], "a": [...]}
 *
 * ws/as are the open weapon/artifact slots; a slot entry is [index, name] plus 1 for the rare copy.
 */
export interface FiligreeParam {
  ws?: number;
  as?: number;
  w?: FiligreeSlotParam[];
  a?: FiligreeSlotParam[];
}

export type FiligreeSlotParam = [number, string] | [number, string, 1];

export function filigreeLoadoutToParam(loadout: FiligreeLoadout): FiligreeParam | null {
  if (isFiligreeLoadoutEmpty(loadout)) {
    return null;
  }
  const param: FiligreeParam = {};
  if (loadout.weaponSlots !== MAX_WEAPON_FILIGREE_SLOTS) {
    param.ws = loadout.weaponSlots;
  }
  if (loadout.artifactSlots !== null) {
    param.as = loadout.artifactSlots;
  }
  const weapon = slotsToParam(loadout.weapon);
  const artifact = slotsToParam(loadout.artifact);
  if (weapon.length) {
    param.w = weapon;
  }
  if (artifact.length) {
    param.a = artifact;
  }
  return param;
}

function slotsToParam(choices: ReadonlyArray<FiligreeChoice | null>): FiligreeSlotParam[] {
  const out: FiligreeSlotParam[] = [];
  choices.forEach((choice, index) => {
    if (choice) {
      out.push(choice.rare ? [index, choice.name, 1] : [index, choice.name]);
    }
  });
  return out;
}

export function serializeFiligreeLoadout(loadout: FiligreeLoadout): string | null {
  const param = filigreeLoadoutToParam(loadout);
  return param ? JSON.stringify(param) : null;
}

/**
 * The loadout a `filigree` param describes. Anything malformed, out of range or naming a filigree
 * `isKnown` rejects is dropped rather than failing the whole build.
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
  if (isSlotCount(param.ws, MAX_WEAPON_FILIGREE_SLOTS)) {
    loadout.weaponSlots = param.ws;
  }
  if (isSlotCount(param.as, MAX_ARTIFACT_FILIGREE_SLOTS)) {
    loadout.artifactSlots = param.as;
  }
  fillSlots(loadout.weapon, param.w, isKnown);
  fillSlots(loadout.artifact, param.a, isKnown);
  return loadout;
}

function isSlotCount(value: unknown, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= max;
}

function fillSlots(target: Array<FiligreeChoice | null>, entries: unknown, isKnown: (name: string) => boolean) {
  if (!Array.isArray(entries)) {
    return;
  }
  for (const entry of entries) {
    if (!Array.isArray(entry)) {
      continue;
    }
    const [index, name, rare] = entry;
    if (Number.isInteger(index) && index >= 0 && index < target.length && typeof name === 'string' && isKnown(name)) {
      target[index] = { name, rare: rare === 1 };
    }
  }
}
