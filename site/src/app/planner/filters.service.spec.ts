import { TestBed } from '@angular/core/testing';

import { FiltersService } from './filters.service';
import { QueryParamsService } from '../build/query-params.service';

describe('FiltersService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: FiltersService = TestBed.inject(FiltersService);
    expect(service).toBeTruthy();
  });

  it('round-trips showRaidItems/showRareItems through its own emitted params without flipping them', () => {
    // Regression test: _updateRouterState() used to emit raw booleans for
    // 'raids'/'rare', but updateFromParams() does a strict === 'true'
    // string comparison - true !== 'true', so re-applying the service's OWN
    // just-emitted params (not a URL, which coerces to strings for free)
    // silently flipped both to false. This is exactly what
    // QueryParamsService.getCombinedParams()'s raw snapshot contains when
    // reapplied via CurrentBuildService.canonicalParamsCache - e.g. right
    // after an in-place Save, landing back on the build's own canonical
    // URL - so a save was quietly hiding raid/rare items every time.
    const service: FiltersService = TestBed.inject(FiltersService);
    const queryParams: QueryParamsService = TestBed.inject(QueryParamsService);
    queryParams.applyDecodedBuildParams({});

    let current = { showRaidItems: false, showRareItems: false };
    service.getItemFilters().subscribe(value => (current = value));
    expect(current.showRaidItems).toBeTrue();
    expect(current.showRareItems).toBeTrue();

    const emitted = queryParams.getCombinedParams();
    queryParams.applyDecodedBuildParams(emitted as Record<string, string>);

    expect(current.showRaidItems).toBeTrue();
    expect(current.showRareItems).toBeTrue();
  });
});
