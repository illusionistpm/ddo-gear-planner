import { Affix } from './affix';
import { UNIVERSAL_COMPANION_AFFIXES, type AffixService } from './affix.service';
import { ExternalAffixEntry, NON_GEAR_SLOT } from './external-affix';
import { isAugmentSystemName } from '../gear/augment-slots';
import { FiligreeHost } from '../gear/filigree';
import { ITEM_BONUS_KINDS } from '../gear/item-bonus';
import { ITEM_BONUS_TYPES } from './item-bonus-types';
import { combineBonusTypeValues, isSummedBonusType } from './summed-bonus-types';
import type { FiligreeDbService } from '../gear/filigree-db.service';
import type { GearDbService } from '../gear/gear-db.service';
import type { Item } from '../gear/item';
import type { VisibleSetBonus } from '../planner/equipped.service';
import type { FiligreeContribution } from '../planner/filigree-loadout';
import {
  isBoolAffixTypes, makeDisplayType, TrackedBonusTypeDisplay, VisibleTypeRules, visibleTypesOf
} from './tracked-affix-derivation';

/**
 * How a build's bonuses stack, as pure functions over what the build has equipped.
 *
 * The planner (EquippedService, over its live slots) and the compare page (over a
 * saved build read from its blob) both value affixes through these, so the two can't
 * disagree. Within a bonus type only the best value counts and different types add
 * up, except the filigree types, which add up within the type too.
 *
 * A compound affix (AffixService.getCompoundParts) also has, per bonus type, the lowest of what
 * the build gives its parts: Light Lore and Alignment Lore from two items are Radiance Lore.
 */

/** Everything the stacking rules read about a build. */
export interface BuildView {
  /** Each slot and its item, null when empty. */
  items(): Iterable<[string, Item | null]>;
  /** Each active gear set and the bonuses its piece count earns. */
  setBonuses(): ReadonlyArray<[string, Affix[]]>;
  /** Spells, trances and the like, and bonus types the player ignores. */
  externalEntries(): ReadonlyArray<ExternalAffixEntry>;
  /** What the counted filigrees and filigree sets give `affixName` (of `bonusType`, when given). */
  filigreeFor(affixName: string, bonusType?: string): ReadonlyArray<FiligreeContribution>;
}

export interface AffixSource {
  kind: 'item' | 'set' | 'external' | 'filigree';
  slot: string;
  /** For a slotted filigree, the host it's in; absent for anything else, a filigree set included. */
  filigreeHost?: FiligreeHost;
  itemName: string;
  /** For an item's value that comes from an augment slotted in it, the augment; absent otherwise. */
  augmentName?: string;
  affixName: string;
  bonusType: string;
  value: number;
}

export interface AffixTypeValueOptions {
  /** Leave this slot's item out: it is about to be replaced. */
  skipSlot?: string | null;
  /** Use these set bonuses instead of the build's own (recounted for a replacement). */
  setBonuses?: ReadonlyArray<[string, Affix[]]>;
  /**
   * Leave out what a universal companion ("Universal Spell Lore") gives its members. It stacks with
   * them and has its own row, so it is no part of the compound a member belongs to.
   */
  withoutUniversal?: boolean;
}

/** valuesForAffixType's slot for the value a compound affix has through its parts. */
export const COMPOUND_PARTS_SLOT = 'compound-parts';

const isUniversalCompanion = (affixName: string | undefined) =>
  affixName !== undefined && UNIVERSAL_COMPANION_AFFIXES.includes(affixName);

/** AffixService.flattenAffixGroups(affixes, true), under `options`. */
function flattened(affixSvc: AffixService, affixes: ReadonlyArray<Affix>, options: AffixTypeValueOptions): Affix[] {
  return affixSvc.flattenAffixGroups(
    options.withoutUniversal ? affixes.filter(affix => !isUniversalCompanion(affix.name)) : affixes, true);
}

function activeAffixesOf(affixSvc: AffixService, item: Item, options: AffixTypeValueOptions): Affix[] {
  return options.withoutUniversal ? flattened(affixSvc, item.getActiveAffixes(), options) : affixSvc.getActiveAffixes(item);
}

