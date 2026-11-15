import type { AffixService } from '../affixes/affix.service';
import { affixTotal, AffixTotal, AffixTotalRules } from '../affixes/build-totals';
import { MAX_FILIGREE_SLOTS_AFFIX } from '../affixes/filigree-affix';
import { buildTrackedAffixGroups } from '../affixes/tracked-affix-derivation';
import { FILIGREE_HOSTS, FiligreeHost } from '../gear/filigree';
import type { Item } from '../gear/item';
import { sortSlotsForDisplay } from '../gear/slot-display';
import { BuildModel, contributedAffixNames } from '../planner/build-snapshot';

/**
 * Two saved builds side by side: each affix's total in both and the difference, and what
 * changed in the gear. It doesn't weigh one stat against another - that's the player's call.
 * "A" is the build compared against; deltas read B minus A.
 */

export type TrackedIn = 'both' | 'a' | 'b' | 'neither';

export interface AffixDiffRow {
  name: string;
  /** An on/off affix: totals are 1 or 0, and the delta reads gained or lost. */
  checklist: boolean;
  a: AffixTotal;
  b: AffixTotal;
  /** b's total minus a's. */
  delta: number;
  trackedIn: TrackedIn;
}

export interface AffixDiffGroup {
  /** The tracked-affix category, as the planner groups them. */
  name: string;
  rows: AffixDiffRow[];
}

/** An item as the gear comparison shows it. */
export interface GearSide {
  name: string;
  ml: number;
}

export interface CraftingChange {
  system: string;
  /** What's chosen, or null for nothing. */
  a: string | null;
  b: string | null;
}

export interface GearChange {
  slot: string;
  kind: 'swapped' | 'added' | 'removed' | 'changed';
  a: GearSide | null;
  b: GearSide | null;
  /** For the same item on both sides, the crafting and augment choices that differ. */
  crafting: CraftingChange[];
}

export interface FiligreeChange {
  host: FiligreeHost;
  removed: string[];
  added: string[];
}

export interface SetChange {
  setName: string;
  filigree: boolean;
  aPieces: number;
  bPieces: number;
  /** Bonus tiers reached. */
  aTiers: number;
  bTiers: number;
}

export interface ComparisonSummary {
  higher: number;
  lower: number;
  unchanged: number;
}

export interface BuildComparison {
  /** The affixes either build tracks, by category. */
  tracked: AffixDiffGroup[];
  /** Affixes neither build tracks whose totals differ, biggest change first. */
  other: AffixDiffRow[];
  gear: GearChange[];
  filigree: FiligreeChange[];
  sets: SetChange[];
  /** Over the tracked affixes. */
  summary: ComparisonSummary;
}

export interface ComparisonDeps {
  affixSvc: AffixService;
  rules: AffixTotalRules;
}

export function compareBuilds(a: BuildModel, b: BuildModel, deps: ComparisonDeps): BuildComparison {
  const totalsA = new Map<string, AffixTotal>();
  const totalsB = new Map<string, AffixTotal>();
  const rowOf = (name: string): AffixDiffRow => {
    const totalA = cached(totalsA, name, () => affixTotal(a, deps.affixSvc, deps.rules, name));
    const totalB = cached(totalsB, name, () => affixTotal(b, deps.affixSvc, deps.rules, name));
    return {
      name,
      checklist: totalA.checklist,
      a: totalA,
      b: totalB,
      delta: totalB.total - totalA.total,
      trackedIn: trackedIn(name, a, b),
    };
  };

  const trackedNames = new Set([...a.snapshot.tracked, ...b.snapshot.tracked]);
  if (hasArtifact(a) || hasArtifact(b)) {
    trackedNames.add(MAX_FILIGREE_SLOTS_AFFIX);
  }
  const trackedRows = new Map([...trackedNames].map(name => [name, rowOf(name)]));
  const numeric = [...trackedRows.values()].filter(row => !row.checklist).map(row => row.name);
  const checklist = [...trackedRows.values()].filter(row => row.checklist).map(row => row.name).sort();
  const tracked = buildTrackedAffixGroups(numeric, checklist, deps.affixSvc)
    .map(group => ({
      name: group.name,
      rows: [...group.affixes, ...group.checklistAffixes].map(name => trackedRows.get(name)!),
    }))
    .filter(group => group.rows.length);

  const contributed = new Set([...contributedAffixNames(a, deps.affixSvc), ...contributedAffixNames(b, deps.affixSvc)]);
  const other = [...contributed]
    .filter(name => !trackedNames.has(name))
    .map(rowOf)
    .filter(row => row.delta !== 0)
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || x.name.localeCompare(y.name));

  const rows = [...trackedRows.values()];
  return {
    tracked,
    other,
    gear: gearChanges(a, b),
    filigree: filigreeChanges(a, b),
    sets: setChanges(a, b),
    summary: {
      higher: rows.filter(row => row.delta > 0).length,
      lower: rows.filter(row => row.delta < 0).length,
      unchanged: rows.filter(row => row.delta === 0).length,
    },
  };
}

