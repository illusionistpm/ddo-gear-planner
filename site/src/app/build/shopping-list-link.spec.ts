import { isShoppingListFragment, SHOPPING_LIST_FRAGMENT } from './shopping-list-link';

describe('the shopping list\'s URL fragment', () => {
  it('reads back what it writes, with or without the #', () => {
    expect(isShoppingListFragment(SHOPPING_LIST_FRAGMENT)).toBe(true);
    expect(isShoppingListFragment(`#${SHOPPING_LIST_FRAGMENT}`)).toBe(true);
  });

  it('reads anything else as the list closed', () => {
    for (const fragment of [null, undefined, '', '#', 'some-anchor', '/main?x=1', 'shopping-list-extra', 'still-needed']) {
      expect(isShoppingListFragment(fragment)).toBe(false);
    }
  });
});
