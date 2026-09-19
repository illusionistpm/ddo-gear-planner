import type { Craftable } from './craftable';
import type { Item } from './item';

/**
 * Augment-slot naming and the rule linking an essence-crafted item's two
 * augment slots.
 *
 * Coloured augment crafting systems are named "<Colour> Augment Slot". An
 * essence-crafted item has two generic slots, "Augment Slot 1" and
 * "Augment Slot 2", each offering a choice of those systems. Slot 2 only
 * opens once slot 1 holds a colour other than Colorless, and then offers only
 * Colorless - unless slot 1 is Green, which opens slot 2 to every colour the
 * item allows except Green.
 */

export const AUGMENT_SLOT_1 = 'Augment Slot 1';
export const AUGMENT_SLOT_2 = 'Augment Slot 2';

const AUGMENT_SYSTEM_SUFFIX = ' Augment Slot';

export function augmentSystemName(color: string): string {
  return color + AUGMENT_SYSTEM_SUFFIX;
}

/** True for a coloured augment crafting system ("Blue Augment Slot"), not the generic "Augment Slot 1/2". */
export function isAugmentSystemName(name: string): boolean {
  return name.endsWith(AUGMENT_SYSTEM_SUFFIX);
}

export const COLORLESS_AUGMENT_SYSTEM = augmentSystemName('Colorless');
export const GREEN_AUGMENT_SYSTEM = augmentSystemName('Green');

/** The colours slot 2 is built with, given the colours slot 1 is built with. */
export function secondAugmentSlotColors(slotOneColors: string[]): string[] {
  return slotOneColors.includes('Green')
    ? slotOneColors.filter(color => color !== 'Green')
    : ['Colorless'];
}

/** The systems slot 2 may currently offer, out of the ones it was built with. */
export function availableSecondSlotSystems(slotOneSystem: string, slotTwoSystems: Iterable<string>): string[] {
  return slotOneSystem === GREEN_AUGMENT_SYSTEM ? Array.from(slotTwoSystems) : [COLORLESS_AUGMENT_SYSTEM];
}

export function canHaveSecondAugmentSlot(item: Item | null): boolean {
  const slotOneSystem = item?.getCraftingByName(AUGMENT_SLOT_1)?.selectedCraftingSystemName;
  return !!slotOneSystem && slotOneSystem !== COLORLESS_AUGMENT_SYSTEM;
}

/** Every crafting slot is usable except Augment Slot 2 while slot 1 doesn't allow it. */
export function isCraftingSlotAvailable(item: Item | null, craftable: Craftable): boolean {
  return craftable.name !== AUGMENT_SLOT_2 || canHaveSecondAugmentSlot(item);
}
