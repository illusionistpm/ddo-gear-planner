import { TestBed } from '@angular/core/testing';

import { GearDbService } from '../gear/gear-db.service';
import { EquippedService } from './equipped.service';
import { FiltersService } from './filters.service';
import { rankArtifacts } from './artifact-ranking';

describe('rankArtifacts', () => {
  let equipped: EquippedService;
  let gearDB: GearDbService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    gearDB = TestBed.inject(GearDbService);
    equipped = TestBed.inject(EquippedService);
    // Only once GearDbService exists: constructing it resets the range.
    TestBed.inject(FiltersService).setLevelRange(28, 34);
    equipped.setImportantAffixes(['Doublestrike', 'Constitution', 'Physical Sheltering']);
  });

  it('ranks minor artifacts from every slot together, best first, each once', async () => {
    const ranked = await rankArtifacts(equipped, gearDB);

    expect(ranked.length).toBeGreaterThan(10);
    expect(new Set(ranked.map(entry => entry.slot)).size).toBeGreaterThan(3);
    expect(ranked.every(entry => entry.item.artifact)).toBe(true);
    expect(new Set(ranked.map(entry => entry.item.name)).size).toBe(ranked.length);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
    }
    expect(ranked[0].score).toBeGreaterThan(0);
  });

  it('stops when cancelled', async () => {
    expect(await rankArtifacts(equipped, gearDB, () => true)).toEqual([]);
  });
});
