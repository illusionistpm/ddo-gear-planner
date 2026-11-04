import { parseShoppingListFragment, shoppingListFragment, ShoppingListLink } from './shopping-list-link';

describe('shopping list links', () => {
  it('writes each kind of link', () => {
    expect(shoppingListFragment({ kind: 'own' })).toBe('shopping-list');
    expect(shoppingListFragment({ kind: 'live' })).toBe('still-needed');
  });

  it('reads back what it writes, with or without the #', () => {
    const links: ShoppingListLink[] = [{ kind: 'own' }, { kind: 'live' }];
    for (const link of links) {
      expect(parseShoppingListFragment(shoppingListFragment(link))).toEqual(link);
      expect(parseShoppingListFragment(`#${shoppingListFragment(link)}`)).toEqual(link);
    }
  });

  it('reads anything else as no link', () => {
    for (const fragment of [
      null, undefined, '', '#', 'some-anchor', '/main?x=1', 'shopping-list-extra', 'still-needed:', 'still-needed:1.abc'
    ]) {
      expect(parseShoppingListFragment(fragment)).toBeNull();
    }
  });
});
