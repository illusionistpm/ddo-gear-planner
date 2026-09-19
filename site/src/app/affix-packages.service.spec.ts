import { TestBed, waitForAsync } from '@angular/core/testing';

import { AppModule } from './app.module';

import { AffixPackagesService } from './affix-packages.service';
import { EquippedService } from './equipped.service';

describe('AffixPackagesService', () => {
  let service: AffixPackagesService;
  let equipped: EquippedService;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [ AppModule ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    service = TestBed.inject(AffixPackagesService);
    equipped = TestBed.inject(EquippedService);
    // Adding whole bundles would otherwise queue a lot of idle-time availability warmup that outlives the test.
    spyOn(TestBed.inject(EquippedService) as any, '_scheduleAvailabilityWarmup');
    equipped.setImportantAffixes([]);
  });

  it('starts an empty build on the Basic package', () => {
    service.addDefaultPackage();

    expect(service.isSelected(service.packages.get('Basic'), equipped.getImportantAffixes())).toBeTrue();
    expect(service.isSelected(service.packages.get('Melee'), equipped.getImportantAffixes())).toBeFalse();
  });

  it('leaves a build that already tracks something alone', () => {
    equipped.addImportantAffix('Strength');

    service.addDefaultPackage();

    expect(equipped.getImportantAffixes().has('Strength')).toBeTrue();
    expect(equipped.getImportantAffixes().has('Dodge')).toBeFalse();
  });

  it('never treats an empty list as selected', () => {
    expect(service.isSelected([], new Set())).toBeFalse();
    expect(service.isSelected(undefined, new Set(['Strength']))).toBeFalse();
  });
});