function filigreeValuesFor(view: BuildView, affixName: string, bonusType: string | undefined,
    options: AffixTypeValueOptions): ReadonlyArray<FiligreeContribution> {
  const entries = view.filigreeFor(affixName, bonusType);
  return options.withoutUniversal ? entries.filter(entry => !isUniversalCompanion(entry.group)) : entries;
}

/**
 * The non-gear values supplying `affixName` (of `bonusType`, when given). Like a set bonus, an entry
 * for an affix group ("Combat Mastery") supplies each of its members ("Stunning", ...) at its value.
 */
export function externalValuesFor(entries: ReadonlyArray<ExternalAffixEntry>, affixSvc: AffixService,
    affixName: string, bonusType?: string, options: AffixTypeValueOptions = {}): ExternalAffixEntry[] {
  return entries.filter(entry => entry.kind === 'value'
    && (bonusType === undefined || entry.bonusType === bonusType)
    && !(options.withoutUniversal && isUniversalCompanion(entry.affixName))
    && affixSvc.resolvesToAffix(entry.affixName, affixName));
}

/**
 * Every value the build gets for an affix type, best first.
 *
 * Items and filigree count an affix group at its members' own values (flattened, so Riposte's
 * Armor Class is half of it), while set bonuses and non-gear entries give each member the group's
 * full value.
 *
 * What a compound affix has through its parts beyond those is one more value, in COMPOUND_PARTS_SLOT.
 */
export function valuesForAffixType(view: BuildView, affixSvc: AffixService, affixName: string, bonusType: string,
    options: AffixTypeValueOptions = {}): Array<{ slot: string; value: number }> {
  const values: Array<{ slot: string; value: number }> = [];
  for (const [slot, item] of view.items()) {
    if (item && slot !== options.skipSlot) {
      for (const affix of activeAffixesOf(affixSvc, item, options)) {
        if (affix.name === affixName && affix.type === bonusType) {
          values.push({ slot, value: affix.value });
        }
      }
    }
  }

  for (const [, affixes] of options.setBonuses ?? view.setBonuses()) {
    for (const affix of affixes) {
      if (suppliesFromSet(affixSvc, affix, affixName, options) && affix.type === bonusType) {
        values.push({ slot: 'set', value: affix.value });
      }
    }
  }

  for (const entry of externalValuesFor(view.externalEntries(), affixSvc, affixName, bonusType, options)) {
    values.push({ slot: NON_GEAR_SLOT, value: entry.value });
  }

  for (const entry of filigreeValuesFor(view, affixName, bonusType, options)) {
    values.push({ slot: entry.slot, value: entry.affix.value });
  }

  // The parts' values include everything above (a compound gives each part its own value), so
  // only what they add to it is new - for a summed type, the rest of the sum.
  const fromParts = compoundValueFor(view, affixSvc, affixName, bonusType, options);
  const direct = combineBonusTypeValues(bonusType, values.map(entry => entry.value));
  if (fromParts > direct) {
    values.push({ slot: COMPOUND_PARTS_SLOT, value: isSummedBonusType(bonusType) ? fromParts - direct : fromParts });
  }

  return values.sort((a, b) => b.value - a.value);
}

function suppliesFromSet(affixSvc: AffixService, affix: Affix, affixName: string, options: AffixTypeValueOptions): boolean {
  return affixSvc.resolvesToAffix(affix.name, affixName) && !(options.withoutUniversal && isUniversalCompanion(affix.name));
}

/**
 * What a compound affix has of one bonus type through its parts: the lowest of the values the
 * build gives them, so 0 unless it gives every part some. 0 for anything that isn't a compound.
 */
export function compoundValueFor(view: BuildView, affixSvc: AffixService, affixName: string, bonusType: string,
    options: AffixTypeValueOptions = {}): number {
  const parts = affixSvc.getCompoundParts(affixName);
  if (!parts || bonusType === 'Penalty') {
    return 0;
  }
  let lowest = Infinity;
  for (const part of parts) {
    const value = bestValueFor(view, affixSvc, part, bonusType, { ...options, withoutUniversal: true });
    if (!(value > 0)) {
      return 0;
    }
    lowest = Math.min(lowest, value);
  }
  return lowest;
}

