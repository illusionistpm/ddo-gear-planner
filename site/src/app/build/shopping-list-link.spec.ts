import {
  hashNeededKey, parseShoppingListFragment, shoppingListFragment, ShoppingListLink, snapshotLink
} from './shopping-list-link';

describe('shopping list links', () => {
  it('hashes a key with FNV-1a 32 over its UTF-8 bytes, in base 36', () => {
    // The published FNV-1a test vectors. Links already shared depend on these.
    expect(hashNeededKey('')).toBe((0x811c9dc5).toString(36));
    expect(hashNeededKey('a')).toBe((0xe40c292c).toString(36));
    expect(hashNeededKey('foobar')).toBe((0xbf9cf968).toString(36));
    // UTF-8, not UTF-16 code units: U+00E9 is the two bytes C3 A9.
    expect(hashNeededKey('é')).toBe((0x1e9de8c1).toString(36));
    expect(hashNeededKey('a|Ring1|Colorless Augment Slot#0|Diamond of Tests')).toMatch(/^[0-9a-z]{1,7}$/);
  });

  it('writes each kind of link', () => {
    expect(shoppingListFragment({ kind: 'own' })).toBe('shopping-list');
    expect(shoppingListFragment({ kind: 'live' })).toBe('still-needed');
    expect(shoppingListFragment({ kind: 'snapshot', hashes: new Set(['zz', '1a', 'b']) })).toBe('still-needed:1.1a.b.zz');
    expect(shoppingListFragment({ kind: 'snapshot', hashes: new Set() })).toBe('still-needed:1');
  });

  it('snapshots still-needed keys as their hashes, once each, in a stable order', () => {
    const link = snapshotLink(['b-key', 'a-key', 'b-key']);

    expect(link).toEqual({ kind: 'snapshot', hashes: new Set([hashNeededKey('a-key'), hashNeededKey('b-key')]) });
    expect(shoppingListFragment(link)).toBe(shoppingListFragment(snapshotLink(['a-key', 'b-key'])));
  });

  it('reads back what it writes, with or without the #', () => {
    const links: ShoppingListLink[] = [
      { kind: 'own' }, { kind: 'live' }, snapshotLink(['x', 'y', 'z']), snapshotLink([])
    ];
    for (const link of links) {
      expect(parseShoppingListFragment(shoppingListFragment(link))).toEqual(link);
      expect(parseShoppingListFragment(`#${shoppingListFragment(link)}`)).toEqual(link);
    }
  });

  it('reads a percent-encoded fragment', () => {
    expect(parseShoppingListFragment('still-needed%3A1.abc')).toEqual({ kind: 'snapshot', hashes: new Set(['abc']) });
  });

  it('reads anything else as no link', () => {
    for (const fragment of [
      null, undefined, '', '#', 'some-anchor', '/main?x=1', 'shopping-list-extra', 'still-needed:', 'still-needed:2.abc',
      'still-needed:1.ABC', 'still-needed:1.abcdefgh', 'still-needed:1.a-b', 'still-needed:1x'
    ]) {
      expect(parseShoppingListFragment(fragment)).toBeNull();
    }
  });
});
