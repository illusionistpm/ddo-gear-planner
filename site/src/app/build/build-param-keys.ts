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
// data or item count.
export const FIXED_BUILD_PARAM_KEYS = [
  'tracked',
  'levelrange',
  'raids',
  'rare',
  'hiddentypes',
  'hiddenpacks',
  'nongear'
] as const;

const ML_KEY_PATTERN = /^ml_(.+)$/;
const CRAFT_KEY_PATTERN = /^craft_(\d+)_(slot|system|selected)$/;

export function isMlKey(key: string): boolean {
  return ML_KEY_PATTERN.test(key);
}

export function getMlSlotFromKey(key: string): string | null {
  const match = ML_KEY_PATTERN.exec(key);
  return match ? match[1] : null;
}

export interface ParsedCraftKey {
  index: number;
  field: 'slot' | 'system' | 'selected';
}

export function isCraftKey(key: string): boolean {
  return CRAFT_KEY_PATTERN.test(key);
}

export function parseCraftKey(key: string): ParsedCraftKey | null {
  const match = CRAFT_KEY_PATTERN.exec(key);
  if (!match) {
    return null;
  }
  return { index: Number(match[1]), field: match[2] as ParsedCraftKey['field'] };
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
