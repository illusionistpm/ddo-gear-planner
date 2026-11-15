import { TestBed } from '@angular/core/testing';

import { EquippedService } from '../planner/equipped.service';
import { GearDbService } from '../gear/gear-db.service';
import { TrackedAffixDerivationService } from './tracked-affix-derivation.service';

// Which bonus types a tracked affix shows, and with what values, against the
// real game data. The effects-table spec covers the same rules with mocks.
describe('TrackedAffixDerivationService', () => {
  let service: TrackedAffixDerivationService;
  let equipped: EquippedService;
  let gearDb: GearDbService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TrackedAffixDerivationService);
    equipped = TestBed.inject(EquippedService);
    gearDb = TestBed.inject(GearDbService);
  });

  it('never shows a Penalty row, even one with a value', () => {
    const covered = new Map([['Strength', [
      { bonusType: 'Enhancement', value: 7 },
      { bonusType: 'Penalty', value: -2 },
    ]]]);

    const types = service.getVisibleTypes(covered, 'Strength');

    expect(types).toContainEqual(expect.objectContaining({ bonusType: 'Enhancement', value: 7 }));
    expect(types.some(type => type.bonusType === 'Penalty')).toBe(false);
  });

  it('adds every bonus type the data offers at any level, at zero, when nothing covers it', () => {
    const types = service.getVisibleTypes(new Map(), 'Strength');

    const offered = gearDb.getAllLevelTypesForAffix('Strength')
      .filter(type => type !== 'Penalty' && gearDb.getBestValueForAffixType('Strength', type) > 0);
    expect(types.map(type => type.bonusType).sort()).toEqual([...offered].sort());
    expect(types.every(type => type.value === 0)).toBe(true);
  });

  it('shows a universal spell power item\'s value under each element, as a Universal row', () => {
    equipped.addExternalAffixValue('Universal Spell Power', 'Implement', 30, 'Wand');

    const types = service.getVisibleTypes(new Map(), 'Fire Spell Power');

    expect(types).toContainEqual({
      bonusType: 'Implement', value: 30, label: 'Universal Implement',
      sourceAffixName: 'Universal Spell Power', sourceBonusType: 'Implement',
    });
  });
});
