import type { UserItemLocation } from '../user-gear.service';
import type { ShoppingEntry, ShoppingProgress, ShoppingRow, ShoppingSource, ShoppingTroveLookup } from './shopping-list-types';
import {
  applyProgressPatch, buildShoppingListView, OTHER_SOURCES_LABEL, PACK_ACCENT_COUNT, prunePatch, stillNeededKeys, togglePatch,
  troveCoveredKeys, UNKNOWN_SOURCE_LABEL
} from './shopping-list-view-model';

function from(quest: string, pack: string | null = null, raid = false): ShoppingSource {
  return { quest, pack, raid, wikiUrl: `wiki/${quest}` };
}

function entry(init: Partial<ShoppingEntry> & { key: string }): ShoppingEntry {
  return {
    kind: 'gear', slot: 'Ring1', identity: init.key, label: init.key, system: null, itemName: init.key, ml: 1,
    sources: [from('The Snitch')], sourceInherited: false, raid: false, rare: false, artifact: false,
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
  sources: [from('The Snitch', 'Sharn')] });
const ring2 = entry({ key: 'g|Ring2|Ring', slot: 'Ring2', identity: 'gear|Ring', label: 'Ring', troveName: 'Ring',
  sources: [from('The Snitch', 'Sharn')] });
const aug1 = entry({ key: 'a|Ring1|Blue#0|Sapphire', kind: 'augment', slot: 'Ring1', identity: 'augment|Sapphire',
  label: 'Sapphire', sources: [from('Vendor')], troveName: 'Sapphire', parentKey: ring1.key });
const aug2 = entry({ key: 'a|Ring2|Blue#0|Sapphire', kind: 'augment', slot: 'Ring2', identity: 'augment|Sapphire',
  label: 'Sapphire', sources: [from('Vendor')], troveName: 'Sapphire', parentKey: ring2.key });
const sword = entry({ key: 'g|Weapon|Sword', slot: 'Weapon', identity: 'gear|Sword', label: 'Sword',
  sources: [from('The Raid', 'Raid Pack', true)], raid: true });
const swordStep = entry({ key: 's|Weapon|Sword|Lost Purpose#0|Set', kind: 'step', slot: 'Weapon',
  identity: 'step|Lost Purpose|Set|Sword', label: 'Set', sources: sword.sources, sourceInherited: true, parentKey: sword.key });
const mystery = entry({ key: 'a|Weapon|Colorless#0|Diamond', kind: 'augment', slot: 'Weapon', identity: 'augment|Diamond',
  label: 'Diamond', sources: [], parentKey: sword.key });

const entries = [sword, swordStep, mystery, ring1, aug1, ring2, aug2];

function groupsOf(view: ReturnType<typeof buildShoppingListView>) {
  return view.sections.flatMap(section => section.groups);
}

