import { Affix } from './affix';
import type { AffixService } from './affix.service';
import { ExternalAffixEntry, NON_GEAR_SLOT } from './external-affix';
import { FiligreeHost, SUMMED_FILIGREE_BONUS_TYPES } from '../gear/filigree';
import type { Item } from '../gear/item';
import type { FiligreeContribution } from '../planner/filigree-loadout';

/**
 * How a build's bonuses stack, as pure functions over what the build has equipped.
 *
 * The planner (EquippedService, over its live slots) and the compare page (over a
 * saved build read from its blob) both value affixes through these, so the two can't
 * disagree. Within a bonus type only the best value counts and different types add
 * up, except the filigree types, which add up within the type too.
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
  affixName: string;
  bonusType: string;
  value: number;
}

/** The slot of the one value summed filigree bonuses of a type add up to (valuesForAffixType). */
export const SUMMED_FILIGREE_SLOT = 'Filigree';

export interface AffixTypeValueOptions {
  /** Leave this slot's item out: it is about to be replaced. */
  skipSlot?: string | null;
  /** Use these set bonuses instead of the build's own (recounted for a replacement). */
  setBonuses?: ReadonlyArray<[string, Affix[]]>;
}

/**
 * The non-gear values supplying `affixName` (of `bonusType`, when given). Like a set bonus, an entry
 * for an affix group ("Combat Mastery") supplies each of its members ("Stunning", ...) at its value.
 */
export function externalValuesFor(entries: ReadonlyArray<ExternalAffixEntry>, affixSvc: AffixService,
    affixName: string, bonusType?: string): ExternalAffixEntry[] {
  return entries.filter(entry => entry.kind === 'value'
    && (bonusType === undefined || entry.bonusType === bonusType)
    && affixSvc.resolvesToAffix(entry.affixName, affixName));
}

/**
 * Every value the build gets for an affix type, best first.
 *
 * Items and filigree count an affix group at its members' own values (flattened, so Riposte's
 * Armor Class is half of it), while set bonuses and non-gear entries give each member the group's
 * full value.
 */
export function valuesForAffixType(view: BuildView, affixSvc: AffixService, affixName: string, bonusType: string,
    options: AffixTypeValueOptions = {}): Array<{ slot: string; value: number }> {
  const values: Array<{ slot: string; value: number }> = [];
  for (const [slot, item] of view.items()) {
    if (item && slot !== options.skipSlot) {
      for (const affix of affixSvc.getActiveAffixes(item)) {
        if (affix.name === affixName && affix.type === bonusType) {
          values.push({ slot, value: affix.value });
        }
      }
    }
  }

  for (const [, affixes] of options.setBonuses ?? view.setBonuses()) {
    for (const affix of affixes) {
      if (affixSvc.resolvesToAffix(affix.name, affixName) && affix.type === bonusType) {
        values.push({ slot: 'set', value: affix.value });
      }
    }
  }

  for (const entry of externalValuesFor(view.externalEntries(), affixSvc, affixName, bonusType)) {
    values.push({ slot: NON_GEAR_SLOT, value: entry.value });
  }

  const filigree = view.filigreeFor(affixName, bonusType);
  if (SUMMED_FILIGREE_BONUS_TYPES.has(bonusType)) {
    if (filigree.length) {
      values.push({ slot: SUMMED_FILIGREE_SLOT, value: filigree.reduce((sum, entry) => sum + entry.affix.value, 0) });
    }
  } else {
    values.push(...filigree.map(entry => ({ slot: entry.slot, value: entry.affix.value })));
  }

  return values.sort((a, b) => b.value - a.value);
}

/** The value the build has for an affix type: the best one, or every filigree one added up. 0 for none. */
export function bestValueFor(view: BuildView, affixSvc: AffixService, affixName: string, bonusType: string): number {
  return valuesForAffixType(view, affixSvc, affixName, bonusType)[0]?.value ?? 0;
}

/** What supplies the build's value for an affix type: each source giving the best value, every one for a summed type. */
export function sourcesFor(view: BuildView, affixSvc: AffixService, affixName: string, bonusType: string): AffixSource[] {
  const bestValue = bestValueFor(view, affixSvc, affixName, bonusType);
  if (!bestValue) {
    return [];
  }

  const sources: AffixSource[] = [];
  for (const [slot, item] of view.items()) {
    if (!item) {
      continue;
    }
    for (const affix of affixSvc.getActiveAffixes(item)) {
      if (affix.name === affixName && affix.type === bonusType && affix.value === bestValue) {
        sources.push({ kind: 'item', slot, itemName: item.name, affixName: affix.name, bonusType: affix.type, value: affix.value });
      }
    }
  }

  for (const [setName, affixes] of view.setBonuses()) {
    for (const affix of affixes) {
      if (affixSvc.resolvesToAffix(affix.name, affixName) && affix.type === bonusType && affix.value === bestValue) {
        sources.push({ kind: 'set', slot: 'Set', itemName: setName, affixName: affix.name, bonusType: affix.type, value: affix.value });
      }
    }
  }

  for (const entry of externalValuesFor(view.externalEntries(), affixSvc, affixName, bonusType)) {
    if (entry.value === bestValue) {
      sources.push({
        kind: 'external', slot: NON_GEAR_SLOT, itemName: entry.label, affixName: entry.affixName,
        bonusType: entry.bonusType, value: entry.value
      });
    }
  }

  // A summed type's best value is all of them together, so every one is a source.
  const summed = SUMMED_FILIGREE_BONUS_TYPES.has(bonusType);
  for (const entry of view.filigreeFor(affixName, bonusType)) {
    if (summed || entry.affix.value === bestValue) {
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

  return sources;
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

