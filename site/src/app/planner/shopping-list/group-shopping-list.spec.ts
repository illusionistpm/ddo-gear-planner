import {
  buildGroupListView, chipPatch, groupEntryKey, GroupMemberEntries, groupProgress, memberEntries, neededAfter, ownRowPatch, ownRowState,
  patchesByBuild, splitGroupEntryKey
} from './group-shopping-list';
import type { ShoppingEntry, ShoppingListView, ShoppingRow, ShoppingSource } from './shopping-list-types';

function from(quest: string, pack: string | null = null): ShoppingSource {
  return { quest, pack, raid: false, wikiUrl: `wiki/${quest}` };
}

function entry(init: Partial<ShoppingEntry> & { key: string }): ShoppingEntry {
  return {
    kind: 'gear', identity: init.key, label: init.key, system: null, ml: 1,
    sources: [from('The Snitch', 'Sharn')], sourceInherited: false, rare: false, artifact: false,
    wikiUrl: null, troveName: null, parentKey: null, details: [],
    ...init,
  };
}

// Kira needs two of the same ring; Thane one; Vex a ring and a cloak from elsewhere.
const ring = (slot: string) => entry({ key: `g|${slot}|Ring`, identity: 'gear|Ring', label: 'Ring' });
const cloak = entry({ key: 'g|Back|Cloak', identity: 'gear|Cloak', label: 'Cloak', sources: [from('The Snitch', 'Sharn'), from('Elsewhere', 'Other')] });

function member(buildId: string, characterName: string, entries: readonly ShoppingEntry[], needed: string[] | null = null): GroupMemberEntries {
  return { buildId, characterName, entries, needed };
}

const kira = member('b-kira', 'Kira', [ring('Ring1'), ring('Ring2')]);
const thane = member('b-thane', 'Thane', [ring('Ring1')]);
const vex = member('b-vex', 'Vex', [ring('Ring1'), cloak]);

function rowsOf(view: ShoppingListView): ShoppingRow[] {
  return view.sections.flatMap(section => section.groups.flatMap(group => group.rows));
}

function rowFor(view: ShoppingListView, label: string): ShoppingRow {
  const row = rowsOf(view).find(candidate => candidate.entry.label === label);
  if (!row) {
    throw new Error(`No row for ${label}`);
  }
  return row;
}

