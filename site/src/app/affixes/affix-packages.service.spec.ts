import { TestBed } from '@angular/core/testing';

import { AppModule } from '../app.module';

import { AffixPackagesService } from './affix-packages.service';
import { EquippedService } from '../planner/equipped.service';

describe('AffixPackagesService', () => {
  let service: AffixPackagesService;
  let equipped: EquippedService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppModule]
    })
      .compileComponents();
  });

  beforeEach(() => {
    service = TestBed.inject(AffixPackagesService);
    equipped = TestBed.inject(EquippedService);
    // Adding whole bundles would otherwise queue a lot of idle-time availability warmup that outlives the test.
    vi.spyOn(TestBed.inject(EquippedService) as any, '_scheduleAvailabilityWarmup').mockReturnValue(undefined);
    equipped.setImportantAffixes([]);
  });

  it('starts an empty build on the Basic package', () => {
    service.addDefaultPackage();

    expect(service.isSelected(service.packages.get('Basic'), equipped.getImportantAffixes())).toBe(true);
    expect(service.isSelected(service.packages.get('Melee'), equipped.getImportantAffixes())).toBe(false);
  });

  it('leaves a build that already tracks something alone', () => {
    equipped.addImportantAffix('Strength');

    service.addDefaultPackage();

    expect(equipped.getImportantAffixes().has('Strength')).toBe(true);
    expect(equipped.getImportantAffixes().has('Dodge')).toBe(false);
  });

  it('never treats an empty list as selected', () => {
    expect(service.isSelected([], new Set())).toBe(false);
    expect(service.isSelected(undefined, new Set(['Strength']))).toBe(false);
  });
});
