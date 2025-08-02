import { TestBed } from '@angular/core/testing';

import { AffixService } from './affix.service';

describe('AffixService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: AffixService = TestBed.inject(AffixService);
    expect(service).toBeTruthy();
  });
});
