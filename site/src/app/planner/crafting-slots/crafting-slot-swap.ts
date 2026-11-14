import { isAugmentSystemName } from '../../gear/augment-slots';
import { Craftable } from '../../gear/craftable';
import { CraftableOption } from '../../gear/craftable-option';
import { isCraftingSlotEmpty } from './crafting-slot-groups';

/**
 * Which augments a slot takes, for swapping: a coloured slot's own colour, or
 * the colour a flexible slot (essence-crafted, Necropolis 4 / Vol upgrade) has
 * been given. Null for a flexible slot with no colour yet, and for every
 * system that isn't an augment - an upgrade tier belongs to its item.
 */
function swapSystemOf(craft: Craftable): string | null {
  if (isAugmentSystemName(craft.name)) {
    return craft.name;
  }
  return isAugmentSystemName(craft.selectedCraftingSystemName) ? craft.selectedCraftingSystemName : null;
}

/** Whether a slot's augment can be picked up to swap: an augment slot with one in it. */
export function canStartCraftingSlotSwap(craft: Craftable): boolean {
  return swapSystemOf(craft) !== null && !isCraftingSlotEmpty(craft);
}

/**
 * Whether the augment in `source` can trade places with whatever is in
 * `target`: each slot has to take the other's augment, and an empty target
 * takes `source`'s and leaves `source` empty.
 *
 * "Takes" is the slot's option list, which GearDbService builds with what fits
 * merged in - a Purple slot lists the Blue, Red and Colorless augments too, a
 * Blue slot the Colorless ones - so a Blue augment can go between a Blue and a
 * Purple slot but a Red one can't come back the other way. Options are the
 * same objects in every slot that offers them, so a slot takes an augment
 * when it lists that very object: a name alone isn't enough, as a Blue and a
 * Colorless augment can share one.
 */
export function canSwapCraftingSlots(source: Craftable, target: Craftable): boolean {
  // The same augment in both would make it a no-op.
  if (source === target || source.selected === target.selected || !canStartCraftingSlotSwap(source) || swapSystemOf(target) === null) {
    return false;
  }
  return target.options.includes(source.selected)
    && (isCraftingSlotEmpty(target) || source.options.includes(target.selected));
}

/** Trades the two slots' augments, which canSwapCraftingSlots has to allow. Its own inverse. */
export function swapCraftingSlots(source: Craftable, target: Craftable): void {
  const moving = source.selected;
  source.selected = isCraftingSlotEmpty(target) ? emptyOptionOf(source) : target.selected;
  target.selected = moving;
}

function emptyOptionOf(craft: Craftable): CraftableOption {
  return craft.options.find(option => !option.getParamDescription()) ?? craft.options[0];
}
