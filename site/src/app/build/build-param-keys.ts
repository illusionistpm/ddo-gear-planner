// Single source of truth for which query-param keys represent actual build
// data - as opposed to UI view state (moved to localStorage, see
// planner-view-state-storage.ts) or anything else that might show up in a
// URL. Imported by EquippedService/FiltersService (the only two producers
// registered with QueryParamsService) and, once ported, by
// BuildUrlCodecService - whose own test asserts every key here has an
// explicit encode/decode case, not just generic passthrough. That
// assertion is what would have caught the tab/taGroup/taCollapsed
// view-state gap automatically instead of requiring a manual trace.

// Keys with a fixed, literal name - one per key, independent of loaded game
// data or item count. Producers and the codec use these constants rather
// than repeating the literals.
export const TRACKED_KEY = 'tracked';
export const NONGEAR_KEY = 'nongear';
export const LEVEL_RANGE_KEY = 'levelrange';
export const RAIDS_KEY = 'raids';
export const RARE_KEY = 'rare';
export const HIDDEN_TYPES_KEY = 'hiddentypes';
export const HIDDEN_PACKS_KEY = 'hiddenpacks';

/** The subset owned by FiltersService - item filters rather than gear. */
export const FILTER_PARAM_KEYS = [
  LEVEL_RANGE_KEY,
  RAIDS_KEY,
  RARE_KEY,
  HIDDEN_TYPES_KEY,
  HIDDEN_PACKS_KEY
] as const;

export const FIXED_BUILD_PARAM_KEYS = [
  TRACKED_KEY,
  NONGEAR_KEY,
  ...FILTER_PARAM_KEYS
] as const;

// Exported so a malformed key can be reported as "looks like one of ours but isn't".
export const ML_KEY_PREFIX = 'ml_';
export const CRAFT_KEY_PREFIX = 'craft_';

const ML_KEY_PATTERN = /^ml_(.+)$/;
const CRAFT_KEY_PATTERN = /^craft_(\d+)_(slot|system|selected)$/;

/** The minimum-level key for a slot: `ml_Weapon`. */
export function mlKey(slot: string): string {
  return ML_KEY_PREFIX + slot;
}

export function isMlKey(key: string): boolean {
  return ML_KEY_PATTERN.test(key);
}

export function getMlSlotFromKey(key: string): string | null {
  const match = ML_KEY_PATTERN.exec(key);
  return match ? match[1] : null;
}

export const CRAFT_KEY_FIELDS = ['slot', 'system', 'selected'] as const;
export type CraftKeyField = typeof CRAFT_KEY_FIELDS[number];

export interface ParsedCraftKey {
  index: number;
  field: CraftKeyField;
}

/** One field of the n-th crafting selection: `craft_0_system`. */
export function craftKey(index: number, field: CraftKeyField): string {
  return `${CRAFT_KEY_PREFIX}${index}_${field}`;
}

export function isCraftKey(key: string): boolean {
  return CRAFT_KEY_PATTERN.test(key);
}

export function parseCraftKey(key: string): ParsedCraftKey | null {
  const match = CRAFT_KEY_PATTERN.exec(key);
  if (!match) {
    return null;
  }
  return { index: Number(match[1]), field: match[2] as CraftKeyField };
}

/**
 * True if `key` is a query-param key that represents actual build data.
 * `slots` is the current set of equipment slot names
 * (GearDbService.getSlots()) - those are data-driven, not a fixed list, so
 * they can't be included in FIXED_BUILD_PARAM_KEYS above.
 */
export function isBuildParamKey(key: string, slots: ReadonlyArray<string>): boolean {
  return (FIXED_BUILD_PARAM_KEYS as ReadonlyArray<string>).includes(key)
    || isMlKey(key)
    || isCraftKey(key)
    || slots.includes(key);
}