/**
 * The bonus types a compound affix has through its parts, which game data needn't list for it:
 * no item gives Radiance Lore an Insight bonus, but Insight Light Lore and Alignment Lore do.
 */
export function compoundBonusTypes(view: BuildView, affixSvc: AffixService, affixName: string): string[] {
  const parts = affixSvc.getCompoundParts(affixName);
  if (!parts) {
    return [];
  }
  return [...suppliedTypes(view, affixSvc, parts[0])]
    .filter(bonusType => compoundValueFor(view, affixSvc, affixName, bonusType) > 0);
}

/** Every bonus type the build gives an affix, whatever its value. */
function suppliedTypes(view: BuildView, affixSvc: AffixService, affixName: string): Set<string> {
  const types = new Set<string>(compoundBonusTypes(view, affixSvc, affixName));
  for (const [, item] of view.items()) {
    for (const affix of item ? affixSvc.getActiveAffixes(item) : []) {
      if (affix.name === affixName) {
        types.add(affix.type);
      }
    }
  }
  for (const [, affixes] of view.setBonuses()) {
    for (const affix of affixes) {
      if (affixSvc.resolvesToAffix(affix.name, affixName)) {
        types.add(affix.type);
      }
    }
  }
  for (const entry of externalValuesFor(view.externalEntries(), affixSvc, affixName)) {
    types.add(entry.bonusType);
  }
  for (const entry of view.filigreeFor(affixName)) {
    types.add(entry.affix.type);
  }
  return types;
}

/** What the build gets from one bonus type of an affix: its best value, or the sum of all of them for a summed type. 0 for none. */
export function bestValueFor(view: BuildView, affixSvc: AffixService, affixName: string, bonusType: string,
    options: AffixTypeValueOptions = {}): number {
  return combineBonusTypeValues(bonusType,
    valuesForAffixType(view, affixSvc, affixName, bonusType, options).map(entry => entry.value));
}

/**
 * What supplies the build's value for an affix type: each source giving the best value, every one for a summed type.
 * For a compound affix whose value is what its parts have, their sources too.
 */
export function sourcesFor(view: BuildView, affixSvc: AffixService, affixName: string, bonusType: string,
    options: Pick<AffixTypeValueOptions, 'withoutUniversal'> = {}): AffixSource[] {
  const bestValue = bestValueFor(view, affixSvc, affixName, bonusType, options);
  if (!bestValue) {
    return [];
  }
  // A summed type's value is all of them together, so every one is a source.
  const summed = isSummedBonusType(bonusType);
  const counts = (value: number) => summed ? value !== 0 : value === bestValue;

  const sources: AffixSource[] = [];
  for (const [slot, item] of view.items()) {
    if (!item) {
      continue;
    }
    // getActiveAffixes, a part at a time, so a value an augment gives is credited to the augment.
    for (const part of itemParts(item)) {
      for (const affix of flattened(affixSvc, part.affixes, options)) {
        if (affix.name === affixName && affix.type === bonusType && counts(affix.value)) {
          sources.push({
            kind: 'item', slot, itemName: item.name, ...(part.augmentName ? { augmentName: part.augmentName } : {}),
            affixName: affix.name, bonusType: affix.type, value: affix.value
          });
        }
      }
    }
  }

  for (const [setName, affixes] of view.setBonuses()) {
    for (const affix of affixes) {
      if (suppliesFromSet(affixSvc, affix, affixName, options) && affix.type === bonusType && counts(affix.value)) {
        sources.push({ kind: 'set', slot: 'Set', itemName: setName, affixName: affix.name, bonusType: affix.type, value: affix.value });
      }
    }
  }

  for (const entry of externalValuesFor(view.externalEntries(), affixSvc, affixName, bonusType, options)) {
    if (counts(entry.value)) {
      sources.push({
        kind: 'external', slot: NON_GEAR_SLOT, itemName: entry.label, affixName: entry.affixName,
        bonusType: entry.bonusType, value: entry.value
      });
    }
  }

  for (const entry of filigreeValuesFor(view, affixName, bonusType, options)) {
    if (counts(entry.affix.value)) {
      sources.push({
        kind: 'filigree',
        slot: entry.slot,
        ...(entry.host ? { filigreeHost: entry.host } : {}),
        itemName: entry.itemName,
        affixName: entry.affix.name,
        bonusType: entry.affix.type,
        value: entry.affix.value
      });
    }
  }

  if (compoundValueFor(view, affixSvc, affixName, bonusType, options) >= bestValue) {
    const sourceKey = (source: AffixSource) =>
      [source.kind, source.slot, source.filigreeHost, source.itemName, source.augmentName].join('\u0000');
    const seen = new Set(sources.map(sourceKey));
    for (const part of affixSvc.getCompoundParts(affixName) ?? []) {
      for (const source of sourcesFor(view, affixSvc, part, bonusType, { withoutUniversal: true })) {
        if (!seen.has(sourceKey(source))) {
          seen.add(sourceKey(source));
          sources.push(source);
        }
      }
    }
  }

  return sources;
}

