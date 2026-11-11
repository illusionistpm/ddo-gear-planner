import { TestBed } from '@angular/core/testing';

import { FILIGREE_SOURCE_SLOTS, FiligreeLoadoutService } from './filigree-loadout.service';
import { Item } from '../gear/item';
import { MAX_FILIGREE_SLOTS_AFFIX } from '../affixes/filigree-affix';

const DEX = 'Celerity: Dexterity'; // Dexterity +1; rare adds +2 Physical Sheltering.
const REFLEX = 'Celerity: Reflex'; // Reflex Save +2.

function weapon() {
  return new Item({ name: 'Test Longsword', slot: 'Weapon', type: 'Longswords', ml: 30, affixes: [], crafting: [], quests: [] });
}

function artifact(slots: number) {
  return new Item({
    name: 'Test Artifact', slot: 'Trinket', type: 'Trinkets', ml: 30, crafting: [], quests: [], artifact: true,
    affixes: [{ name: MAX_FILIGREE_SLOTS_AFFIX, type: 'Untyped', value: slots }],
  });
}

/** The service on its own, given slots directly rather than through EquippedService. */
describe('FiligreeLoadoutService', () => {
  let service: FiligreeLoadoutService;
  let slots: Map<string, Item | null>;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FiligreeLoadoutService);
    slots = new Map();
    service.connectSlots(() => slots);
  });

  it('finds the hosts in the slots it is given: the main hand, and whichever slot holds the artifact', () => {
    expect(service.getHost('weapon')).toBeNull();
    expect(service.getCapacity('weapon')).toBe(0);

    slots.set('Weapon', weapon());
    slots.set('Trinket', artifact(3));
    expect(service.getHost('weapon')?.slot).toBe('Weapon');
    expect(service.getHost('artifact')?.slot).toBe('Trinket');
    expect(service.getCapacity('weapon')).toBe(10);
    expect(service.getCapacity('artifact')).toBe(3);
  });

  it('says why a filigree can\'t be added, in each host\'s own words', () => {
    expect(service.getAppendBlocker('weapon', DEX)).toBe('Equip a main-hand weapon first');
    expect(service.getAppendBlocker('artifact', DEX)).toBe('Equip a minor artifact first');

    slots.set('Weapon', weapon());
    slots.set('Trinket', artifact(1));
    expect(service.getAppendTitle('weapon', DEX)).toBe('Add it after the filigrees already in the weapon');
    expect(service.append('weapon', { name: DEX, rare: false })).toBe(true);
    expect(service.getAppendBlocker('weapon', DEX)).toBe('Already in the weapon');
    expect(service.getAppendTitle('weapon', DEX)).toBe('Already in the weapon');

    expect(service.append('artifact', { name: REFLEX, rare: false })).toBe(true);
    expect(service.getAppendBlocker('artifact', DEX)).toBe('No room left');
    expect(service.append('artifact', { name: DEX, rare: false })).toBe(false);
  });

  it('signals edits for the player\'s changes but not for a restored loadout', () => {
    slots.set('Weapon', weapon());
    let edits = 0;
    let emitted = 0;
    service.edits().subscribe(() => edits++);
    service.getLoadoutObservable().subscribe(() => emitted++);

    service.restore(JSON.stringify({ w: [[DEX]] }));
    expect(service.getLoadout().weapon).toEqual([{ name: DEX, rare: false }]);
    expect(service.serialize()).toBe('{"w":[["Celerity: Dexterity"]]}');
    expect(edits).toBe(0);

    service.set('weapon', 0, { name: DEX, rare: true });
    expect(edits).toBe(1);
    expect(emitted).toBe(3);
  });

  it('reports each contribution with its host, and a set bonus with none', () => {
    slots.set('Weapon', weapon());
    service.set('weapon', 0, { name: DEX, rare: true });
    service.set('weapon', 1, { name: REFLEX, rare: false });
    service.refreshContributions();

    expect(service.getContributionsFor('Dexterity').map(entry => [entry.host, entry.slot, entry.itemName]))
      .toEqual([['weapon', FILIGREE_SOURCE_SLOTS.weapon, DEX + ' (Rare)']]);
    // Two Celerity pieces: its 2-piece tier gives Doublestrike.
    expect(service.getContributionsFor('Doublestrike').map(entry => [entry.host, entry.slot, entry.itemName, entry.affix.value]))
      .toEqual([[null, FILIGREE_SOURCE_SLOTS.set, 'Celerity', 2]]);
    expect(service.getSetPieces().get('Celerity')).toBe(2);
  });
});