describe('group shopping list', () => {
  it('keys each build\'s entries by the build, keeping what they are, so the same thing is one row', () => {
    const [first] = memberEntries(kira);

    expect(first).toEqual(expect.objectContaining({ key: 'b-kira|g|Ring1|Ring', identity: 'gear|Ring', member: 'b-kira' }));
    expect(splitGroupEntryKey(first.key)).toEqual({ buildId: 'b-kira', key: 'g|Ring1|Ring' });
    expect(groupEntryKey('b', 'k')).toBe('b|k');
  });

  it('keys a crafting entry\'s item by the build too, so it still nests under it', () => {
    const step = entry({ key: 's|Ring1|Ring|Set', kind: 'step', identity: 'step|Set', parentKey: 'g|Ring1|Ring', sourceInherited: true });

    const [, nested] = memberEntries(member('b-kira', 'Kira', [ring('Ring1'), step]));

    expect(nested.parentKey).toBe('b-kira|g|Ring1|Ring');
  });

  it('folds a thing needed by several characters into one row, saying whose each copy is', () => {
    const view = buildGroupListView([kira, thane, vex], { filter: 'all', picks: {}, order: null });

    const row = rowFor(view, 'Ring');
    expect(row.quantity).toBe(4);
    expect(row.members.map(part => [part.member, part.quantity, part.acquired])).toEqual([
      ['b-kira', 2, 0], ['b-thane', 1, 0], ['b-vex', 1, 0]
    ]);
    expect(view.total).toBe(5);
  });

  it('counts as got what each build\'s owner no longer lists as needed, and everything as needed for one who never shared', () => {
    const shared = member('b-kira', 'Kira', [ring('Ring1'), ring('Ring2')], ['g|Ring2|Ring']);

    expect(groupProgress([shared, thane])).toEqual({ 'b-kira|g|Ring1|Ring': 1 });
    const row = rowFor(buildGroupListView([shared, thane], { filter: 'all', picks: {}, order: null }), 'Ring');
    expect(row.members.map(part => part.acquired)).toEqual([1, 0]);
    expect(row.state).toBe('mixed');
  });

  it('lays this page\'s pending ticks over what the members shared', () => {
    const view = buildGroupListView([thane], { filter: 'all', picks: {}, order: null, pending: { 'b-thane|g|Ring1|Ring': 1 } });

    expect(rowFor(view, 'Ring').state).toBe('checked');
  });

  it('routes the same for every viewer, whatever is ticked: ticks never move a thing', () => {
    const before = buildGroupListView([kira, vex], { filter: 'all', picks: {}, order: null });
    const ticked = member('b-vex', 'Vex', vex.entries, ['g|Ring1|Ring']);
    const after = buildGroupListView([kira, ticked], { filter: 'all', picks: {}, order: null });

    const quests = (view: ShoppingListView) => view.sections.flatMap(section => section.groups.map(group => group.label));
    expect(quests(after)).toEqual(quests(before));
  });

  it('follows the host\'s picks', () => {
    const view = buildGroupListView([vex], { filter: 'all', picks: { 'gear|Cloak': ['Elsewhere'] }, order: null });

    const cloakQuest = view.sections.flatMap(section => section.groups).find(group => group.rows.some(row => row.entry.label === 'Cloak'));
    expect(cloakQuest?.label).toBe('Elsewhere');
  });

  it('shows only some builds\' rows when asked, routed exactly as the whole group\'s', () => {
    // Alone, Vex's cloak would go wherever; with the group it goes where everyone's ring is.
    const whole = buildGroupListView([kira, vex], { filter: 'all', picks: {}, order: null });
    const mine = buildGroupListView([kira, vex], { filter: 'all', picks: {}, order: null, only: new Set(['b-vex']) });

    const where = (view: ShoppingListView, label: string) =>
      view.sections.flatMap(section => section.groups).filter(group => group.rows.some(row => row.entry.label === label)).map(group => group.label);
    expect(where(mine, 'Cloak')).toEqual(where(whole, 'Cloak'));
    expect(rowFor(mine, 'Ring').members.map(part => part.member)).toEqual(['b-vex']);
    expect(mine.total).toBe(2);
  });

  describe('ticking', () => {
    const view = buildGroupListView([kira, thane], { filter: 'all', picks: {}, order: null });
    const row = rowFor(view, 'Ring');

    it('ticks a character\'s copies one per tap, then all off', () => {
      expect(chipPatch(row, 'b-kira', {})).toEqual({ 'b-kira|g|Ring1|Ring': 1 });
      expect(chipPatch(row, 'b-kira', { 'b-kira|g|Ring1|Ring': 1 })).toEqual({ 'b-kira|g|Ring2|Ring': 1 });
      expect(chipPatch(row, 'b-kira', { 'b-kira|g|Ring1|Ring': 1, 'b-kira|g|Ring2|Ring': 1 }))
        .toEqual({ 'b-kira|g|Ring1|Ring': 0, 'b-kira|g|Ring2|Ring': 0 });
      expect(chipPatch(row, 'b-thane', {})).toEqual({ 'b-thane|g|Ring1|Ring': 1 });
      expect(chipPatch(row, 'b-nobody', {})).toEqual({});
    });

    it('ticks all of your characters\' copies from the row\'s box, and reads it for yours only', () => {
      const yours = new Set(['b-kira', 'b-thane']);

      expect(ownRowPatch(row, yours, { 'b-kira|g|Ring1|Ring': 1 })).toEqual({
        'b-kira|g|Ring1|Ring': 1, 'b-kira|g|Ring2|Ring': 1, 'b-thane|g|Ring1|Ring': 1
      });
      expect(ownRowPatch(row, new Set(['b-thane']), { 'b-thane|g|Ring1|Ring': 1 })).toEqual({ 'b-thane|g|Ring1|Ring': 0 });
      expect(ownRowState(row, new Set(['b-thane']))).toBe('unchecked');
      expect(ownRowState(row, new Set(['b-other']))).toBeNull();
    });

    it('splits a patch into each build\'s own keys', () => {
      expect(patchesByBuild({ 'b-kira|g|Ring1|Ring': 1, 'b-thane|g|Ring1|Ring': 0, 'nobar': 1 })).toEqual(new Map([
        ['b-kira', { 'g|Ring1|Ring': 1 }], ['b-thane', { 'g|Ring1|Ring': 0 }]
      ]));
    });

    it('works out a build\'s still-needed list from what was shared, so the trove\'s ticks on another device stay', () => {
      const entries = [ring('Ring1'), ring('Ring2'), cloak];

      // Ring2 was covered by the owner's trove, so it was never listed as needed.
      expect(neededAfter(entries, ['g|Ring1|Ring', 'g|Back|Cloak'], { 'g|Ring1|Ring': 1 })).toEqual(['g|Back|Cloak']);
      expect(neededAfter(entries, ['g|Back|Cloak'], { 'g|Ring1|Ring': 0 })).toEqual(['g|Ring1|Ring', 'g|Back|Cloak']);
      expect(neededAfter(entries, null, { 'g|Back|Cloak': 1 })).toEqual(['g|Ring1|Ring', 'g|Ring2|Ring']);
    });
  });
});
