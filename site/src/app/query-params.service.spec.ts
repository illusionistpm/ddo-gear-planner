import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { BuildUrlCodecService } from './build-url-codec.service';
import { QueryParamsService } from './query-params.service';

describe('QueryParamsService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Router,
          useValue: {
            url: '',
            navigate: jasmine.createSpy('navigate').and.returnValue(Promise.resolve(true))
          }
        }
      ]
    });
  });

  it('should be created', () => {
    const service: QueryParamsService = TestBed.inject(QueryParamsService);
    expect(service).toBeTruthy();
  });

  it('preserves the current (root) route path when syncing query params', () => {
    const router = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    (router as any).url = '/';
    const service: QueryParamsService = TestBed.inject(QueryParamsService);
    const source = new BehaviorSubject<any>({ levelrange: '1,36' });

    const navigateFn = (service as any)._makeNavigateFn(['source', source]);
    navigateFn({ levelrange: '1,36' });

    expect(router.navigate).toHaveBeenCalledWith(
      [],
      jasmine.objectContaining({
        queryParams: { b: jasmine.stringMatching(/^z1\./) },
        replaceUrl: false
      })
    );
    const queryParams = router.navigate.calls.mostRecent().args[1]?.queryParams as any;
    const codec = TestBed.inject(BuildUrlCodecService);
    expect(codec.decode(queryParams.b)).toEqual({ levelrange: '1,36' });
    const navigateOptions = router.navigate.calls.mostRecent().args[1] as any;
    expect(navigateOptions.queryParamsHandling).toBeUndefined();
  });

  it('preserves a build route path (with shortId/slug segments) when syncing query params', () => {
    const router = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    (router as any).url = '/build/ab12cd34/my-build';
    const service: QueryParamsService = TestBed.inject(QueryParamsService);
    const source = new BehaviorSubject<any>({ levelrange: '1,36' });

    const navigateFn = (service as any)._makeNavigateFn(['source', source]);
    navigateFn({ levelrange: '1,36' });

    expect(router.navigate).toHaveBeenCalledWith(
      ['build', 'ab12cd34', 'my-build'],
      jasmine.objectContaining({
        queryParams: { b: jasmine.stringMatching(/^z1\./) },
        replaceUrl: false
      })
    );
    const queryParams = router.navigate.calls.mostRecent().args[1]?.queryParams as any;
    const codec = TestBed.inject(BuildUrlCodecService);
    expect(codec.decode(queryParams.b)).toEqual({ levelrange: '1,36' });
  });

  it('applies every URL param update to listeners', () => {
    const service: QueryParamsService = TestBed.inject(QueryParamsService);
    const listener = {
      updateFromParams: jasmine.createSpy('updateFromParams')
    };
    const firstParams = { keys: ['levelrange'], get: (key: string) => key === 'levelrange' ? '1,30' : null, getAll: () => [] };
    const secondParams = { keys: ['levelrange'], get: (key: string) => key === 'levelrange' ? '5,20' : null, getAll: () => [] };

    service.subscribe(listener);

    service.updateFromParams(firstParams);
    service.updateFromParams(secondParams);

    expect(listener.updateFromParams).toHaveBeenCalledTimes(2);
    expect(listener.updateFromParams.calls.argsFor(0)[0]).toBe(firstParams);
    expect(listener.updateFromParams.calls.argsFor(1)[0]).toBe(secondParams);
  });

  it('does not write URL history while applying URL params', () => {
    const router = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    const service: QueryParamsService = TestBed.inject(QueryParamsService);
    const source = new BehaviorSubject<any>(null);
    const params = { keys: ['tracked'], get: () => null, getAll: () => ['Strength'] };
    const listener = {
      updateFromParams: () => source.next({ tracked: ['Strength'] })
    };

    service.register('source', source);
    service.subscribe(listener);
    service.updateFromParams(params);

    expect(router.navigate).toHaveBeenCalledWith(
      [],
      jasmine.objectContaining({
        queryParams: { b: jasmine.stringMatching(/^z1\./) },
        replaceUrl: true
      })
    );

    source.next({ tracked: ['Strength', 'Constitution'] });

    expect(router.navigate).toHaveBeenCalledWith(
      [],
      jasmine.objectContaining({
        queryParams: { b: jasmine.stringMatching(/^z1\./) },
        replaceUrl: false
      })
    );
    const latestQueryParams = router.navigate.calls.mostRecent().args[1]?.queryParams as any;
    expect(TestBed.inject(BuildUrlCodecService).decode(latestQueryParams.b))
      .toEqual({ tracked: ['Strength', 'Constitution'] });
  });

  it('marks the next hashchange as app-originated when syncing query params', () => {
    const service: QueryParamsService = TestBed.inject(QueryParamsService);
    const source = new BehaviorSubject<any>({ tracked: ['Strength'] });

    expect(service.consumeAppUrlWrite()).toBeFalse();

    const navigateFn = (service as any)._makeNavigateFn(['source', source]);
    navigateFn({ tracked: ['Strength'] });

    expect(service.consumeAppUrlWrite()).toBeTrue();
    expect(service.consumeAppUrlWrite()).toBeFalse();
  });

  it('decodes compact URL params before applying them to listeners', () => {
    const service: QueryParamsService = TestBed.inject(QueryParamsService);
    const codec = TestBed.inject(BuildUrlCodecService);
    const listener = {
      updateFromParams: jasmine.createSpy('updateFromParams')
    };
    const compactParam = codec.encode({
      levelrange: '1,18',
      Weapon: 'Calamitous Battle Axe',
      tracked: ['Strength', 'False Life (%)'],
      tab: 'affixes'
    });

    service.subscribe(listener);
    service.updateFromParams({
      keys: ['b'],
      get: (key: string) => key === 'b' ? compactParam : null,
      getAll: (key: string) => key === 'b' ? [compactParam] : []
    });

    const params = listener.updateFromParams.calls.mostRecent().args[0];
    expect(params.get('levelrange')).toBe('1,18');
    expect(params.get('Weapon')).toBe('Calamitous Battle Axe');
    expect(params.getAll('tracked')).toEqual(['Strength', 'False Life (%)']);
    expect(params.get('tab')).toBe('affixes');
  });

  it('preserves route-level params alongside compact URL params', () => {
    const router = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    const service: QueryParamsService = TestBed.inject(QueryParamsService);
    const codec = TestBed.inject(BuildUrlCodecService);
    const source = new BehaviorSubject<any>(null);
    const listener = {
      updateFromParams: jasmine.createSpy('updateFromParams').and.callFake((params: any) => {
        source.next({ tracked: params.getAll('tracked') });
      })
    };
    const compactParam = codec.encode({ tracked: ['Strength'] });

    service.register('source', source);
    service.subscribe(listener);
    service.updateFromParams({
      keys: ['b', 'tab'],
      get: (key: string) => key === 'b' ? compactParam : (key === 'tab' ? 'affixes' : null),
      getAll: (key: string) => key === 'b' ? [compactParam] : (key === 'tab' ? ['affixes'] : [])
    });

    const params = listener.updateFromParams.calls.mostRecent().args[0];
    expect(params.getAll('tracked')).toEqual(['Strength']);
    expect(params.get('tab')).toBe('affixes');

    const queryParams = router.navigate.calls.mostRecent().args[1]?.queryParams as any;
    expect(router.navigate.calls.mostRecent().args[1]?.replaceUrl).toBeTrue();
    expect(codec.decode(queryParams.b)).toEqual({ tracked: ['Strength'], tab: 'affixes' });
  });

  it('external route-level params override stale compact route params', () => {
    const service: QueryParamsService = TestBed.inject(QueryParamsService);
    const codec = TestBed.inject(BuildUrlCodecService);
    const listener = {
      updateFromParams: jasmine.createSpy('updateFromParams')
    };
    const compactParam = codec.encode({ tracked: ['Strength'], tab: 'equipment' });

    service.subscribe(listener);
    service.updateFromParams({
      keys: ['b', 'tab'],
      get: (key: string) => key === 'b' ? compactParam : (key === 'tab' ? 'affixes' : null),
      getAll: (key: string) => key === 'b' ? [compactParam] : (key === 'tab' ? ['affixes'] : [])
    });

    const params = listener.updateFromParams.calls.mostRecent().args[0];
    expect(params.get('tab')).toBe('affixes');
  });

  it('canonicalizes legacy params with replaceUrl', () => {
    const router = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    const service: QueryParamsService = TestBed.inject(QueryParamsService);
    const source = new BehaviorSubject<any>(null);
    const listener = {
      updateFromParams: () => source.next({ tracked: ['Strength'] })
    };

    service.register('source', source);
    service.subscribe(listener);
    service.updateFromParams({
      keys: ['tracked', 'tab'],
      get: (key: string) => key === 'tab' ? 'affixes' : null,
      getAll: (key: string) => key === 'tracked' ? ['Strength'] : (key === 'tab' ? ['affixes'] : [])
    });

    const queryParams = router.navigate.calls.mostRecent().args[1]?.queryParams as any;
    expect(router.navigate.calls.mostRecent().args[1]?.replaceUrl).toBeTrue();
    expect(TestBed.inject(BuildUrlCodecService).decode(queryParams.b))
      .toEqual({ tracked: ['Strength'], tab: 'affixes' });
  });

  it('canonicalizes legacy params directly from the URL without waiting for listeners to publish state', () => {
    const router = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    const service: QueryParamsService = TestBed.inject(QueryParamsService);

    service.updateFromParams({
      keys: ['levelrange', 'tracked', 'tracked', 'tab'],
      get: (key: string) => key === 'levelrange' ? '1,36' : (key === 'tab' ? 'affixes' : null),
      getAll: (key: string) => {
        if (key === 'levelrange') return ['1,36'];
        if (key === 'tracked') return ['Strength', 'Constitution'];
        if (key === 'tab') return ['affixes'];
        return [];
      }
    });

    const queryParams = router.navigate.calls.mostRecent().args[1]?.queryParams as any;
    expect(router.navigate.calls.mostRecent().args[1]?.replaceUrl).toBeTrue();
    expect(TestBed.inject(BuildUrlCodecService).decode(queryParams.b))
      .toEqual({
        levelrange: '1,36',
        tracked: ['Strength', 'Constitution'],
        tab: 'affixes'
      });
  });

  it('falls back to legacy params when compact decode fails', () => {
    const service: QueryParamsService = TestBed.inject(QueryParamsService);
    const listener = {
      updateFromParams: jasmine.createSpy('updateFromParams')
    };

    service.subscribe(listener);
    service.updateFromParams({
      keys: ['b', 'tracked'],
      get: (key: string) => key === 'b' ? 'z1.not-valid' : null,
      getAll: (key: string) => key === 'b' ? ['z1.not-valid'] : (key === 'tracked' ? ['Strength'] : [])
    });

    const params = listener.updateFromParams.calls.mostRecent().args[0];
    expect(params.getAll('tracked')).toEqual(['Strength']);
    expect(params.get('b')).toBeNull();
  });
});
