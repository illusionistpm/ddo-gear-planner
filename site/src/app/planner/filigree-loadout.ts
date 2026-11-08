import { getMaxFiligreeSlots } from '../affixes/filigree-affix';
import {
  CountedFiligree, countHostFiligree, FILIGREE_HOSTS, FiligreeHost, FiligreeLoadout, MAX_ARTIFACT_FILIGREE_SLOTS,
  MAX_WEAPON_FILIGREE_SLOTS
} from '../gear/filigree';
import type { Item } from '../gear/item';

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
  return FILIGREE_HOSTS.flatMap(host => countHostFiligree(
    host,
    host === 'weapon' ? loadout.weapon : loadout.artifact,
    filigreeCapacity(host, hosts)
  ));
}
