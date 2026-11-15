import { TestBed } from '@angular/core/testing';
import { convertToParamMap } from '@angular/router';

import { AffixService } from '../affixes/affix.service';
import { affixTotal } from '../affixes/build-totals';
import { TrackedAffixDerivationService } from '../affixes/tracked-affix-derivation.service';
import { BuildUrlCodecService } from '../build/build-url-codec.service';
import { QueryParamRecord } from '../build/query-param-types';
import { FiligreeDbService } from '../gear/filigree-db.service';
import { GearDbService } from '../gear/gear-db.service';
import { Item } from '../gear/item';
import { BuildModel, buildModelOf, BuildSnapshot, contributedAffixNames } from '../planner/build-snapshot';
import { CoveredBonusType, visibleTypeRulesOf } from '../affixes/tracked-affix-derivation';
import { EquippedService } from '../planner/equipped.service';
import { BuildCompareService } from './build-compare.service';
import { AffixDiffRow, BuildComparison } from './build-comparison';

function item(name: string, slot: string, affixes: Array<{ name: string; type: string; value: number }>, sets: string[] = []) {
  return new Item({ name, slot, type: slot, ml: 30, affixes, sets, crafting: [], quests: [], artifact: false });
}

describe('Comparing two saved builds', () => {
  let compare: BuildCompareService;
  let codec: BuildUrlCodecService;
  let gearDb: GearDbService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    compare = TestBed.inject(BuildCompareService);
    codec = TestBed.inject(BuildUrlCodecService);
    gearDb = TestBed.inject(GearDbService);
  });

  function snapshot(slots: Record<string, Item | null>, extra: Partial<BuildSnapshot> = {}): BuildSnapshot {
    const all = new Map<string, Item | null>(gearDb.getSlots().map(slot => [slot, slots[slot] ?? null]));
    return {
      slots: all, filigreeLoadout: { weapon: [], artifact: [] }, externalEntries: [], tracked: new Set(), unknownItems: [],
      ...extra,
    };
  }

  function model(slots: Record<string, Item | null>, extra: Partial<BuildSnapshot> = {}): BuildModel {
    return buildModelOf(snapshot(slots, extra), {
      gearDb, filigreeDb: TestBed.inject(FiligreeDbService), affixSvc: TestBed.inject(AffixService),
    });
  }

  const rowOf = (comparison: BuildComparison, name: string): AffixDiffRow | undefined =>
    comparison.tracked.flatMap(group => group.rows).find(row => row.name === name);

  describe('reading a saved build', () => {
    it('reads its gear, tracked affixes and non-gear entries from the blob, leaving the planner alone', () => {
      const ring = gearDb.getGearBySlot('Ring1')[0];
      const blob = codec.encode({
        Ring1: ring.name, Helm: 'Epic Deific Diadem', tracked: ['Armor Class'],
        nongear: JSON.stringify([{ id: '1', affixName: 'Deadly', bonusType: 'Insight', kind: 'value', value: 5, label: 'Trance' }]),
      });

      const read = compare.modelOf(blob)!.snapshot;

      expect(read.slots.get('Ring1')?.name).toBe(ring.name);
      expect(read.slots.get('Helm')?.name).toBe('Epic Deific Diadem');
      expect(read.slots.get('Boots')).toBeNull();
      expect([...read.tracked]).toEqual(['Armor Class', 'Armor Class (%)']);
      expect(read.externalEntries).toEqual([expect.objectContaining({ affixName: 'Deadly', value: 5, label: 'Trance' })]);
      expect(read.unknownItems).toEqual([]);
      expect(TestBed.inject(EquippedService).getSlotsSnapshot().get('Helm')).toBeNull();
    });

    it('lists items the game data no longer has, but not an offhand a two-hander leaves no room for', () => {
      const twoHander = gearDb.getGearBySlot('Weapon').find(weapon => weapon.isTwoHandedWeapon() && !weapon.isCrossbow())!;
      const offhand = gearDb.getGearBySlot('Offhand')[0];
      const blob = codec.encode({ Weapon: twoHander.name, Offhand: offhand.name, Helm: 'No Such Helm' });

      expect(compare.modelOf(blob)!.snapshot.unknownItems).toEqual([{ slot: 'Helm', name: 'No Such Helm' }]);
    });

    it('is null for a blob it can\'t read', () => {
      expect(compare.modelOf('not a build')).toBeNull();
    });
  });

  describe('an affix\'s total', () => {
    const totalOf = (built: BuildModel, name: string) => affixTotal(built, TestBed.inject(AffixService),
      visibleTypeRulesOf(gearDb, TestBed.inject(AffixService)), name);

    it('adds the best value of each bonus type, with what supplies it', () => {
      const built = model({
        Gloves: item('Weak Gloves', 'Gloves', [{ name: 'Strength', type: 'Enhancement', value: 5 }]),
        Belt: item('Strong Belt', 'Belt', [{ name: 'Strength', type: 'Enhancement', value: 10 }]),
        Ring1: item('Wise Ring', 'Ring1', [{ name: 'Strength', type: 'Insight', value: 3 }]),
      });

      const total = totalOf(built, 'Strength');

      expect(total.total).toBe(13);
      expect(total.checklist).toBe(false);
      expect(total.types.map(type => [type.label, type.value, type.sources.map(source => source.itemName)])).toEqual([
        ['Enhancement', 10, ['Strong Belt']],
        ['Insight', 3, ['Wise Ring']],
      ]);
    });

    it('counts an ignored bonus type, marked, and flags a penalty without counting it', () => {
      const built = model({
        Belt: item('Belt', 'Belt', [{ name: 'Strength', type: 'Enhancement', value: 10 }]),
        Boots: item('Cursed Boots', 'Boots', [{ name: 'Strength', type: 'Penalty', value: -2 }]),
      }, { externalEntries: [{ id: '1', affixName: 'Strength', bonusType: 'Enhancement', kind: 'ignored', value: 0, label: 'x' }] });

      const total = totalOf(built, 'Strength');

      expect(total.total).toBe(10);
      expect(total.types[0].ignored).toBe(true);
      expect(total.hasPenalty).toBe(gearDb.getAllLevelTypesForAffix('Strength').includes('Penalty'));
    });

    it('reads an on/off affix as 1 or 0', () => {
      expect(gearDb.getAllLevelTypesForAffix('Vorpal')).toEqual(['Bool']);

      expect(totalOf(model({ Weapon: item('Sharp', 'Weapon', [{ name: 'Vorpal', type: 'Bool', value: 1 }]) }), 'Vorpal'))
        .toEqual(expect.objectContaining({ checklist: true, total: 1 }));
      expect(totalOf(model({}), 'Vorpal')).toEqual(expect.objectContaining({ checklist: true, total: 0, types: [] }));
    });

    it('matches the planner\'s total for the same build', () => {
      // One real item a slot, tracking everything they give.
      const params: QueryParamRecord = {};
      for (const slot of ['Helm', 'Necklace', 'Trinket', 'Cloak', 'Belt', 'Ring1', 'Gloves', 'Boots', 'Bracers', 'Goggles']) {
        const first = gearDb.getGearBySlot(slot).find(candidate => !candidate.artifact);
        if (first) {
          params[slot] = first.name;
        }
      }
      const equipped = TestBed.inject(EquippedService);
      const affixSvc = TestBed.inject(AffixService);
      const loaded = convertToParamMap(params);
      equipped.updateFromParams({ keys: loaded.keys, get: key => loaded.get(key), getAll: key => loaded.getAll(key) });
      const names = new Set<string>();
      for (const equippedItem of equipped.getSlotsSnapshot().values()) {
        for (const affix of equippedItem ? affixSvc.getActiveAffixes(equippedItem) : []) {
          if (affix.type !== 'Penalty' && !affixSvc.isAffixGroup(affix)) {
            names.add(affix.name);
          }
        }
      }
      equipped.setImportantAffixes([...names]);
      let covered = new Map<string, CoveredBonusType[]>();
      equipped.getCoveredAffixes().subscribe(map => covered = map).unsubscribe();
      const derivation = TestBed.inject(TrackedAffixDerivationService);

      const built = compare.modelOf(codec.encode(params))!;

      expect(names.size).toBeGreaterThan(5);
      for (const name of names) {
        const planner = derivation.getVisibleTypes(covered, name).reduce((sum, type) => sum + type.value, 0);
        expect({ name, total: totalOf(built, name).total }).toEqual({ name, total: planner });
      }
    });
  });

  describe('the comparison', () => {
    it('rows every affix either build tracks, with both totals and the change', () => {
      const a = model({ Belt: item('Old Belt', 'Belt', [{ name: 'Strength', type: 'Enhancement', value: 6 }]) },
        { tracked: new Set(['Strength']) });
      const b = model({
        Belt: item('New Belt', 'Belt', [{ name: 'Strength', type: 'Enhancement', value: 10 }]),
        Ring1: item('Dex Ring', 'Ring1', [{ name: 'Dexterity', type: 'Enhancement', value: 4 }]),
      }, { tracked: new Set(['Strength', 'Dexterity', 'Constitution']) });

      const comparison = compare.compare(a, b);

      expect(rowOf(comparison, 'Strength')).toEqual(expect.objectContaining({ delta: 4, trackedIn: 'both' }));
      expect(rowOf(comparison, 'Strength')!.a.total).toBe(6);
      expect(rowOf(comparison, 'Dexterity')).toEqual(expect.objectContaining({ delta: 4, trackedIn: 'b' }));
      expect(rowOf(comparison, 'Constitution')).toEqual(expect.objectContaining({ delta: 0, trackedIn: 'b' }));
      expect(comparison.summary).toEqual({ higher: 2, lower: 0, unchanged: 1 });
    });

    it('lists untracked affixes whose totals changed, biggest change first', () => {
      const a = model({ Belt: item('Old Belt', 'Belt', [
        { name: 'Strength', type: 'Enhancement', value: 6 }, { name: 'Spot', type: 'Competence', value: 10 },
      ]) }, { tracked: new Set(['Strength']) });
      const b = model({ Belt: item('New Belt', 'Belt', [
        { name: 'Strength', type: 'Enhancement', value: 6 }, { name: 'Listen', type: 'Competence', value: 3 },
      ]) }, { tracked: new Set(['Strength']) });

      const comparison = compare.compare(a, b);

      expect(comparison.other.map(row => [row.name, row.delta])).toEqual([['Spot', -10], ['Listen', 3]]);
    });

    it('lists swapped, added, removed and recrafted gear', () => {
      const ring = gearDb.getGearBySlot('Ring1')[0];
      const a = compare.modelOf(codec.encode({ Helm: 'Epic Deific Diadem', Ring1: ring.name, Weapon: 'Essence Crafting Melee' }))!;
      const b = compare.modelOf(codec.encode({
        Boots: "Admiral's Gumshoes", Ring1: ring.name, Weapon: 'Essence Crafting Melee',
        craft_0_slot: 'Weapon', craft_0_system: 'Augment Slot 1', craft_0_selected: 'Red Augment Slot (empty)',
      }))!;

      const gear = compare.compare(a, b).gear;

      expect(gear.map(change => [change.slot, change.kind])).toEqual(expect.arrayContaining([
        ['Helm', 'removed'], ['Boots', 'added'], ['Weapon', 'changed'],
      ]));
      expect(gear.some(change => change.slot === 'Ring1')).toBe(false);
      expect(gear.find(change => change.slot === 'Weapon')!.crafting)
        .toEqual([{ system: 'Augment Slot 1', a: null, b: 'Red Augment Slot (empty)' }]);
    });

    it('lists sets whose pieces or bonus tiers changed', () => {
      const piece = (slot: string) => item(`Piece ${slot}`, slot, [], ['Legendary Delight of the Devourer']);
      const a = model({ Gloves: piece('Gloves'), Belt: piece('Belt'), Boots: piece('Boots') });
      const b = model({ Gloves: piece('Gloves') });

      expect(compare.compare(a, b).sets).toEqual([expect.objectContaining({
        setName: 'Legendary Delight of the Devourer', aPieces: 3, bPieces: 1, filigree: false,
      })]);
    });

    it('names each affix an affix group gives rather than the group', () => {
      const built = model({ Gloves: item('Riposte Gloves', 'Gloves', [{ name: 'Riposte', type: 'Insight', value: 5 }]) });

      const names = contributedAffixNames(built, TestBed.inject(AffixService));

      expect(names.has('Armor Class')).toBe(true);
      expect(names.has('Riposte')).toBe(false);
    });
  });
});
