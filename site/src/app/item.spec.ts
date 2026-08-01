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
});
