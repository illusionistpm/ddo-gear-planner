import { Item } from '../gear/item';

/** Added to every Minor Artifact at data build time; its value is how many filigree slots the artifact can hold. */
export const MAX_FILIGREE_SLOTS_AFFIX = 'Max Filigree Slots';

/**
 * Minor Artifacts start at level 20, and the artifact you wear shapes the rest of a build, so the filigree
 * affix is tracked automatically whenever the level range reaches that far.
 */
export const FILIGREE_TRACKING_MIN_LEVEL = 20;

/** How many filigrees an artifact holds (its Max Filigree Slots), or 0 for anything else. */
export function getMaxFiligreeSlots(item: Item | null | undefined): number {
  if (!item?.artifact) {
    return 0;
  }
  return item.affixes.find(affix => affix.name === MAX_FILIGREE_SLOTS_AFFIX)?.value ?? 0;
}
