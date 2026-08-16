import { Item } from './item';

describe('Item', () => {
  it('should create an instance', () => {
    expect(new Item({
      name: 'Test Item',
      slot: 'Trinket',
      type: '',
      ml: 1,
      affixes: [],
      sets: [],
      url: '/page/Test_Item',
      crafting: [],
      quests: [],
      artifact: false,
    })).toBeTruthy();
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
          hiddenFromAffixSearch: false,
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
});
