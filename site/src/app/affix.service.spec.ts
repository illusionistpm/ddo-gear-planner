import { TestBed } from '@angular/core/testing';

import { AffixService } from './affix.service';

describe('AffixService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: AffixService = TestBed.get(AffixService);
    expect(service).toBeTruthy();
  });
});
