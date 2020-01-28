import { TestBed } from '@angular/core/testing';

import { CannithService } from './cannith.service';

describe('CannithService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: CannithService = TestBed.get(CannithService);
    expect(service).toBeTruthy();
  });
});
