import { TestBed } from '@angular/core/testing';

import { CannithService } from './cannith.service';

describe('CannithService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: CannithService = TestBed.inject(CannithService);
    expect(service).toBeTruthy();
  });

  it('uses the generated Cannith max level for selectable levels', () => {
    const service: CannithService = TestBed.inject(CannithService);
    expect(service.maxLevel).toBe(34);
    expect(service.levels[0]).toBe(34);
  });
});