/**
 * An item's own affixes, each crafting choice's, then its Mythic, Reaper and Curse bonuses (as
 * Item.getActiveAffixes adds them up), with
 * the augment's name for a choice in an augment slot: the coloured and colourless slots, Sun and Moon.
 */
function itemParts(item: Item): Array<{ affixes: ReadonlyArray<Affix>; augmentName?: string }> {
  const parts: Array<{ affixes: ReadonlyArray<Affix>; augmentName?: string }> = [{ affixes: item.affixes }];
  for (const craftable of item.crafting ?? []) {
    if (craftable.selected?.affixes) {
      const augment = isAugmentSystemName(craftable.name) || isAugmentSystemName(craftable.selectedCraftingSystemName);
      parts.push({
        affixes: craftable.selected.affixes,
        ...(augment ? { augmentName: craftable.selected.describe(true, false) } : {}),
      });
    }
  }
  for (const kind of ITEM_BONUS_KINDS) {
    const bonus = item.bonuses[kind];
    if (bonus) {
      parts.push({ affixes: bonus.affixes });
    }
  }
  return parts;
}

/**
 * The item-bonus types (Mythic, Reaper, Fortune) the build's gear supplies for an affix. Game data
 * offers only those whose system the player has switched on; a build that carries another (a shared
 * link, or a system since switched off) still counts it.
 */
export function equippedItemBonusTypes(view: BuildView, affixSvc: AffixService, affixName: string): Set<string> {
  const types = new Set<string>();
  for (const [, item] of view.items()) {
    for (const affix of item ? affixSvc.getActiveAffixes(item) : []) {
      if (ITEM_BONUS_TYPES.has(affix.type) && affixSvc.resolvesToAffix(affix.name, affixName)) {
        types.add(affix.type);
      }
    }
  }
  return types;
}

/**
 * Set name -> pieces equipped. A set augment replaces its item's own sets (Item.getSets). With
 * `skipSlot` and `extraSets`, the count once a replacement with those sets took that slot.
 */
export function countSets(items: Iterable<[string, Item | null]>, skipSlot?: string | null,
    extraSets: ReadonlyArray<string> = []): Map<string, number> {
  const counts = new Map<string, number>();
  const count = (set: string) => counts.set(set, (counts.get(set) ?? 0) + 1);
  for (const [slot, item] of items) {
    if (item && slot !== skipSlot) {
      item.getSets().forEach(count);
    }
  }
  extraSets.forEach(count);
  return counts;
}

export interface BuildSetBonuses {
  /** Each active gear set and the bonuses its piece count earns, as BuildView.setBonuses gives them. */
  setBonuses: Array<[string, Affix[]]>;
  /** Gear and filigree sets with their pieces and tiers: gear sets first, then the ones doing most. */
  visibleSets: VisibleSetBonus[];
}