function rows(view: ReturnType<typeof buildShoppingListView>): Array<[string, string, number, string]> {
  const out: Array<[string, string, number, string]> = [];
  const walk = (group: string, list: ShoppingRow[], depth: string) => {
    for (const row of list) {
      out.push([group, depth + row.entry.label, row.quantity, row.state]);
      walk(group, row.children, depth + '  ');
    }
  };
  for (const group of groupsOf(view)) {
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

  describe('by source', () => {
    it('groups by source under each pack, packs then quests by name, the rest last, folding the same thing together', () => {
      const view = buildShoppingListView(entries, {}, trove({ Sapphire: 1 }), { filter: 'all' });

      expect(view.sections.map(section => [section.label, section.groups.map(group => [group.label, group.raid])]))
        .toEqual([
          ['Raid Pack', [['The Raid', true]]],
          ['Sharn', [['The Snitch', false]]],
          [OTHER_SOURCES_LABEL, [['Vendor', false], [UNKNOWN_SOURCE_LABEL, false]]],
        ]);
      expect(view.sections.map(section => [section.acquired, section.total])).toEqual([[0, 2], [0, 2], [1, 3]]);
      expect(rows(view)).toEqual([
        ['The Raid', 'Sword', 1, 'unchecked'],
        ['The Raid', '  Set', 1, 'unchecked'],
        ['The Snitch', 'Ring', 2, 'unchecked'],
        ['Vendor', 'Sapphire', 2, 'mixed'],
        [UNKNOWN_SOURCE_LABEL, 'Diamond', 1, 'unchecked'],
      ]);
      expect(groupsOf(view).map(group => [group.label, group.acquired, group.total]))
        .toEqual([['The Raid', 0, 2], ['The Snitch', 0, 2], ['Vendor', 1, 2], [UNKNOWN_SOURCE_LABEL, 0, 1]]);
      expect([view.acquired, view.total]).toEqual([1, 7]);
    });

    it('tells how many of the same thing the build needs, and where the trove has it', () => {
      const view = buildShoppingListView(entries, {}, trove({ Ring: 1 }), { filter: 'all' });
      const rowOf = (label: string) => groupsOf(view).flatMap(group => group.rows).find(row => row.entry.label === label)!;

      expect(rowOf('Ring').quantity).toBe(2);
      expect(rowOf('Ring').ownedLocations).toEqual([expect.objectContaining({ character: 'Khalarim' })]);
      expect(rowOf('Sword').ownedLocations).toBeNull();
    });

    it('lists something from several quests under the one the route picks, saying where else it comes from', () => {
      const anywhere = entry({ ...aug1, sources: [from('Vendor'), from('The Raid', 'Raid Pack', true)] });
      const view = buildShoppingListView([sword, swordStep, anywhere, ring1], {}, null, { filter: 'all' });
      const rowsOf = (label: string) => groupsOf(view).find(group => group.label === label)!.rows;

      const alsoFrom = (row: ShoppingRow) => row.alsoFrom.map(source => source.quest);
      // A quest in a pack before one in none.
      expect(rowsOf('The Raid').map(row => [row.entry.label, alsoFrom(row)])).toEqual([['Sword', []], ['Sapphire', ['Vendor']]]);
      expect(groupsOf(view).map(group => group.label)).toEqual(['The Raid', 'The Snitch']);
      expect(view.sections.map(section => [section.label, section.total])).toEqual([['Raid Pack', 3], ['Sharn', 1]]);
    });

    it('lists something under each quest the user picked for it, counting it once', () => {
      const anywhere = entry({ ...aug1, sources: [from('Vendor'), from('The Raid', 'Raid Pack', true)] });
      const view = buildShoppingListView([sword, anywhere], {}, null,
        { filter: 'all', picks: { [anywhere.identity]: ['Vendor', 'The Raid'] } });

      expect(rows(view)).toEqual([['The Raid', 'Sword', 1, 'unchecked'], ['The Raid', 'Sapphire', 1, 'unchecked'],
        ['Vendor', 'Sapphire', 1, 'unchecked']]);
      expect(view.sections.map(section => [section.label, section.total])).toEqual([['Raid Pack', 2], [OTHER_SOURCES_LABEL, 1]]);
      expect(view.total).toBe(2);
      expect(view.picked).toBe(true);
    });

    it('says whether the user picked where to get anything still in the list, whatever the filter shows', () => {
      const anywhere = entry({ ...aug1, sources: [from('Vendor'), from('The Raid', 'Raid Pack', true)] });
      const picked = (picks: Record<string, string[]>, progress = {}) =>
        buildShoppingListView([sword, anywhere], progress, null, { filter: 'needed', picks }).picked;

      expect(picked({})).toBe(false);
      // Left over from gear no longer in the build.
      expect(picked({ 'augment|Gone': ['Vendor'] })).toBe(false);
      expect(picked({ [anywhere.identity]: ['Vendor'] }, { [anywhere.key]: 1 })).toBe(true);
    });

    it('keeps something picked from several quests under each once it is got, so it stays where it was ticked', () => {
      const anywhere = entry({ ...aug1, sources: [from('Vendor'), from('The Raid', 'Raid Pack', true)] });
      const view = buildShoppingListView([anywhere], { [anywhere.key]: 1 }, null,
        { filter: 'all', picks: { [anywhere.identity]: ['Vendor', 'The Raid'] } });

      expect(rows(view)).toEqual([['The Raid', 'Sapphire', 1, 'checked'], ['Vendor', 'Sapphire', 1, 'checked']]);
      expect(view.acquired).toBe(1);
    });

    it('offers every source of something from several, in heading order, with what else the list gets there', () => {
      const anywhere = entry({ ...aug1, sources: [from('Vendor'), from('The Snitch', 'Sharn'), from('The Raid', 'Raid Pack', true)] });
      const choicesOf = (view: ReturnType<typeof buildShoppingListView>) => groupsOf(view).flatMap(group => group.rows)
        .find(row => row.entry.label === 'Sapphire')!;
      const routed = choicesOf(buildShoppingListView([sword, anywhere, ring1], {}, null,
        { filter: 'all', hiddenPacks: new Set(['Sharn']) }));

      expect(routed.choices.map(({ source, chosen, hidden, alsoThere }) => [source.quest, chosen, hidden, alsoThere])).toEqual([
        ['The Raid', true, false, 1], ['The Snitch', false, true, 1], ['Vendor', false, false, 0],
      ]);
      expect(routed.picked).toBe(false);

      const picked = choicesOf(buildShoppingListView([sword, anywhere, ring1], {}, null,
        { filter: 'all', picks: { [anywhere.identity]: ['Vendor'] } }));
      expect(picked.choices.filter(choice => choice.chosen).map(choice => choice.source.quest)).toEqual(['Vendor']);
      expect(picked.picked).toBe(true);
      // Something from one place, or crafting listed with its item, has no choice to offer.
      expect(groupsOf(buildShoppingListView(entries, {}, null, { filter: 'all' }))
        .flatMap(group => group.rows.flatMap(row => [row, ...row.children])).every(row => !row.choices.length)).toBe(true);
    });

    it('sends things away from packs the pack filter hides', () => {
      const anywhere = entry({ ...aug1, sources: [from('The Raid', 'Raid Pack', true), from('The Snitch', 'Sharn')] });
      const view = buildShoppingListView([anywhere], {}, null, { filter: 'all', hiddenPacks: new Set(['Raid Pack']) });

      expect(groupsOf(view).map(group => group.label)).toEqual(['The Snitch']);
    });
  });

  it('gives each pack listed a colour, in heading order, and none to what has no pack', () => {
    const view = buildShoppingListView(entries, {}, null, { filter: 'all' });

    expect(view.sections.map(section => [section.label, section.accent, section.groups.map(group => group.accent)]))
      .toEqual([['Raid Pack', 0, [0]], ['Sharn', 1, [1]], [OTHER_SOURCES_LABEL, null, [null, null]]]);
  });

  it('lists the packs, then events, then the quests in no pack, then the store last', () => {
    const fromEach = [
      from('Anniversary Party', 'Events'), from('DDO Store', 'DDO Store'), from('Vendor'),
      from('The Snitch', 'Sharn'), from('The Raid', 'Raid Pack', true),
    ].map((source, index) => entry({ key: `g|Ring1|${index}`, sources: [source] }));
    const view = buildShoppingListView(fromEach, {}, null, { filter: 'all' });

    expect(view.sections.map(section => [section.label, section.accent])).toEqual([
      ['Raid Pack', 0], ['Sharn', 1], ['Events', 2], [OTHER_SOURCES_LABEL, null], ['DDO Store', 3],
    ]);
  });

  it('reuses pack colours once there are more packs than colours', () => {
    const many = Array.from({ length: PACK_ACCENT_COUNT + 1 }, (_, index) =>
      entry({ key: `g|Ring1|${index}`, sources: [from(`Quest ${index}`, `Pack ${String.fromCharCode(65 + index)}`)] }));
    const view = buildShoppingListView(many, {}, null, { filter: 'all' });

    expect(view.sections.map(section => section.accent)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0]);
  });

  it('hides what has been got when showing only what is still needed, keeping an item with needed crafting', () => {
    const progress: ShoppingProgress = { [sword.key]: 1, [ring1.key]: 1, [aug1.key]: 1, [ring2.key]: 1, [aug2.key]: 1 };
    const view = buildShoppingListView(entries, progress, null, { filter: 'needed' });

    expect(rows(view)).toEqual([
      ['The Raid', 'Sword', 1, 'checked'],
      ['The Raid', '  Set', 1, 'unchecked'],
      [UNKNOWN_SOURCE_LABEL, 'Diamond', 1, 'unchecked'],
    ]);
    expect([view.acquired, view.total]).toEqual([5, 7]);
  });

  describe('togglePatch', () => {
    const toggle = (label: string, progress: ShoppingProgress, holdings: Record<string, number> = {}) => {
      const view = buildShoppingListView(entries, progress, trove(holdings), { filter: 'all' });
      const row = groupsOf(view).flatMap(group => group.rows).find(candidate => candidate.entry.label === label)!;
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
