import { TestBed } from '@angular/core/testing';

import { EquippedService, FILIGREE_SOURCE_SLOTS } from './equipped.service';
import { FiltersService } from './filters.service';
import { GearDbService } from '../gear/gear-db.service';
import { Item } from '../gear/item';
import { FILIGREE_BONUS_TYPE, FILIGREE_SET_BONUS_TYPE } from '../gear/filigree';
import { MAX_FILIGREE_SLOTS_AFFIX } from '../affixes/filigree-affix';
import { QueryParamRecord } from '../build/query-param-types';

function weapon(name = 'Test Longsword') {
  return new Item({ name, slot: 'Weapon', type: 'Longswords', ml: 30, affixes: [], crafting: [], quests: [] });
}

function artifact(slots: number, name = 'Test Artifact', slot = 'Trinket') {
  return new Item({
    name, slot, type: 'Trinkets', ml: 30, crafting: [], quests: [], artifact: true,
    affixes: [{ name: MAX_FILIGREE_SLOTS_AFFIX, type: 'Untyped', value: slots }],
  });
}

const DEX = 'Celerity: Dexterity'; // Dexterity +1; rare adds +2 Physical Sheltering.
const REFLEX = 'Celerity: Reflex'; // Reflex Save +2.
const FURY = [
  'Ultimate Fury: Attack and Damage', 'Ultimate Fury: Constitution', 'Ultimate Fury: Fortitude Saves',
  'Ultimate Fury: Physical Resistance Rating', 'Ultimate Fury: Rage', 'Ultimate Fury: Strength',
];

