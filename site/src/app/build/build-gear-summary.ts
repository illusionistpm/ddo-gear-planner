import type { Item } from '../gear/item';

/**
 * What the build list shows under a saved build's name, worked out from its gear when it's
 * saved and stored with it (the worker's builds.summary, which treats it as opaque). Stored
 * rather than read from the blob as the list loads, so the list needn't download every
 * build's blob, nor the game data to read them.
 *
 * Holds names and numbers, not the label: how they're shortened can change without
 * rewriting what's stored. Every field is optional, for an empty slot and for whatever
 * an older or newer client stored.
 */
export interface BuildGearSummary {
  /** The weapon's full name. */
  weapon?: string;
  /** The lowest and highest minimum level of the equipped gear, the quiver aside. */
  minLevel?: number;
  maxLevel?: number;
}

/**
 * Most quivers worth using are ML 1 (Quiver of Alacrity) or ML 20, so one would set the
 * low end of nearly every build's range. Augments never count: they aren't items.
 */
const SLOTS_OUTSIDE_LEVEL_RANGE: ReadonlySet<string> = new Set(['Quiver']);

/** The summary of this gear; null when nothing is equipped. */
export function gearSummaryOf(slots: Iterable<[string, Item | null]>): BuildGearSummary | null {
  const summary: BuildGearSummary = {};
  const levels: number[] = [];
  for (const [slot, item] of slots) {
    if (!item) {
      continue;
    }
    if (slot === 'Weapon') {
      summary.weapon = item.name;
    }
    if (!SLOTS_OUTSIDE_LEVEL_RANGE.has(slot) && Number.isFinite(item.ml)) {
      levels.push(item.ml);
    }
  }
  if (levels.length) {
    summary.minLevel = Math.min(...levels);
    summary.maxLevel = Math.max(...levels);
  }
  return Object.keys(summary).length ? summary : null;
}

/**
 * A weapon's name as the build list shows it: "Legendary" as "Leg.", and the epithet after a
 * comma and a trailing "(level N)" dropped - the level range beside it says the level. On real
 * builds no two weapons came out the same.
 */
export function shortWeaponName(name: string): string {
  return name
    .replace(/^Legendary /, 'Leg. ')
    .replace(/,.*$/, '')
    .replace(/\s*\(level \d+\)$/i, '')
    .trim();
}

/** "Kinesis · ML 33–35"; "" for no summary. Reads whatever was stored defensively. */
export function gearSummaryLabel(summary: unknown): string {
  if (typeof summary !== 'object' || summary === null) {
    return '';
  }
  const { weapon, minLevel, maxLevel } = summary as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof weapon === 'string' && weapon) {
    parts.push(shortWeaponName(weapon));
  }
  if (typeof minLevel === 'number' && typeof maxLevel === 'number') {
    parts.push(minLevel === maxLevel ? `ML ${maxLevel}` : `ML ${minLevel}–${maxLevel}`);
  }
  return parts.join(' · ');
}
