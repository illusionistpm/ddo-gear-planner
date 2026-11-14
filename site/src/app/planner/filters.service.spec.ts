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
    expect(current.showRaidItems).toBe(true);
    expect(current.showRareItems).toBe(true);

    const emitted = queryParams.getCombinedParams();
    queryParams.applyDecodedBuildParams(emitted as Record<string, string>);

    expect(current.showRaidItems).toBe(true);
    expect(current.showRareItems).toBe(true);
  });

  describe('held changes', () => {
    function latest<T>(source: { subscribe(next: (value: T) => void): { unsubscribe(): void } }): T {
      let value!: T;
      source.subscribe(next => value = next).unsubscribe();
      return value;
    }

    it('shows a held change to the filter controls at once, and to everything else on release', () => {
      const service = TestBed.inject(FiltersService);
      const queryParams = TestBed.inject(QueryParamsService);
      queryParams.applyDecodedBuildParams({});
      let applied = 0;
      service.getItemFilters().subscribe(() => applied++);
      applied = 0;

      service.holdChanges();
      service.setShowRaidItems(false);
      service.setHiddenPacks(new Set(['Tavern Tales']));
      service.setHiddenPacks(new Set(['Tavern Tales', 'The Red Fens']));

      expect(latest(service.getEditedFilters()).hiddenPacks).toEqual(new Set(['Tavern Tales', 'The Red Fens']));
      expect(latest(service.getItemFilters()).showRaidItems).toBe(true);
      expect(applied).toBe(0);
      expect(queryParams.getCombinedParams()['hiddenpacks'] ?? '').toBe('');

      service.applyHeldChanges();

      expect(applied).toBe(1);
      expect(latest(service.getItemFilters()).showRaidItems).toBe(false);
      expect(latest(service.getItemFilters()).hiddenPacks).toEqual(new Set(['Tavern Tales', 'The Red Fens']));
      expect(queryParams.getCombinedParams()['hiddenpacks']).toBe('Tavern Tales,The Red Fens');
    });

    it('applies nothing on release when nothing changed', () => {
      const service = TestBed.inject(FiltersService);
      let applied = 0;
      service.getItemFilters().subscribe(() => applied++);
      applied = 0;

      service.holdChanges();
      service.applyHeldChanges();

      expect(applied).toBe(0);
    });

    it('applies changes at once when not held', () => {
      const service = TestBed.inject(FiltersService);

      service.setShowRareItems(false);

      expect(latest(service.getItemFilters()).showRareItems).toBe(false);
      expect(latest(service.getEditedFilters()).showRareItems).toBe(false);
    });

    it('lets a navigation replace the filters at once, held changes and all', () => {
      const service = TestBed.inject(FiltersService);
      const queryParams = TestBed.inject(QueryParamsService);

      service.holdChanges();
      service.setShowRaidItems(false);
      queryParams.applyDecodedBuildParams({ rare: 'false' });

      for (const filters of [latest(service.getItemFilters()), latest(service.getEditedFilters())]) {
        expect(filters.showRaidItems).toBe(true);
        expect(filters.showRareItems).toBe(false);
      }

      // Still held afterwards.
      service.setShowRaidItems(false);
      expect(latest(service.getItemFilters()).showRaidItems).toBe(true);
    });
  });
});
