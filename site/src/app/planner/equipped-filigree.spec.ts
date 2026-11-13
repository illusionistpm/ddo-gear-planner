import { TestBed } from '@angular/core/testing';

import { EquippedService } from './equipped.service';
import { FILIGREE_SOURCE_SLOTS, FiligreeLoadoutService } from './filigree-loadout.service';
import { FiltersService } from './filters.service';
import { GearDbService } from '../gear/gear-db.service';
import { Item } from '../gear/item';
import { FILIGREE_BONUS_TYPE, FILIGREE_SET_BONUS_TYPE } from '../gear/filigree';
import { MAX_FILIGREE_SLOTS_AFFIX } from '../affixes/filigree-affix';
import { QueryParamRecord } from '../build/query-param-types';
import { Affix } from '../affixes/affix';
import { AffixRank } from '../affixes/affix-rank.enum';

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
  let filigree: FiligreeLoadoutService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EquippedService);
    filigree = TestBed.inject(FiligreeLoadoutService);
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

    expect(filigree.getShown('weapon')).toEqual([]);
    expect(value('Dexterity')).toBe(0);
    expect(filigree.getLoadout().weapon).toEqual([{ name: DEX, rare: false }]);

    service.set(weapon());
    expect(value('Dexterity')).toBe(1);
  });

  it('adds a filigree only in the slot after the last one, and only while the host has room', () => {
    service.set(artifact(2));
    filigree.set('artifact', 1, { name: DEX, rare: false });
    expect(filigree.getLoadout().artifact).toEqual([]);

    filigree.set('artifact', 0, { name: DEX, rare: false });
    filigree.set('artifact', 1, { name: REFLEX, rare: false });
    expect(filigree.getNextSlot('artifact')).toBeNull();
    filigree.set('artifact', 2, { name: DEX, rare: true });
    expect(filigree.getLoadout().artifact.map(choice => choice.name)).toEqual([DEX, REFLEX]);
  });

  it('slides the rest up when one is removed from the middle', () => {
    service.set(weapon());
    [DEX, REFLEX, FURY[0]].forEach((name, index) => filigree.set('weapon', index, { name, rare: false }));

    filigree.set('weapon', 1, null);

    expect(filigree.getLoadout().weapon.map(choice => choice.name)).toEqual([DEX, FURY[0]]);
    expect(filigree.getNextSlot('weapon')).toBe(2);
  });

  it('adds up filigree bonuses of one type instead of taking the best', () => {
    service.set(weapon());
    service.set(artifact(3));
    filigree.set('weapon', 0, { name: DEX, rare: true });
    filigree.set('artifact', 0, { name: DEX, rare: false });

    expect(value('Dexterity')).toBe(2);
    expect(value('Physical Sheltering')).toBe(2);
    expect(service.getSourcesForAffixType('Dexterity', FILIGREE_BONUS_TYPE).map(source => source.filigreeHost))
      .toEqual(['weapon', 'artifact']);
    expect(service.getSourcesForAffixType('Dexterity', FILIGREE_BONUS_TYPE).map(source => [source.slot, source.itemName, source.value]))
      .toEqual([
        [FILIGREE_SOURCE_SLOTS.weapon, DEX + ' (Rare)', 1],
        [FILIGREE_SOURCE_SLOTS.artifact, DEX, 1],
      ]);
  });

  it('gives a duplicate in the same host its set piece but not its bonuses', () => {
    service.set(weapon());
    filigree.set('weapon', 0, { name: DEX, rare: false });
    filigree.set('weapon', 1, { name: DEX, rare: false });

    expect(value('Dexterity')).toBe(1);
    expect(filigree.getSetPieces().get('Celerity')).toBe(2);
    // Celerity's 2-piece bonus: +2 Doublestrike.
    expect(value('Doublestrike', FILIGREE_SET_BONUS_TYPE)).toBe(2);
  });

  it('counts set pieces across weapon and artifact, and adds each tier', () => {
    service.set(weapon());
    service.set(artifact(5));
    FURY.slice(0, 4).forEach((name, index) => filigree.set('weapon', index, { name, rare: false }));
    FURY.slice(4).forEach((name, index) => filigree.set('artifact', index, { name, rare: false }));

    // +1 Strength at each of 2..6 pieces.
    expect(filigree.getSetPieces().get('Ultimate Fury')).toBe(6);
    expect(value('Strength', FILIGREE_SET_BONUS_TYPE)).toBe(5);
  });

  it('hides filigree past what a smaller artifact holds, and brings it back with a bigger one', () => {
    service.set(artifact(3));
    [DEX, FURY[0], REFLEX].forEach((name, index) => filigree.set('artifact', index, { name, rare: false }));
    expect(value('Reflex Save')).toBe(2);

    service.set(artifact(2));
    expect(filigree.getShown('artifact').map(choice => choice.name)).toEqual([DEX, FURY[0]]);
    expect(value('Reflex Save')).toBe(0);
    expect(filigree.getNextSlot('artifact')).toBeNull();

    service.set(artifact(3));
    expect(filigree.getShown('artifact').map(choice => choice.name)).toEqual([DEX, FURY[0], REFLEX]);
    expect(value('Reflex Save')).toBe(2);
  });

  it('lists filigree sets with the gear set bonuses, marked as filigree', () => {
    service.set(weapon());
    filigree.set('weapon', 0, { name: DEX, rare: false });

    let visible: Array<{ setName: string; pieces: number; filigree?: boolean }> = [];
    service.getVisibleSetBonusesObservable().subscribe(bonuses => (visible = bonuses)).unsubscribe();

    expect(visible).toContainEqual(expect.objectContaining({ setName: 'Celerity', pieces: 1, filigree: true }));
  });

  it('never ranks one filigree set bonus as outranked by another, since they add up', () => {
    service.set(weapon());
    service.toggleImportantAffix('Armor Class');
    // Unbreakable gives +5 Armor Class at 4 pieces and again at 5.
    Array.from({ length: 5 }, () => 'Unbreakable: Constitution').forEach((name, index) => filigree.set('weapon', index, { name, rare: false }));
    expect(filigree.getSetPieces().get('Unbreakable')).toBe(5);
    expect(value('Armor Class', FILIGREE_SET_BONUS_TYPE)).toBe(10);

    const tier = new Affix({ name: 'Armor Class', type: FILIGREE_SET_BONUS_TYPE, value: 5 });
    expect(service.getAffixRanking(tier)).toBe(AffixRank.Best);
    expect(service.getAffixRanking(new Affix({ name: 'Armor Class', type: FILIGREE_SET_BONUS_TYPE, value: 3 })))
      .toBe(AffixRank.BetterThanBest);
  });

  it('ranks a filigree bonus on a candidate item as it ranks today, since swapping gear leaves filigree in place', () => {
    service.set(weapon());
    service.toggleImportantAffix('Armor Class');
    Array.from({ length: 5 }, () => 'Unbreakable: Constitution').forEach((name, index) => filigree.set('weapon', index, { name, rare: false }));

    const counted = new Affix({ name: 'Armor Class', type: FILIGREE_SET_BONUS_TYPE, value: 5 });
    const notCounted = new Affix({ name: 'Armor Class', type: FILIGREE_SET_BONUS_TYPE, value: 3 });
    const candidate = { slot: 'Weapon', activeAffixes: [counted], sets: [] };
    expect(service.getAffixRankingAsEquipped(counted, candidate)).toEqual({ rank: AffixRank.Best });
    expect(service.getAffixRankingAsEquipped(notCounted, candidate)).toEqual({ rank: AffixRank.BetterThanBest });
  });

  it('lists gear sets before filigree sets, even one with fewer pieces', () => {
    service.set(weapon());
    [DEX, REFLEX, DEX].forEach((name, index) => filigree.set('weapon', index, { name, rare: false }));
    const gearSet = 'Forbidden Knowledge';
    const piece = TestBed.inject(GearDbService).findGearInSet(gearSet)[0];
    service.set(piece);

    let visible: Array<{ setName: string; filigree?: boolean }> = [];
    service.getVisibleSetBonusesObservable().subscribe(bonuses => (visible = bonuses)).unsubscribe();
    expect(visible.map(bonus => [bonus.setName, !!bonus.filigree])).toEqual([[gearSet, false], ['Celerity', true]]);
  });

  it('writes the loadout to the build params and reads it back', () => {
    service.set(weapon());
    filigree.set('weapon', 0, { name: REFLEX, rare: false });
    filigree.set('weapon', 1, { name: DEX, rare: true });

    const params = lastParams();
    expect(JSON.parse(String(params?.['filigree']))).toEqual({ w: [[REFLEX], [DEX, 1]] });

    const restored = TestBed.inject(EquippedService);
    restored.updateFromParams({
      keys: ['Weapon', 'filigree'],
      get: (key: string) => key === 'filigree' ? String(params?.['filigree']) : key === 'Weapon' ? 'Test Longsword' : null,
      getAll: () => [],
    });
    expect(filigree.getLoadout().weapon).toEqual([{ name: REFLEX, rare: false }, { name: DEX, rare: true }]);
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

  it("counts Snowpeak's Gifts' Movement Speed as the Enhancement bonus it is, not stacking with an item's", () => {
    const filters = TestBed.inject(FiltersService);
    const gearDb = TestBed.inject(GearDbService);
    const SPEED = "Snowpeak's Gifts: Movement Speed"; // Movement Speed +30% (Enhancement bonus).

    service.set(weapon());
    service.set(artifact(3));
    filigree.set('weapon', 0, { name: SPEED, rare: false });
    filigree.set('artifact', 0, { name: SPEED, rare: false });

    // Filigree bonuses add up across hosts; an Enhancement bonus takes the best, as on items.
    expect(value('Speed', 'Enhancement')).toBe(30);
    expect(value('Speed')).toBe(0);

    expect(service.getSourcesForAffixType('Speed', 'Enhancement').map(source => [source.kind, source.value]))
      .toEqual([['filigree', 30], ['filigree', 30]]);
    service.set(new Item({
      name: 'Test Boots', slot: 'Boots', type: 'Boots', ml: 30, crafting: [], quests: [],
      affixes: [{ name: 'Speed', type: 'Enhancement', value: 20 }],
    }));
    expect(value('Speed', 'Enhancement')).toBe(30);
    expect(service.getSourcesForAffixType('Speed', 'Enhancement').map(source => source.kind)).toEqual(['filigree', 'filigree']);

    filters.setLevelRange(1, 34);
    expect(gearDb.getTypesForAffix('Speed')).toContain('Enhancement');
    expect(gearDb.getTypesForAffix('Speed')).not.toContain(FILIGREE_BONUS_TYPE);
  });
});
