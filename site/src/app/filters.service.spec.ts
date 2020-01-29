import { TestBed } from '@angular/core/testing';

import { FiltersService } from './filters.service';

describe('FiltersService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: FiltersService = TestBed.get(FiltersService);
    expect(service).toBeTruthy();
  });
});
