import { Affix } from '../affixes/affix';
import { AffixRank } from '../affixes/affix-rank.enum';
import { describeFiligreeAffixes, filigreeShortName } from '../filigree-slots/filigree-text';
import { FiligreeGroupMode } from '../planner/planner-view-state-storage';

/** What the picker needs to know about one filigree. */
export interface FiligreeFacts {
  name: string;
  sets: ReadonlyArray<string>;
  affixes: ReadonlyArray<Affix>;
  rareAffixes: ReadonlyArray<Affix>;
  /** Every affix name its own bonuses (rare included) give, affix groups expanded. */
  bonusNames: ReadonlyArray<string>;
  /** Every affix name its sets' bonuses give, at any tier. */
  setBonusNames: ReadonlyArray<string>;
}

export interface FiligreeEntry {
  name: string;
  /** The name without the set, when the group already names it. */
  label: string;
  setText: string;
  affixText: string;
  rareText: string;
  /** Already in this host: slotting it again adds a set piece, not its bonuses. */
  duplicate: boolean;
  /** Its bonuses or its sets' give a tracked affix. */
  relevant: boolean;
  className: string;
  searchText: string;
}

export interface FiligreeGroup {
  key: string;
  title: string;
  entries: FiligreeEntry[];
}

/**
 * The picker's list: every filigree, grouped by set (a raid filigree under both) or by each bonus it
 * gives, groups that help the tracked affixes first. Search matches names, sets and bonuses.
 */
export function buildFiligreeGroups(
  filigrees: ReadonlyArray<FiligreeFacts>,
  options: {
    mode: FiligreeGroupMode;
    isTracked: (affixName: string) => boolean;
    inHost: ReadonlySet<string>;
    search: string;
    hideIrrelevant: boolean;
    /** Kept in the list even when hidden, so the current choice is never missing. */
    current?: string;
  }
): { groups: FiligreeGroup[]; hiddenCount: number } {
  const term = options.search.trim().toLowerCase();
  const groups = new Map<string, FiligreeGroup>();
  let hiddenCount = 0;
  // Hiding only makes sense once something would be left: with nothing tracked, nothing helps.
  const anyRelevant = filigrees.some(filigree => isRelevant(filigree, options.isTracked));

  for (const filigree of filigrees) {
    const entry = toEntry(filigree, options);
    if (term && !entry.searchText.includes(term)) {
      continue;
    }
    if (options.hideIrrelevant && anyRelevant && !entry.relevant && filigree.name !== options.current) {
      hiddenCount++;
      continue;
    }
    const keys = options.mode === 'set'
      ? filigree.sets
      : [...new Set(filigree.affixes.map(affix => affix.name))];
    for (const key of keys) {
      let group = groups.get(key);
      if (!group) {
        group = { key, title: key, entries: [] };
        groups.set(key, group);
      }
      group.entries.push(options.mode === 'set' ? { ...entry, label: filigreeShortName(filigree.name) } : entry);
    }
  }

  const helps = (group: FiligreeGroup) => group.entries.some(entry => entry.relevant && !entry.duplicate);
  const sorted = [...groups.values()].sort((a, b) =>
    Number(helps(b)) - Number(helps(a)) || a.title.localeCompare(b.title));
  for (const group of sorted) {
    group.entries.sort((a, b) => Number(b.relevant) - Number(a.relevant) || a.label.localeCompare(b.label));
  }
  return { groups: sorted, hiddenCount };
}

function isRelevant(filigree: FiligreeFacts, isTracked: (affixName: string) => boolean): boolean {
  return filigree.bonusNames.some(isTracked) || filigree.setBonusNames.some(isTracked);
}

function toEntry(
  filigree: FiligreeFacts,
  options: { isTracked: (affixName: string) => boolean; inHost: ReadonlySet<string> }
): FiligreeEntry {
  const ownHelps = filigree.bonusNames.some(options.isTracked);
  const setHelps = filigree.setBonusNames.some(options.isTracked);
  const duplicate = options.inHost.has(filigree.name);
  let rank = AffixRank.Irrelevant;
  if (ownHelps && !duplicate) {
    rank = AffixRank.Best;
  } else if (ownHelps || setHelps) {
    // Only as a set piece: a duplicate's bonuses don't count, and a set bonus needs its other pieces.
    rank = AffixRank.Outranked;
  }
  const affixText = describeFiligreeAffixes(filigree.affixes);
  const rareText = describeFiligreeAffixes(filigree.rareAffixes);
  const setText = filigree.sets.join(' / ');
  return {
    name: filigree.name,
    label: filigree.name,
    setText,
    affixText,
    rareText,
    duplicate,
    relevant: ownHelps || setHelps,
    className: AffixRank[rank],
    searchText: [filigree.name, setText, affixText, rareText].join(' ').toLowerCase(),
  };
}
