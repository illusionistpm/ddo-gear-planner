import { isAugmentSystemName } from './augment-slots';
import type { Craftable } from './craftable';
import type { CraftableOption } from './craftable-option';

/**
 * What a crafting selection means for someone gathering a build's gear:
 *
 * - `augment`: a separate thing to go and get, then slot in.
 * - `upgrade`: a named piece with its own source that is crafted onto the item
 *   (Dolorous, Fang, Green Steel "Active", ...).
 * - `step`: crafting done to the item itself - at the item's own device
 *   (Lost Purpose, Slaver's, Nearly Complete, Cannith crafting) or at one the
 *   option names (Green Steel tiers).
 * - `roll`: a random property the item dropped with. Nothing to craft; it's
 *   which drop to keep.
 * - `none`: nothing selected.
 */
export type CraftAcquisition = 'augment' | 'upgrade' | 'step' | 'roll' | 'none';

// Items that drop with one of several random properties, not a crafting system.
const RANDOM_ROLL_SYSTEM = /^(One of the following|Random (effect|set))/;

/** The system a selection was made in: the chosen one for slots that pick a system first. */
export function craftSystemName(craftable: Craftable): string {
  return craftable.selectedCraftingSystemName || craftable.name;
}

export function classifyCraftSelection(systemName: string, option: CraftableOption | null | undefined): CraftAcquisition {
  if (!option?.getParamDescription()) {
    return 'none';
  }
  if (isAugmentSystemName(systemName)) {
    return 'augment';
  }
  if (RANDOM_ROLL_SYSTEM.test(systemName)) {
    return 'roll';
  }
  if (option.name && option.quests.length) {
    return 'upgrade';
  }
  return 'step';
}
