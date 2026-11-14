import { Craftable } from '../../gear/craftable';
import { CraftableOption } from '../../gear/craftable-option';
import { canStartCraftingSlotSwap, canSwapCraftingSlots, swapCraftingSlots } from './crafting-slot-swap';

// As GearDbService builds them: a Purple slot lists the Blue, Red and Colorless
// augments too, and a Blue slot the Colorless ones - the very same objects.
const colorless = option('Colorless Gem');
const blue = option('Blue Gem');
const otherBlue = option('Blue Stone');
const red = option('Red Gem');
// A Blue augment with a Colorless one's name: a different augment all the same.
const blueNamedLikeColorless = option('Colorless Gem');

const blueSlot = () => new Craftable('Blue Augment Slot', [blue, otherBlue, blueNamedLikeColorless, colorless]);
const redSlot = () => new Craftable('Red Augment Slot', [red, colorless]);
const purpleSlot = () => new Craftable('Purple Augment Slot', [blue, otherBlue, red, colorless]);
const colorlessSlot = () => new Craftable('Colorless Augment Slot', [colorless]);

function option(name: string): CraftableOption {
  return new CraftableOption({ name, affixes: [{ name: 'Strength', type: 'Enhancement', value: 1 }] });
}

function holding(craft: Craftable, selected: CraftableOption): Craftable {
  craft.selected = selected;
  return craft;
}

describe('crafting slot swaps', () => {
  it('swaps two augments of the same colour', () => {
    const a = holding(blueSlot(), blue);
    const b = holding(blueSlot(), otherBlue);

    expect(canSwapCraftingSlots(a, b)).toBe(true);
    swapCraftingSlots(a, b);

    expect(a.selected).toBe(otherBlue);
    expect(b.selected).toBe(blue);
  });

  it('moves an augment into an empty slot that takes it, leaving its own empty', () => {
    const a = holding(blueSlot(), blue);
    const b = purpleSlot();

    expect(canSwapCraftingSlots(a, b)).toBe(true);
    swapCraftingSlots(a, b);

    expect(a.selected.getParamDescription()).toBe('');
    expect(a.selected).toBe(a.options[0]);
    expect(b.selected).toBe(blue);
  });

  it('swaps across colours when each slot takes the other\'s augment', () => {
    expect(canSwapCraftingSlots(holding(blueSlot(), blue), holding(purpleSlot(), otherBlue))).toBe(true);
    expect(canSwapCraftingSlots(holding(redSlot(), colorless), colorlessSlot())).toBe(true);
    expect(canSwapCraftingSlots(holding(purpleSlot(), colorless), holding(redSlot(), red))).toBe(true);
  });

  it('refuses when either slot won\'t take the other\'s augment', () => {
    // A Red augment can't come back into a Blue slot.
    expect(canSwapCraftingSlots(holding(blueSlot(), blue), holding(purpleSlot(), red))).toBe(false);
    expect(canSwapCraftingSlots(holding(purpleSlot(), red), holding(blueSlot(), blue))).toBe(false);
    // Nor a Blue one into a Red or Colorless slot, even an empty one.
    expect(canSwapCraftingSlots(holding(blueSlot(), blue), redSlot())).toBe(false);
    expect(canSwapCraftingSlots(holding(blueSlot(), blue), colorlessSlot())).toBe(false);
  });

  it('goes by the augment itself, not its name', () => {
    expect(canSwapCraftingSlots(holding(blueSlot(), blueNamedLikeColorless), colorlessSlot())).toBe(false);
    expect(canSwapCraftingSlots(holding(blueSlot(), colorless), colorlessSlot())).toBe(true);
  });

  it('needs an augment to pick up, and two different slots', () => {
    const a = holding(blueSlot(), blue);

    expect(canStartCraftingSlotSwap(blueSlot())).toBe(false);
    expect(canSwapCraftingSlots(blueSlot(), a)).toBe(false);
    expect(canSwapCraftingSlots(a, a)).toBe(false);
    // Nor is there any point trading an augment for the same one.
    expect(canSwapCraftingSlots(a, holding(purpleSlot(), blue))).toBe(false);
  });

  it('leaves systems other than augments alone', () => {
    const tier = new Craftable('Upgrade Tier', [blue]);
    tier.selected = blue;
    const sameTier = new Craftable('Upgrade Tier', [blue]);

    expect(canStartCraftingSlotSwap(tier)).toBe(false);
    expect(canSwapCraftingSlots(holding(blueSlot(), blue), sameTier)).toBe(false);
  });

  it('takes a flexible slot as the colour it has been given, and not before', () => {
    const flexible = new Craftable('Augment Slot 1', []);
    flexible.setCraftingSystemOptions(new Map([['Blue Augment Slot', [blue, otherBlue]], ['Red Augment Slot', [red]]]));
    const a = holding(blueSlot(), blue);

    expect(canSwapCraftingSlots(a, flexible)).toBe(false);

    flexible.selectCraftingSystem('Blue Augment Slot');
    expect(canSwapCraftingSlots(a, flexible)).toBe(true);
    flexible.selected = otherBlue;
    expect(canStartCraftingSlotSwap(flexible)).toBe(true);
    expect(canSwapCraftingSlots(flexible, a)).toBe(true);

    flexible.selectCraftingSystem('Red Augment Slot');
    expect(canSwapCraftingSlots(a, flexible)).toBe(false);
  });

  it('is its own inverse', () => {
    const a = holding(blueSlot(), blue);
    const b = holding(purpleSlot(), otherBlue);

    swapCraftingSlots(a, b);
    swapCraftingSlots(a, b);

    expect(a.selected).toBe(blue);
    expect(b.selected).toBe(otherBlue);
  });
});
