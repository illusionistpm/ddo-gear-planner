import { AUGMENT_SLOT_1, AUGMENT_SLOT_2, availableSecondSlotSystems, canHaveSecondAugmentSlot, isAugmentSystemName, isCraftingSlotAvailable, secondAugmentSlotColors, } from './augment-slots';
import { Craftable } from './craftable';
import { CraftableOption } from './craftable-option';
import { Item } from './item';

function itemWithSlotOne(system: string): Item {
  const slotOne = new Craftable(AUGMENT_SLOT_1, []);
  slotOne.setCraftingSystemOptions(new Map<string, CraftableOption[]>([
    ['Colorless Augment Slot', []],
    ['Green Augment Slot', []],
    ['Blue Augment Slot', []],
  ]), system);
  const item = new Item(null);
  item.name = 'Test Item';
  item.crafting = [slotOne, new Craftable(AUGMENT_SLOT_2, [])];
  return item;
}

describe('augment slots', () => {
  it('recognises coloured augment systems, not the generic slots', () => {
    expect(isAugmentSystemName('Blue Augment Slot')).toBe(true);
    expect(isAugmentSystemName(AUGMENT_SLOT_1)).toBe(false);
    expect(isAugmentSystemName('Green Steel Augment: Cometfall')).toBe(false);
  });

  it('builds slot 2 without Green when slot 1 can be Green, else Colorless only', () => {
    expect(secondAugmentSlotColors(['Colorless', 'Blue', 'Yellow', 'Green'])).toEqual(['Colorless', 'Blue', 'Yellow']);
    expect(secondAugmentSlotColors(['Colorless', 'Red'])).toEqual(['Colorless']);
  });

  it('opens slot 2 to every colour only behind a Green slot 1', () => {
    expect(availableSecondSlotSystems('Green Augment Slot', ['Colorless Augment Slot', 'Blue Augment Slot']))
      .toEqual(['Colorless Augment Slot', 'Blue Augment Slot']);
    expect(availableSecondSlotSystems('Blue Augment Slot', ['Colorless Augment Slot', 'Blue Augment Slot']))
      .toEqual(['Colorless Augment Slot']);
  });

  it('allows slot 2 only once slot 1 has a colour other than Colorless', () => {
    expect(canHaveSecondAugmentSlot(itemWithSlotOne(''))).toBe(false);
    expect(canHaveSecondAugmentSlot(itemWithSlotOne('Colorless Augment Slot'))).toBe(false);
    expect(canHaveSecondAugmentSlot(itemWithSlotOne('Blue Augment Slot'))).toBe(true);
    expect(canHaveSecondAugmentSlot(null)).toBe(false);
  });

  it('treats every other crafting slot as always available', () => {
    const item = itemWithSlotOne('');
    const [slotOne, slotTwo] = item.crafting;

    expect(isCraftingSlotAvailable(item, slotOne)).toBe(true);
    expect(isCraftingSlotAvailable(item, slotTwo)).toBe(false);
    expect(isCraftingSlotAvailable(item, new Craftable('Prefix', []))).toBe(true);
  });
});
