import type { Affix } from '../affixes/affix';
import type { AffixService } from '../affixes/affix.service';
import { getMaxFiligreeSlots } from '../affixes/filigree-affix';
import {
  countFiligreeSetPieces, CountedFiligree, countHostFiligree, FILIGREE_HOSTS, FiligreeHost, FiligreeLoadout,
  MAX_ARTIFACT_FILIGREE_SLOTS, MAX_WEAPON_FILIGREE_SLOTS
} from '../gear/filigree';
import type { FiligreeDbService } from '../gear/filigree-db.service';
import type { Item } from '../gear/item';

/** Where filigree sources are reported (AffixSource.slot, as shown in tooltips). */
export const FILIGREE_SOURCE_SLOTS: Readonly<Record<FiligreeHost | 'set', string>> = {
  weapon: 'Weapon filigree',
  artifact: 'Artifact filigree',
  set: 'Filigree set',
};

/** One affix a slotted filigree, or an active filigree set, gives the build. */
export interface FiligreeContribution {
  /** The host the filigree is slotted in; null for a set bonus. */
  host: FiligreeHost | null;
  /** FILIGREE_SOURCE_SLOTS' entry for it. */
  slot: string;
  /** The filigree ("Celerity: Dexterity (Rare)") or set name. */
  itemName: string;
  affix: Affix;
}

/** The items holding filigrees, with their slots: the main-hand weapon, and whichever minor artifact is equipped. */
export type FiligreeHosts = Record<FiligreeHost, { slot: string; item: Item } | null>;

export function findFiligreeHosts(slots: ReadonlyMap<string, Item | null>): FiligreeHosts {
  const weapon = slots.get('Weapon') ?? null;
  let artifact: { slot: string; item: Item } | null = null;
  for (const [slot, item] of slots) {
    if (item?.artifact) {
      artifact = { slot, item };
      break;
    }
  }
  return { weapon: weapon ? { slot: 'Weapon', item: weapon } : null, artifact };
}

/** The most slots the host can open: 10 for any weapon, an artifact's Max Filigree Slots, 0 with none equipped. */
export function filigreeCapacity(host: FiligreeHost, hosts: FiligreeHosts): number {
  const held = hosts[host];
  if (!held) {
    return 0;
  }
  return host === 'weapon' ? MAX_WEAPON_FILIGREE_SLOTS : Math.min(getMaxFiligreeSlots(held.item), MAX_ARTIFACT_FILIGREE_SLOTS);
}

/** Every filigree that counts, both hosts: as many of each host's as it holds. */
export function countLoadoutFiligree(loadout: FiligreeLoadout, hosts: FiligreeHosts): CountedFiligree[] {
  return FILIGREE_HOSTS.flatMap(host => countHostFiligree(host, loadout[host], filigreeCapacity(host, hosts)));
}

/** Filigree set -> pieces, over counted filigrees. */
export function filigreeSetPiecesOf(counted: ReadonlyArray<CountedFiligree>,
    filigreeDb: Pick<FiligreeDbService, 'getSets'>): Map<string, number> {
  return countFiligreeSetPieces(counted, name => filigreeDb.getSets(name));
}

/** What the counted filigrees and their active sets give the build, affix groups flattened (keeping the group). */
export function filigreeContributionsOf(counted: ReadonlyArray<CountedFiligree>,
    filigreeDb: Pick<FiligreeDbService, 'getAffixes' | 'getSets' | 'getSetBonus'>,
    affixSvc: Pick<AffixService, 'flattenAffixGroups'>): FiligreeContribution[] {
  const contributions: FiligreeContribution[] = [];
  const add = (host: FiligreeHost | null, itemName: string, affixes: Affix[]) => {
    const slot = FILIGREE_SOURCE_SLOTS[host ?? 'set'];
    for (const affix of affixSvc.flattenAffixGroups(affixes, true)) {
      contributions.push({ host, slot, itemName, affix });
    }
  };
  for (const entry of counted) {
    if (entry.contributes) {
      add(entry.host, entry.choice.name + (entry.choice.rare ? ' (Rare)' : ''), filigreeDb.getAffixes(entry.choice));
    }
  }
  for (const [set, pieces] of filigreeSetPiecesOf(counted, filigreeDb)) {
    add(null, set, filigreeDb.getSetBonus(set, pieces));
  }
  return contributions;
}

/** The contributions to `affixName` (of `bonusType`, when given). */
export function filigreeContributionsFor(contributions: ReadonlyArray<FiligreeContribution>, affixName: string,
    bonusType?: string): FiligreeContribution[] {
  return contributions.filter(entry => entry.affix.name === affixName
    && (bonusType === undefined || entry.affix.type === bonusType));
}