/** What a build's gear set pieces (countSets) and filigree set pieces earn. */
export function setBonusesOf(gearSetCounts: ReadonlyMap<string, number>, filigreeSetPieces: ReadonlyMap<string, number>,
    gearDb: Pick<GearDbService, 'getSetBonus' | 'getSetBonusThresholdDetails'>,
    filigreeDb: Pick<FiligreeDbService, 'getSetTiers'>): BuildSetBonuses {
  const setBonuses: Array<[string, Affix[]]> = [];
  const visibleSets: VisibleSetBonus[] = [];
  for (const [setName, pieces] of gearSetCounts) {
    setBonuses.push([setName, gearDb.getSetBonus(setName, pieces)]);
    visibleSets.push({ setName, pieces, tiers: gearDb.getSetBonusThresholdDetails(setName, pieces) });
  }
  for (const [setName, pieces] of filigreeSetPieces) {
    visibleSets.push({ setName, pieces, tiers: filigreeDb.getSetTiers(setName, pieces), filigree: true });
  }
  // Slot order would put a set wherever its first piece happens to be; the ones doing most go first,
  // gear sets before filigree sets.
  visibleSets.sort((a, b) => Number(!!a.filigree) - Number(!!b.filigree)
    || b.pieces - a.pieces || a.setName.localeCompare(b.setName));
  return { setBonuses, visibleSets };
}

/** One bonus type's row of an affix's total, with where its value comes from. */
export interface AffixTypeTotal {
  /** "Enhancement", or "Universal Implement" for a universal companion's row. */
  label: string;
  /** The affix the row reads: the tracked one, or its universal companion. */
  sourceAffixName: string;
  bonusType: string;
  value: number;
  sources: AffixSource[];
  /** The player ignores this bonus type. It still counts, as it does in the planner. */
  ignored: boolean;
}

export interface AffixTotal {
  name: string;
  /** An on/off affix (an immunity, say): total is 1 when the build has it. */
  checklist: boolean;
  total: number;
  /** The rows that make up the total, sorted as the planner sorts them; only those with a value. */
  types: AffixTypeTotal[];
  /** An equipped item carries a penalty to it. Penalties aren't numbers, so not in the total. */
  hasPenalty: boolean;
}

/** What affixTotal needs to know about the game data (visibleTypeRulesOf); it never shows empty rows. */
export type AffixTotalRules = Omit<VisibleTypeRules, 'isAvailable'>;

/**
 * The build's total for an affix, as the planner's Tracked Affixes table adds it up, over every
 * bonus type the affix has at any level - so, unlike the planner, whatever its level filters.
 */
export function affixTotal(view: BuildView, affixSvc: AffixService, rules: AffixTotalRules, name: string): AffixTotal {
  const value = (affixName: string, bonusType: string) => bestValueFor(view, affixSvc, affixName, bonusType);
  const allTypes = [...new Set([
    ...rules.allLevelTypes(name), ...equippedItemBonusTypes(view, affixSvc, name), ...compoundBonusTypes(view, affixSvc, name)
  ])];
  const covered = allTypes.filter(bonusType => bonusType !== 'Penalty')
    .map(bonusType => ({ bonusType, value: value(name, bonusType) }));
  const hasPenalty = allTypes.includes('Penalty') && hasPenaltyTo(view, affixSvc, name);

  if (isBoolAffixTypes(covered)) {
    const has = covered[0].value > 0;
    return {
      name, checklist: true, total: has ? 1 : 0, hasPenalty,
      types: has ? [typeTotal(view, affixSvc, name, makeDisplayType(name, 'Bool', covered[0].value))] : [],
    };
  }

  const rows = visibleTypesOf(covered, name, value, { ...rules, isAvailable: () => false });
  return {
    name,
    checklist: false,
    total: rows.reduce((sum, row) => sum + row.value, 0),
    types: rows.map(row => typeTotal(view, affixSvc, name, row)),
    hasPenalty,
  };
}

function typeTotal(view: BuildView, affixSvc: AffixService, name: string, row: TrackedBonusTypeDisplay): AffixTypeTotal {
  return {
    label: row.label,
    sourceAffixName: row.sourceAffixName,
    bonusType: row.bonusType,
    value: row.value,
    sources: sourcesFor(view, affixSvc, row.sourceAffixName, row.sourceBonusType),
    ignored: view.externalEntries().some(entry => entry.kind === 'ignored'
      && entry.affixName === name && entry.bonusType === row.bonusType),
  };
}

function hasPenaltyTo(view: BuildView, affixSvc: AffixService, name: string): boolean {
  for (const [, item] of view.items()) {
    if (item && affixSvc.getActiveAffixes(item).some(affix => affix.name === name && affix.type === 'Penalty')) {
      return true;
    }
  }
  return false;
}
