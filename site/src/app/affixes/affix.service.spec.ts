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

  it('resolves synonyms case-insensitively', () => {
    const service: AffixService = TestBed.inject(AffixService);

    expect(service.getCanonicalName('hit')).toBe('Accuracy');
    expect(service.getCanonicalName('Fortification bypass')).toBe('Armor-Piercing');
    expect(service.getCanonicalName('all spell DCs')).toBe('Spell Focus Mastery');
    expect(service.getCanonicalName('all Ability Scores')).toBe('Well Rounded');
  });

  describe('isAffixGroup', () => {
    it('recognises a group defined by member names', () => {
      const service: AffixService = TestBed.inject(AffixService);
      service.affixGroups.set('Test Group', ['Strength']);

      expect(service.isAffixGroup(new Affix({ name: 'Test Group', type: 'Enhancement', value: 1 }))).toBe(true);
    });

    it('recognises a group defined only by fixed components, as ungroupAffix does', () => {
      const service: AffixService = TestBed.inject(AffixService);
      service.affixGroupComponents.set('Test Components', [{ name: 'Perform', type: 'Enhancement', value: 2 }]);
      const affix = new Affix({ name: 'Test Components', type: 'Bool', value: 1 });

      expect(service.isAffixGroup(affix)).toBe(true);
      expect(service.ungroupAffix(affix).length).toBe(1);
    });

    it('does not recognise an ordinary affix', () => {
      const service: AffixService = TestBed.inject(AffixService);

      expect(service.isAffixGroup(new Affix({ name: 'Deadly', type: 'Competence', value: 10 }))).toBe(false);
    });
  });
});