function cached<T>(map: Map<string, T>, key: string, make: () => T): T {
  let value = map.get(key);
  if (value === undefined) {
    value = make();
    map.set(key, value);
  }
  return value;
}

function trackedIn(name: string, a: BuildModel, b: BuildModel): TrackedIn {
  const inA = a.snapshot.tracked.has(name);
  const inB = b.snapshot.tracked.has(name);
  return inA && inB ? 'both' : inA ? 'a' : inB ? 'b' : 'neither';
}

function hasArtifact(model: BuildModel): boolean {
  return [...model.snapshot.slots.values()].some(item => item?.artifact);
}

function gearSide(item: Item): GearSide {
  return { name: item.name, ml: item.ml };
}

/** What a crafting system has chosen, keyed by how the build URL records it, with how to show it. */
function craftingChoices(item: Item): Map<string, { key: string; label: string | null }> {
  const choices = new Map<string, { key: string; label: string | null }>();
  for (const craftable of item.crafting ?? []) {
    const key = craftable.getSelectedParamDescription();
    const described = key ? craftable.selected?.describe(true, false) : '';
    const label = !key ? null
      : described || (craftable.selectedCraftingSystemName ? `${craftable.selectedCraftingSystemName} (empty)` : key);
    choices.set(craftable.name, { key, label });
  }
  return choices;
}

export function gearChanges(a: BuildModel, b: BuildModel): GearChange[] {
  const changes: GearChange[] = [];
  for (const slot of sortSlotsForDisplay([...a.snapshot.slots.keys()])) {
    const itemA = a.snapshot.slots.get(slot) ?? null;
    const itemB = b.snapshot.slots.get(slot) ?? null;
    if (!itemA && !itemB) {
      continue;
    }
    if (!itemA || !itemB) {
      changes.push({
        slot, kind: itemA ? 'removed' : 'added', a: itemA && gearSide(itemA), b: itemB && gearSide(itemB), crafting: [],
      });
      continue;
    }
    if (itemA.name !== itemB.name) {
      changes.push({ slot, kind: 'swapped', a: gearSide(itemA), b: gearSide(itemB), crafting: [] });
      continue;
    }
    const choicesA = craftingChoices(itemA);
    const choicesB = craftingChoices(itemB);
    const crafting: CraftingChange[] = [];
    for (const system of new Set([...choicesA.keys(), ...choicesB.keys()])) {
      const choiceA = choicesA.get(system);
      const choiceB = choicesB.get(system);
      if ((choiceA?.key ?? '') !== (choiceB?.key ?? '')) {
        crafting.push({ system, a: choiceA?.label ?? null, b: choiceB?.label ?? null });
      }
    }
    if (crafting.length || itemA.ml !== itemB.ml) {
      changes.push({ slot, kind: 'changed', a: gearSide(itemA), b: gearSide(itemB), crafting });
    }
  }
  return changes;
}

function filigreeNames(model: BuildModel, host: FiligreeHost): string[] {
  return model.countedFiligree
    .filter(entry => entry.host === host)
    .map(entry => entry.choice.name + (entry.choice.rare ? ' (Rare)' : ''));
}

/** Filigree in one build's host and not the other's, a copy at a time. */
export function filigreeChanges(a: BuildModel, b: BuildModel): FiligreeChange[] {
  const changes: FiligreeChange[] = [];
  for (const host of FILIGREE_HOSTS) {
    const removed = multisetMinus(filigreeNames(a, host), filigreeNames(b, host));
    const added = multisetMinus(filigreeNames(b, host), filigreeNames(a, host));
    if (removed.length || added.length) {
      changes.push({ host, removed, added });
    }
  }
  return changes;
}

function multisetMinus(from: string[], take: string[]): string[] {
  const left = [...take];
  return from.filter(name => {
    const index = left.indexOf(name);
    if (index >= 0) {
      left.splice(index, 1);
      return false;
    }
    return true;
  });
}

export function setChanges(a: BuildModel, b: BuildModel): SetChange[] {
  const key = (set: { setName: string; filigree?: boolean }) => `${set.filigree ? 'f' : 'g'}:${set.setName}`;
  const setsB = new Map(b.sets.map(set => [key(set), set]));
  const changes: SetChange[] = [];
  const seen = new Set<string>();
  for (const set of [...a.sets, ...b.sets]) {
    const id = key(set);
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const inA = a.sets.find(other => key(other) === id);
    const inB = setsB.get(id);
    const tiers = (side?: typeof set) => side?.tiers.filter(tier => tier.eligible).length ?? 0;
    const change: SetChange = {
      setName: set.setName,
      filigree: !!set.filigree,
      aPieces: inA?.pieces ?? 0,
      bPieces: inB?.pieces ?? 0,
      aTiers: tiers(inA),
      bTiers: tiers(inB),
    };
    if (change.aPieces !== change.bPieces || change.aTiers !== change.bTiers) {
      changes.push(change);
    }
  }
  return changes;
}
