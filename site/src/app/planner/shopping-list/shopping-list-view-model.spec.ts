import type { UserItemLocation } from '../user-gear.service';
import type { ShoppingEntry, ShoppingProgress, ShoppingRow, ShoppingTroveLookup } from './shopping-list-types';
import {
  applyProgressPatch, buildShoppingListView, prunePatch, stillNeededKeys, togglePatch, troveCoveredKeys,
  UNKNOWN_SOURCE_LABEL
} from './shopping-list-view-model';

function entry(init: Partial<ShoppingEntry> & { key: string }): ShoppingEntry {
  return {
    kind: 'gear', slot: 'Ring1', identity: init.key, label: init.key, system: null, itemName: init.key, ml: 1,
    source: 'The Snitch', sourceInherited: false, pack: null, raid: false, rare: false, artifact: false,
    wikiUrl: null, troveName: null, parentKey: null, details: [],
    ...init,
  };
}

function trove(holdings: Record<string, number>): ShoppingTroveLookup {
  return {
    locationsFor: name => holdings[name]
      ? [{ character: 'Khalarim', location: 'Inventory', tab: '6', quantity: holdings[name] } as UserItemLocation]
      : undefined,
  };
}

// A ring in both ring slots, each with the same augment; a sword with a crafting step.
const ring1 = entry({ key: 'g|Ring1|Ring', slot: 'Ring1', identity: 'gear|Ring', label: 'Ring', troveName: 'Ring',
  pack: 'Sharn' });
const ring2 = entry({ key: 'g|Ring2|Ring', slot: 'Ring2', identity: 'gear|Ring', label: 'Ring', troveName: 'Ring',
  pack: 'Sharn' });
const aug1 = entry({ key: 'a|Ring1|Blue#0|Sapphire', kind: 'augment', slot: 'Ring1', identity: 'augment|Sapphire',
  label: 'Sapphire', source: 'Vendor', troveName: 'Sapphire', parentKey: ring1.key });
const aug2 = entry({ key: 'a|Ring2|Blue#0|Sapphire', kind: 'augment', slot: 'Ring2', identity: 'augment|Sapphire',
  label: 'Sapphire', source: 'Vendor', troveName: 'Sapphire', parentKey: ring2.key });
const sword = entry({ key: 'g|Weapon|Sword', slot: 'Weapon', identity: 'gear|Sword', label: 'Sword', source: 'The Raid',
  raid: true, pack: 'Raid Pack' });
const swordStep = entry({ key: 's|Weapon|Sword|Lost Purpose#0|Set', kind: 'step', slot: 'Weapon',
  identity: 'step|Lost Purpose|Set|Sword', label: 'Set', source: 'The Raid', sourceInherited: true, parentKey: sword.key });
const mystery = entry({ key: 'a|Weapon|Colorless#0|Diamond', kind: 'augment', slot: 'Weapon', identity: 'augment|Diamond',
  label: 'Diamond', source: null, parentKey: sword.key });

const entries = [sword, swordStep, mystery, ring1, aug1, ring2, aug2];

function rows(view: ReturnType<typeof buildShoppingListView>): Array<[string, string, number, string]> {
  const out: Array<[string, string, number, string]> = [];
  const walk = (group: string, list: ShoppingRow[], depth: string) => {
    for (const row of list) {
      out.push([group, depth + row.entry.label, row.quantity, row.state]);
      walk(group, row.children, depth + '  ');
    }
  };
  for (const group of view.groups) {
    walk(group.label, group.rows, '');
  }
  return out;
}

