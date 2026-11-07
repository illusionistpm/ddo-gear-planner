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

  it('tracks Ghostly through its parts: incorporeality in Basic, the miss-chance bypass in Melee and Ranged', () => {
    expect(service.packages.get('Basic')).toContain('Incorporeality');
    expect(service.packages.get('Basic')).not.toContain('Ghostly');
    expect(service.packages.get('Melee')).toContain('Incorporeal Bypass');
    expect(service.packages.get('Ranged')).toContain('Incorporeal Bypass');
  });

  it('never treats an empty list as selected', () => {
    expect(service.isSelected([], new Set())).toBe(false);
    expect(service.isSelected(undefined, new Set(['Strength']))).toBe(false);
  });
});
