import { Item } from './item';
import { Craftable } from './craftable';
import { CraftableOption } from './craftable-option';

describe('Item', () => {
  it('should create an instance', () => {
    const item = new Item({
      name: 'Test Item',
      slot: 'Trinket',
      type: '',
      ml: 1,
      affixes: [],
      sets: [],
      url: '/page/Test_Item',
      pack: 'Test Pack',
      rare: true,
      crafting: [],
      quests: [],
      artifact: false,
    });

    expect(item).toBeTruthy();
    expect(item.pack).toBe('Test Pack');
    expect(item.rare).toBe(true);
  });

  it('preserves selected crafting options when cloning an item', () => {
    const item = new Item({
      name: 'Crafted Test Item',
      slot: 'Trinket',
      type: '',
      ml: 1,
      affixes: [],
      sets: [],
      url: '/page/Crafted_Test_Item',
      crafting: [
        {
          name: 'Test Crafting',
          options: [
            { name: 'First Option' },
          ],
        },
      ],
      quests: [],
      artifact: false,
    });

    item.getCraftingByName('Test Crafting')?.selectByParamDescription('First Option');

    const clone = new Item(item);

    expect(clone).not.toBe(item);
    expect(clone.getCraftingByName('Test Crafting')).not.toBe(item.getCraftingByName('Test Crafting'));
    expect(clone.getCraftingByName('Test Crafting')?.selected.getParamDescription()).toBe('First Option');
  });

  it('keeps the selected crafting system when an option name is shared between systems', () => {
    const slot = new Craftable('Augment Slot 1', []);
    slot.setCraftingSystemOptions(new Map([
      ['Colorless Augment Slot', [new CraftableOption({ name: 'Diamond of Test' })]],
      ['Blue Augment Slot', [new CraftableOption({ name: 'Diamond of Test' })]],
    ]), 'Blue Augment Slot');
    slot.selectByParamDescription('Diamond of Test');

    expect(slot.selectedCraftingSystemName).toBe('Blue Augment Slot');
    expect(slot.selected.getParamDescription()).toBe('Diamond of Test');

    // Round trip through the description used for URLs, from a different starting system.
    const description = slot.getSelectedParamDescription();
    slot.selectCraftingSystem('Colorless Augment Slot');
    slot.selectByParamDescription(description);

    expect(slot.selectedCraftingSystemName).toBe('Blue Augment Slot');
    expect(slot.selected.getParamDescription()).toBe('Diamond of Test');
  });

  it('keeps the selected option when the available crafting systems are refreshed', () => {
    const slot = new Craftable('Augment Slot 2', []);
    slot.setCraftingSystemOptions(new Map([
      ['Colorless Augment Slot', [new CraftableOption({ name: 'Diamond of Test' })]],
    ]), 'Colorless Augment Slot');
    slot.selectByParamDescription('Diamond of Test');

    slot.setAvailableCraftingSystemOptions(['Colorless Augment Slot'], slot.selectedCraftingSystemName);

    expect(slot.selectedCraftingSystemName).toBe('Colorless Augment Slot');
    expect(slot.selected.getParamDescription()).toBe('Diamond of Test');
    expect(slot.options).toContain(slot.selected);
  });

  it('clones nested crafting-system selections without coupling empty augment slots', () => {
    const slotOne = new Craftable('Augment Slot 1', []);
    const slotTwo = new Craftable('Augment Slot 2', []);
    const augmentOptions = new Map([
      ['Colorless Augment Slot', [new CraftableOption({ name: 'Diamond of Test' })]],
      ['Blue Augment Slot', [new CraftableOption({ name: 'Sapphire of Test' })]],
    ]);
    slotOne.setCraftingSystemOptions(augmentOptions, 'Blue Augment Slot');
    slotTwo.setCraftingSystemOptions(augmentOptions, 'Colorless Augment Slot');
    slotOne.selectCraftingSystem('');
    const item = new Item({
      name: 'Essence Crafting Armor',
      slot: 'Armor',
      type: '',
      ml: 36,
      affixes: [],
      sets: [],
      url: '/page/Essence_Crafting_Armor',
      crafting: [slotOne, slotTwo],
      quests: [],
      artifact: false,
    });

    const clone = new Item(item);

    expect(clone.getCraftingByName('Augment Slot 1')?.selectedCraftingSystemName).toBe('');
    expect(clone.getCraftingByName('Augment Slot 2')?.selectedCraftingSystemName).toBe('Colorless Augment Slot');
  });

  it('distinguishes generated Essence Crafting blanks from named essence-craftable items', () => {
    const blank = new Item({
      name: 'Essence Crafting Trinket',
      slot: 'Trinket',
      type: '',
      ml: 34,
      affixes: [],
      sets: [],
      url: '/page/Essence_Crafting_Trinket',
      crafting: [
        {
          name: 'Prefix',
          options: [],
        },
      ],
      quests: [],
      artifact: false,
    });
    const namedCraftable = new Item({
      name: 'Crafted Rune Arm',
      slot: 'Offhand',
      type: 'Rune Arms',
      ml: 34,
      affixes: [],
      sets: [],
      url: '/page/Crafted_Rune_Arm',
      crafting: [
        {
          name: 'Prefix',
          options: [],
        },
      ],
      quests: [],
      artifact: false,
    });

    expect(blank.isEssenceCrafted()).toBeTruthy();
    expect(blank.isGeneratedEssenceCraftingBlank()).toBe(true);
    expect(namedCraftable.isEssenceCrafted()).toBeTruthy();
    expect(namedCraftable.isGeneratedEssenceCraftingBlank()).toBe(false);
  });
});