describe('EquippedService filigree', () => {
  let service: EquippedService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EquippedService);
  });

  const value = (affix: string, type = FILIGREE_BONUS_TYPE) => service.getCurrentValueForAffixType(affix, type);
  const lastParams = () => {
    let params: QueryParamRecord | null = null;
    (service as unknown as { params: { subscribe(fn: (p: QueryParamRecord | null) => void): { unsubscribe(): void } } })
      .params.subscribe(p => (params = p)).unsubscribe();
    return params as QueryParamRecord | null;
  };

  const restore = (filigree: object, slots: Record<string, string> = {}) => service.updateFromParams({
    keys: [...Object.keys(slots), 'filigree'],
    get: (key: string) => key === 'filigree' ? JSON.stringify(filigree) : slots[key] ?? null,
    getAll: () => [],
  });

  it('keeps filigree no weapon holds, counting none of it, until a weapon is equipped', () => {
    restore({ w: [[DEX]] });

    expect(service.getShownFiligree('weapon')).toEqual([]);
    expect(value('Dexterity')).toBe(0);
    expect(service.getFiligreeLoadout().weapon).toEqual([{ name: DEX, rare: false }]);

    service.set(weapon());
    expect(value('Dexterity')).toBe(1);
  });

  it('adds a filigree only in the slot after the last one, and only while the host has room', () => {
    service.set(artifact(2));
    service.setFiligree('artifact', 1, { name: DEX, rare: false });
    expect(service.getFiligreeLoadout().artifact).toEqual([]);

    service.setFiligree('artifact', 0, { name: DEX, rare: false });
    service.setFiligree('artifact', 1, { name: REFLEX, rare: false });
    expect(service.getNextFiligreeSlot('artifact')).toBeNull();
    service.setFiligree('artifact', 2, { name: DEX, rare: true });
    expect(service.getFiligreeLoadout().artifact.map(choice => choice.name)).toEqual([DEX, REFLEX]);
  });

  it('slides the rest up when one is removed from the middle', () => {
    service.set(weapon());
    [DEX, REFLEX, FURY[0]].forEach((name, index) => service.setFiligree('weapon', index, { name, rare: false }));

    service.setFiligree('weapon', 1, null);

    expect(service.getFiligreeLoadout().weapon.map(choice => choice.name)).toEqual([DEX, FURY[0]]);
    expect(service.getNextFiligreeSlot('weapon')).toBe(2);
  });

  it('adds up filigree bonuses of one type instead of taking the best', () => {
    service.set(weapon());
    service.set(artifact(3));
    service.setFiligree('weapon', 0, { name: DEX, rare: true });
    service.setFiligree('artifact', 0, { name: DEX, rare: false });

    expect(value('Dexterity')).toBe(2);
    expect(value('Physical Sheltering')).toBe(2);
    expect(service.getSourcesForAffixType('Dexterity', FILIGREE_BONUS_TYPE).map(source => [source.slot, source.itemName, source.value]))
      .toEqual([
        [FILIGREE_SOURCE_SLOTS.weapon, DEX + ' (Rare)', 1],
        [FILIGREE_SOURCE_SLOTS.artifact, DEX, 1],
      ]);
  });

  it('gives a duplicate in the same host its set piece but not its bonuses', () => {
    service.set(weapon());
    service.setFiligree('weapon', 0, { name: DEX, rare: false });
    service.setFiligree('weapon', 1, { name: DEX, rare: false });

    expect(value('Dexterity')).toBe(1);
    expect(service.getFiligreeSetPieces().get('Celerity')).toBe(2);
    // Celerity's 2-piece bonus: +2 Doublestrike.
    expect(value('Doublestrike', FILIGREE_SET_BONUS_TYPE)).toBe(2);
  });

  it('counts set pieces across weapon and artifact, and adds each tier', () => {
    service.set(weapon());
    service.set(artifact(5));
    FURY.slice(0, 4).forEach((name, index) => service.setFiligree('weapon', index, { name, rare: false }));
    FURY.slice(4).forEach((name, index) => service.setFiligree('artifact', index, { name, rare: false }));

    // +1 Strength at each of 2..6 pieces.
    expect(service.getFiligreeSetPieces().get('Ultimate Fury')).toBe(6);
    expect(value('Strength', FILIGREE_SET_BONUS_TYPE)).toBe(5);
  });

  it('hides filigree past what a smaller artifact holds, and brings it back with a bigger one', () => {
    service.set(artifact(3));
    [DEX, FURY[0], REFLEX].forEach((name, index) => service.setFiligree('artifact', index, { name, rare: false }));
    expect(value('Reflex Save')).toBe(2);

    service.set(artifact(2));
    expect(service.getShownFiligree('artifact').map(choice => choice.name)).toEqual([DEX, FURY[0]]);
    expect(value('Reflex Save')).toBe(0);
    expect(service.getNextFiligreeSlot('artifact')).toBeNull();

    service.set(artifact(3));
    expect(service.getShownFiligree('artifact').map(choice => choice.name)).toEqual([DEX, FURY[0], REFLEX]);
    expect(value('Reflex Save')).toBe(2);
  });

  it('lists filigree sets with the gear set bonuses, marked as filigree', () => {
    service.set(weapon());
    service.setFiligree('weapon', 0, { name: DEX, rare: false });

    let visible: Array<{ setName: string; pieces: number; filigree?: boolean }> = [];
    service.getVisibleSetBonusesObservable().subscribe(bonuses => (visible = bonuses)).unsubscribe();

    expect(visible).toContainEqual(expect.objectContaining({ setName: 'Celerity', pieces: 1, filigree: true }));
  });

  it('writes the loadout to the build params and reads it back', () => {
    service.set(weapon());
    service.setFiligree('weapon', 0, { name: REFLEX, rare: false });
    service.setFiligree('weapon', 1, { name: DEX, rare: true });

    const params = lastParams();
    expect(JSON.parse(String(params?.['filigree']))).toEqual({ w: [[REFLEX], [DEX, 1]] });

    const restored = TestBed.inject(EquippedService);
    restored.updateFromParams({
      keys: ['Weapon', 'filigree'],
      get: (key: string) => key === 'filigree' ? String(params?.['filigree']) : key === 'Weapon' ? 'Test Longsword' : null,
      getAll: () => [],
    });
    expect(restored.getFiligreeLoadout().weapon).toEqual([{ name: REFLEX, rare: false }, { name: DEX, rare: true }]);
  });

  it('offers filigree bonus types with their best totals once the level range reaches 20', () => {
    const filters = TestBed.inject(FiltersService);
    const gearDb = TestBed.inject(GearDbService);

    filters.setLevelRange(1, 19);
    expect(gearDb.getTypesForAffix('Dexterity')).not.toContain(FILIGREE_BONUS_TYPE);

    filters.setLevelRange(1, 34);
    const best = gearDb.getBestValueForAffixType('Dexterity', FILIGREE_BONUS_TYPE);
    // At least one Dexterity filigree in a 10-slot weapon plus the same again in an artifact.
    expect(best).toBeGreaterThan(2);
    expect(gearDb.getTypesForAffix('Strength')).toContain(FILIGREE_SET_BONUS_TYPE);
    // Ultimate Fury's five +1 Strength tiers; no other set gives Strength.
    expect(gearDb.getBestValueForAffixType('Strength', FILIGREE_SET_BONUS_TYPE)).toBe(5);
    // Several sets give +5 Melee Power, and bonuses from distinct sets stack.
    expect(gearDb.getBestValueForAffixType('Melee Power', FILIGREE_SET_BONUS_TYPE)).toBeGreaterThan(10);
  });
});
