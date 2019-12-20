import { TestBed } from '@angular/core/testing';

import { EquippedService } from './equipped.service';

describe('EquippedService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: EquippedService = TestBed.get(EquippedService);
    expect(service).toBeTruthy();
  });
});
