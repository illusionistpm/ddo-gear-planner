import { TestBed } from '@angular/core/testing';

import { AffixService } from './affix.service';
import { Affix } from './affix';

describe('AffixService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: AffixService = TestBed.inject(AffixService);
    expect(service).toBeTruthy();
  });

  it('flattens fixed affix group components', () => {
    const service: AffixService = TestBed.inject(AffixService);
    service.affixGroups.set('Songblade', ['Perform']);
    service.affixGroupComponents.set('Songblade', [
      new Affix({ name: 'Perform', type: 'Enhancement', value: 2 })
    ]);

    expect(service.flattenAffixGroups([new Affix({ name: 'Songblade', type: 'Bool', value: 1 })])).toEqual([
      new Affix({ name: 'Perform', type: 'Enhancement', value: 2 })
    ]);
  });

  it('flattens fixed affix group components with inherited parsed values', () => {
    const service: AffixService = TestBed.inject(AffixService);
    service.affixGroups.set('Lifesealed', ['Negative Energy Absorption', 'Deathblock']);
    service.affixGroupComponents.set('Lifesealed', [
      { name: 'Negative Energy Absorption', type: '<TypeAlreadyParsed>', value: '<ValueAlreadyParsed>' },
      { name: 'Deathblock', type: 'Bool', value: 1 }
    ]);

    expect(service.flattenAffixGroups([new Affix({ name: 'Lifesealed', type: 'Enhancement', value: 28 })])).toEqual([
      new Affix({ name: 'Negative Energy Absorption', type: 'Enhancement', value: 28 }),
      new Affix({ name: 'Deathblock', type: 'Bool', value: 1 })
    ]);
  });

  it('preserves non-group affixes when flattening', () => {
    const service: AffixService = TestBed.inject(AffixService);
    const deadly = new Affix({ name: 'Deadly', type: 'Competence', value: 10 });

    expect(service.flattenAffixGroups([deadly])).toEqual([deadly]);
  });
});
