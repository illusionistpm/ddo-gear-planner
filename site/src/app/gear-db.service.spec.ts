import { TestBed } from '@angular/core/testing';

import { GearDbService } from './gear-db.service';

describe('GearDbService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: GearDbService = TestBed.get(GearDbService);
    expect(service).toBeTruthy();
  });
});
