import { TestBed } from '@angular/core/testing';

import { EquippedService } from './equipped.service';

describe('EquippedService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: EquippedService = TestBed.inject(EquippedService);
    expect(service).toBeTruthy();
  });

  it('tracks percent variants when the base affix is selected', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    expect(service.addImportantAffix('Armor Class')).toEqual(['Armor Class', 'Armor Class (%)']);
    service.addImportantAffix('False Life');

    expect(service.isImportantAffix('Armor Class')).toBeTrue();
    expect(service.isImportantAffix('Armor Class (%)')).toBeTrue();
    expect(service.isImportantAffix('False Life')).toBeTrue();
    expect(service.isImportantAffix('False Life (%)')).toBeTrue();

    expect(service.removeImportantAffix('Armor Class')).toEqual(['Armor Class', 'Armor Class (%)']);

    expect(service.isImportantAffix('Armor Class')).toBeFalse();
    expect(service.isImportantAffix('Armor Class (%)')).toBeFalse();
    expect(service.isImportantAffix('False Life (%)')).toBeTrue();
  });

  it('expands tracked affixes loaded from query params', () => {
    const service: EquippedService = TestBed.inject(EquippedService);

    service.setImportantAffixes(['Armor Class']);

    expect(Array.from(service.getImportantAffixes()).sort()).toEqual(['Armor Class', 'Armor Class (%)']);
  });
});
