import { NO_PACK_KEY } from '../../gear/pack-filter';
import type { ShoppingSource } from './shopping-list-types';

/**
 * Where to get each thing that comes from several places, so the list names
 * one quest for it rather than every one - a route through the fewest quests.
 * Pure: no Angular, no storage.
 *
 * - The user's own pick for a thing wins.
 * - Sources in packs the planner's pack filter hides are left out, unless
 *   that leaves none.
 * - Events, quests in no pack and the DDO Store are last resorts, in that
 *   order, as they close the list: a thing goes to one only when nothing
 *   better has it.
 * - Of what's left, a quest you're going to anyway comes first, then the
 *   quest that has the most of what's still to place.
 */

/**
 * What closes the list, after the real packs (by name): events, the quests in
 * no pack ('' here), and the store last of all. Events and the store are the
 * filter-only groups the pack map puts beside real packs (pack-filter.ts's
 * PSEUDO_PACKS); neither is somewhere you run.
 */
const TRAILING_PACKS: readonly string[] = ['Events', '', 'DDO Store'];

/** 0 for a real pack; higher for each later last resort. */
function packRank(pack: string | null): number {
  return TRAILING_PACKS.indexOf(pack ?? '') + 1;
}

/** The order of pack headings. */
export function comparePacks(a: string, b: string): number {
  const [rankA, rankB] = [packRank(a), packRank(b)];
  return rankA !== rankB ? rankA - rankB : a.localeCompare(b);
}

/** The quests the user chose to get a thing from, by its identity. */
export type ShoppingSourcePicks = Readonly<Record<string, readonly string[]>>;

export interface ShoppingRouteOptions {
  hiddenPacks: ReadonlySet<string>;
  picks: ShoppingSourcePicks;
}

/** Whether the pack filter hides a source's pack. */
export function isSourceHidden(source: ShoppingSource, hiddenPacks: ReadonlySet<string>): boolean {
  return hiddenPacks.has(source.pack ?? NO_PACK_KEY);
}

/** Each quest once, in the order given. */
export function distinctSources(sources: readonly ShoppingSource[]): ShoppingSource[] {
  const byQuest = new Map<string, ShoppingSource>();
  for (const source of sources) {
    if (!byQuest.has(source.quest)) {
      byQuest.set(source.quest, source);
    }
  }
  return Array.from(byQuest.values());
}

/** The sources a thing may be sent to: those shown by the pack filter, of the best rank. */
function candidates(sources: readonly ShoppingSource[], hiddenPacks: ReadonlySet<string>): ShoppingSource[] {
  const distinct = distinctSources(sources);
  const shown = distinct.filter(source => !isSourceHidden(source, hiddenPacks));
  const pool = shown.length ? shown : distinct;
  const best = Math.min(...pool.map(source => packRank(source.pack)));
  return pool.filter(source => packRank(source.pack) === best);
}

/**
 * The sources to list each thing under, by identity, given each thing's
 * sources. One each, unless the user picked more; none for a thing with no
 * known source.
 */
export function routeSources(things: ReadonlyMap<string, readonly ShoppingSource[]>,
    options: ShoppingRouteOptions): Map<string, ShoppingSource[]> {
  const routed = new Map<string, ShoppingSource[]>();
  const open = new Map<string, ShoppingSource[]>();
  for (const [identity, sources] of things) {
    const picked = options.picks[identity] ?? [];
    const chosen = distinctSources(sources).filter(source => picked.includes(source.quest));
    if (chosen.length) {
      routed.set(identity, chosen);
      continue;
    }
    const choices = candidates(sources, options.hiddenPacks);
    if (choices.length > 1) {
      open.set(identity, choices);
    } else {
      routed.set(identity, choices);
    }
  }

  const going = new Set(Array.from(routed.values()).flatMap(sources => sources.map(source => source.quest)));
  while (open.size) {
    const counts = new Map<string, number>();
    for (const choices of open.values()) {
      for (const source of choices) {
        counts.set(source.quest, (counts.get(source.quest) ?? 0) + 1);
      }
    }
    const [best] = Array.from(counts).sort(([questA, countA], [questB, countB]) =>
      Number(going.has(questB)) - Number(going.has(questA)) || countB - countA || questA.localeCompare(questB))[0];
    going.add(best);
    for (const [identity, choices] of open) {
      const there = choices.find(source => source.quest === best);
      if (there) {
        routed.set(identity, [there]);
        open.delete(identity);
      }
    }
  }
  return routed;
}
