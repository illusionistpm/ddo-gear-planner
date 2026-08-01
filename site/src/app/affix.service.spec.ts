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

  it('preserves non-group affixes when flattening', () => {
    const service: AffixService = TestBed.inject(AffixService);
    const deadly = new Affix({ name: 'Deadly', type: 'Competence', value: 10 });

    expect(service.flattenAffixGroups([deadly])).toEqual([deadly]);
  });
});
