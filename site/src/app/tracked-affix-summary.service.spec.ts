import { TestBed, waitForAsync } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';

import { AppModule } from './app.module';
import { TrackedAffixSummaryService } from './tracked-affix-summary.service';
import { EquippedService } from './equipped.service';
import { GearDbService } from './gear-db.service';

describe('TrackedAffixSummaryService', () => {
  let service: TrackedAffixSummaryService;
  let equipped: EquippedService;
  let gearDB: GearDbService;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [AppModule]
    }).compileComponents();
  }));

  beforeEach(() => {
    service = TestBed.inject(TrackedAffixSummaryService);
    equipped = TestBed.inject(EquippedService);
    gearDB = TestBed.inject(GearDbService);
  });

  function emitCovered(covered: Map<string, Array<any>>) {
    const subject = new BehaviorSubject(covered);
    spyOn(equipped, 'getCoveredAffixes').and.returnValue(subject.asObservable());
  }

  it('is created', () => {
    expect(service).toBeTruthy();
  });

  it('classifies each bonus type by how close its value is to the best available', done => {
    spyOn(gearDB, 'getAllLevelTypesForAffix').and.returnValue([]);
    spyOn(gearDB, 'getBestValueForAffixType').and.callFake((affixName: string, bonusType: string) => {
      if (affixName !== 'Strength') { return 0; }
      return { Equipment: 14, Insight: 8, Quality: 6 }[bonusType] || 0;
    });
    emitCovered(new Map<string, Array<any>>([
      ['Strength', [
        { bonusType: 'Equipment', value: 14 },
        { bonusType: 'Insight', value: 7 },
        { bonusType: 'Quality', value: 0 }
      ]]
    ]));

    service.getSummaryGroups().subscribe(groups => {
      const strength = groups.flatMap(group => group.affixes).find(affix => affix.name === 'Strength');
      expect(strength).toBeTruthy();
      const byType = new Map(strength!.badges.map(badge => [badge.label, badge.qualityClass]));
      expect(byType.get('Equipment')).toBe('max-value');
      expect(byType.get('Insight')).toBe('mid-value');
      expect(byType.get('Quality')).toBe('no-value');
      const codes = new Map(strength!.badges.map(badge => [badge.label, badge.code]));
      expect(codes.get('Equipment')).toBe('Eq');
      expect(codes.get('Insight')).toBe('Ins');
      done();
    });
  });

  it('abbreviates bonus types to short, recognisable codes', () => {
    expect(service.abbreviateBonusType('Equipment')).toBe('Eq');
    expect(service.abbreviateBonusType('Exceptional')).toBe('Ex');
    expect(service.abbreviateBonusType('Quality')).toBe('Ql');
    expect(service.abbreviateBonusType('Universal Enhancement')).toBe('uEn');
    expect(service.abbreviateBonusType('Artifact Natural')).toBe('ArtN');
    expect(service.abbreviateBonusType('Untyped')).toBe('Un');
    expect(service.abbreviateBonusType('Wobble')).toBe('Wob');
  });

  it('renders a checklist affix as a single dot reflecting whether it is covered', done => {
    emitCovered(new Map<string, Array<any>>([
      ['Feather Falling', [{ bonusType: 'Bool', value: 1 }]],
      ['Deathblock', [{ bonusType: 'Bool', value: 0 }]]
    ]));

    service.getSummaryGroups().subscribe(groups => {
      const affixes = groups.flatMap(group => group.affixes);
      const feather = affixes.find(affix => affix.name === 'Feather Falling');
      const deathblock = affixes.find(affix => affix.name === 'Deathblock');
      expect(feather?.isChecklist).toBeTrue();
      expect(feather?.badges.length).toBe(1);
      expect(feather?.badges[0].qualityClass).toBe('max-value');
      expect(deathblock?.badges[0].qualityClass).toBe('no-value');
      done();
    });
  });

  it('omits groups that have no tracked affixes', done => {
    spyOn(gearDB, 'getAllLevelTypesForAffix').and.returnValue([]);
    spyOn(gearDB, 'getBestValueForAffixType').and.returnValue(0);
    emitCovered(new Map<string, Array<any>>());

    service.getSummaryGroups().subscribe(groups => {
      expect(groups).toEqual([]);
      done();
    });
  });
});