describe('shopping list view model', () => {
  describe('trove coverage', () => {
    it('covers entries for the same thing in list order, one per copy held', () => {
      expect([...troveCoveredKeys(entries, trove({ Sapphire: 1, Ring: 2 }))])
        .toEqual([ring1.key, aug1.key, ring2.key]);
      expect(troveCoveredKeys(entries, null).size).toBe(0);
    });

    it('counts a location without a quantity as one copy', () => {
      const lookup: ShoppingTroveLookup = { locationsFor: () => [{ character: 'A', location: 'Bank', tab: '' }] };
      expect([...troveCoveredKeys([aug1, aug2], lookup)]).toEqual([aug1.key]);
    });
  });

  it('lets explicit ticks override the trove', () => {
    const progress: ShoppingProgress = { [ring1.key]: 0, [sword.key]: 1 };
    expect(stillNeededKeys(entries, progress, trove({ Ring: 2 })))
      .toEqual([swordStep.key, mystery.key, ring1.key, aug1.key, aug2.key]);
  });

  describe('by slot', () => {
    it('lists each slot\'s item with its crafting beneath, and counts entries', () => {
      const view = buildShoppingListView(entries, { [swordStep.key]: 1 }, trove({ Sapphire: 1 }),
        { groupMode: 'slot', filter: 'all' });

      expect(rows(view)).toEqual([
        ['Weapon', 'Sword', 1, 'unchecked'],
        ['Weapon', '  Set', 1, 'checked'],
        ['Weapon', '  Diamond', 1, 'unchecked'],
        ['Ring 1', 'Ring', 1, 'unchecked'],
        ['Ring 1', '  Sapphire', 1, 'checked'],
        ['Ring 2', 'Ring', 1, 'unchecked'],
        ['Ring 2', '  Sapphire', 1, 'unchecked'],
      ]);
      expect(view.groups.map(group => [group.slot, group.acquired, group.total]))
        .toEqual([['Weapon', 1, 3], ['Ring1', 1, 2], ['Ring2', 0, 2]]);
      expect([view.acquired, view.total]).toEqual([2, 7]);
    });

    it('tells how many of the same thing the build needs, and where the trove has it', () => {
      const view = buildShoppingListView(entries, {}, trove({ Ring: 1 }), { groupMode: 'slot', filter: 'all' });
      const ringRow = view.groups[1].rows[0];

      expect(ringRow.quantityInBuild).toBe(2);
      expect(ringRow.ownedLocations).toEqual([expect.objectContaining({ character: 'Khalarim' })]);
      expect(view.groups[0].rows[0].ownedLocations).toBeNull();
    });
  });

  describe('by source', () => {
    it('groups by source, sorted by pack then name with unknown last, folding the same thing together', () => {
      const view = buildShoppingListView(entries, {}, trove({ Sapphire: 1 }), { groupMode: 'source', filter: 'all' });

      expect(view.groups.map(group => [group.label, group.sublabel, group.raid]))
        .toEqual([['The Raid', 'Raid Pack', true], ['The Snitch', 'Sharn', false], ['Vendor', null, false],
          [UNKNOWN_SOURCE_LABEL, null, false]]);
      expect(rows(view)).toEqual([
        ['The Raid', 'Sword', 1, 'unchecked'],
        ['The Raid', '  Set', 1, 'unchecked'],
        ['The Snitch', 'Ring', 2, 'unchecked'],
        ['Vendor', 'Sapphire', 2, 'mixed'],
        [UNKNOWN_SOURCE_LABEL, 'Diamond', 1, 'unchecked'],
      ]);
    });

    it('says what a separately sourced piece is for', () => {
      const view = buildShoppingListView(entries, {}, null, { groupMode: 'source', filter: 'all' });
      const context = (label: string) => view.groups.flatMap(group => group.rows).find(row => row.entry.label === label)?.context;

      expect(context('Diamond')).toBe('for Sword (Weapon)');
      expect(context('Sapphire')).toBe('for 2 items');
      expect(context('Ring')).toBeNull();
    });
  });

  it('hides what has been got when showing only what is still needed, keeping an item with needed crafting', () => {
    const progress: ShoppingProgress = { [sword.key]: 1, [ring1.key]: 1, [aug1.key]: 1, [ring2.key]: 1, [aug2.key]: 1 };
    const view = buildShoppingListView(entries, progress, null, { groupMode: 'slot', filter: 'needed' });

    expect(rows(view)).toEqual([
      ['Weapon', 'Sword', 1, 'checked'],
      ['Weapon', '  Set', 1, 'unchecked'],
      ['Weapon', '  Diamond', 1, 'unchecked'],
    ]);
    expect([view.acquired, view.total]).toEqual([5, 7]);
  });

  describe('togglePatch', () => {
    const toggle = (label: string, progress: ShoppingProgress, holdings: Record<string, number> = {}) => {
      const view = buildShoppingListView(entries, progress, trove(holdings), { groupMode: 'source', filter: 'all' });
      const row = view.groups.flatMap(group => group.rows).find(candidate => candidate.entry.label === label)!;
      return togglePatch(row, entries, progress, trove(holdings));
    };

    it('stores a tick only where the trove doesn\'t already say so', () => {
      expect(toggle('Sword', {})).toEqual({ [sword.key]: 1 });
      expect(toggle('Sword', { [sword.key]: 1 })).toEqual({ [sword.key]: null });
    });

    it('stores an untick over the trove, and forgets it when ticked again', () => {
      expect(toggle('Ring', {}, { Ring: 2 })).toEqual({ [ring1.key]: 0, [ring2.key]: 0 });
      expect(toggle('Ring', { [ring1.key]: 0, [ring2.key]: 0 }, { Ring: 2 }))
        .toEqual({ [ring1.key]: null, [ring2.key]: null });
    });

    it('ticks every entry of a part-done row, touching only what changes', () => {
      expect(toggle('Sapphire', {}, { Sapphire: 1 })).toEqual({ [aug2.key]: 1 });
    });
  });

  it('prunes progress for entries no longer in the build', () => {
    const progress: ShoppingProgress = { [sword.key]: 1, 'g|Helm|Gone': 1 };
    const patch = prunePatch(progress, entries);

    expect(patch).toEqual({ 'g|Helm|Gone': null });
    expect(applyProgressPatch(progress, patch)).toEqual({ [sword.key]: 1 });
    expect(applyProgressPatch(progress, { [ring1.key]: 0 })).toEqual({ [sword.key]: 1, 'g|Helm|Gone': 1, [ring1.key]: 0 });
  });
});
