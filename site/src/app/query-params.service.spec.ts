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

  it('emits combinedParamsChanges on both a genuine edit and a URL-driven load', () => {
    // combinedParamsChanges must fire on a URL-driven apply too, not just a
    // live edit - CurrentBuildService's dirty-tracking depends on seeing
    // every recompute, including a build load and a browser back/forward
    // restore, or it can be left comparing against the wrong baseline (see
    // this stream's own comment for the regression that motivated this).
    const service: QueryParamsService = TestBed.inject(QueryParamsService);
    const source = new BehaviorSubject<any>(null);
    const listener = {
      updateFromParams: () => source.next({ tracked: ['Strength'] })
    };
    const emissions: any[] = [];
    service.combinedParamsChanges.subscribe(value => emissions.push(value));

    service.register('source', source);
    service.subscribe(listener);
    service.updateFromParams({ keys: ['tracked'], get: () => null, getAll: () => ['Strength'] });

    // The BehaviorSubject's own seed value ({}), then the load itself.
    expect(emissions).toEqual([{}, { tracked: ['Strength'] }]);

    source.next({ tracked: ['Strength', 'Constitution'] });

    expect(emissions).toEqual([{}, { tracked: ['Strength'] }, { tracked: ['Strength', 'Constitution'] }]);
    expect(service.getCombinedParams()).toEqual({ tracked: ['Strength', 'Constitution'] });
  });

  it('applies an already-decoded build record directly to listeners, bypassing URL decoding', () => {
    const service: QueryParamsService = TestBed.inject(QueryParamsService);
    const listener = { updateFromParams: jasmine.createSpy('updateFromParams') };
    service.subscribe(listener);

    service.applyDecodedBuildParams({ Weapon: 'Calamitous Battle Axe', tracked: ['Strength', 'Constitution'] });

    const params = listener.updateFromParams.calls.mostRecent().args[0];
    expect(params.get('Weapon')).toBe('Calamitous Battle Axe');
    expect(params.getAll('tracked')).toEqual(['Strength', 'Constitution']);
  });

  it('does not write URL history while applying decoded build params', () => {
    const router = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    const service: QueryParamsService = TestBed.inject(QueryParamsService);

    service.applyDecodedBuildParams({ Weapon: 'Calamitous Battle Axe' });

    expect(router.navigate).not.toHaveBeenCalled();
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

  it('does not canonicalize Auth0 callback params (code/state) or hand them to listeners', () => {
    // Regression test: Auth0's login redirect lands on the bare app root
    // carrying ?code=...&state=... (see app.module.ts's redirect_uri and
    // MainComponent's isOnAuthRedirectCallbackUrl()). Treating these as
    // ordinary "legacy" params would canonicalize them into a `b` blob via
    // a real navigation, overwriting the URL's code/state well before
    // Auth0's own async token exchange finishes and reads it - which is
    // exactly the race that caused a "start page" flash on sign-in even
    // after MainComponent started checking the URL for code/state, since
    // this canonicalize navigation had already stripped them by then.
    const router = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    const service: QueryParamsService = TestBed.inject(QueryParamsService);
    const listener = {
      updateFromParams: jasmine.createSpy('updateFromParams')
    };
    service.subscribe(listener);

    service.updateFromParams({
      keys: ['code', 'state'],
      get: (key: string) => key === 'code' ? 'abc' : (key === 'state' ? 'xyz' : null),
      getAll: (key: string) => key === 'code' ? ['abc'] : (key === 'state' ? ['xyz'] : [])
    });

    expect(router.navigate).not.toHaveBeenCalled();
    const appliedParams = listener.updateFromParams.calls.mostRecent().args[0];
    expect(appliedParams.keys).toEqual([]);
  });

  it('navigates to root (not a no-op) once a build identity is set on a build-shortId route', () => {
    // Router.navigate([], ...) with zero commands and no relativeTo means
    // "stay exactly where you are, just change query params" - NOT "go to
    // root". An earlier version of this exact drop-the-shortId behavior
    // shipped with [] here and silently did nothing, since the current URL
    // was already the build route being "dropped" from.
    const router = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    (router as any).url = '/build/ab12cd34/my-build';
    const service: QueryParamsService = TestBed.inject(QueryParamsService);
    const source = new BehaviorSubject<any>({ levelrange: '1,36' });

    service.setBuildIdentityForUrl({ shortId: 'ab12cd34', name: 'My Build' });
    const navigateFn = (service as any)._makeNavigateFn(['source', source]);
    navigateFn({ levelrange: '1,36' });

    expect(router.navigate).toHaveBeenCalledWith(
      ['/'],
      jasmine.objectContaining({ replaceUrl: false })
    );
  });

  it('does not drop the build route path when no identity has been set', () => {
    const router = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    (router as any).url = '/build/ab12cd34/my-build';
    const service: QueryParamsService = TestBed.inject(QueryParamsService);
    const source = new BehaviorSubject<any>({ levelrange: '1,36' });

    const navigateFn = (service as any)._makeNavigateFn(['source', source]);
    navigateFn({ levelrange: '1,36' });

    expect(router.navigate).toHaveBeenCalledWith(
      ['build', 'ab12cd34', 'my-build'],
      jasmine.objectContaining({ replaceUrl: false })
    );
  });

  it('restores a build identity decoded from the URL and keeps it out of gear/filter params handed to listeners', () => {
    const service: QueryParamsService = TestBed.inject(QueryParamsService);
    const codec = TestBed.inject(BuildUrlCodecService);
    const listener = { updateFromParams: jasmine.createSpy('updateFromParams') };
    const identityEmissions: any[] = [];
    service.buildIdentityFromUrl$.subscribe(value => identityEmissions.push(value));

    service.setBuildIdentityForUrl({ shortId: 'ab12cd34', name: 'My Build' });
    const withIdentity = (service as any).withBuildIdentityForUrl({ Weapon: 'Calamitous Battle Axe' });
    const compactParam = codec.encode(withIdentity);

    service.subscribe(listener);
    service.updateFromParams({
      keys: ['b'],
      get: (key: string) => key === 'b' ? compactParam : null,
      getAll: (key: string) => key === 'b' ? [compactParam] : []
    });

    const params = listener.updateFromParams.calls.mostRecent().args[0];
    expect(params.get('Weapon')).toBe('Calamitous Battle Axe');
    expect(params.keys).not.toContain('__buildRef');
    expect(identityEmissions).toEqual([{ shortId: 'ab12cd34', name: 'My Build' }]);
  });

  it('never leaks the build identity into getCombinedParams (the save-payload composer)', () => {
    const service: QueryParamsService = TestBed.inject(QueryParamsService);
    const codec = TestBed.inject(BuildUrlCodecService);
    const listener = { updateFromParams: jasmine.createSpy('updateFromParams') };
    const withIdentity = { Weapon: 'Calamitous Battle Axe', __buildRef: JSON.stringify({ shortId: 'ab12cd34', name: 'My Build' }) };
    const compactParam = codec.encode(withIdentity);

    service.subscribe(listener);
    service.updateFromParams({
      keys: ['b'],
      get: (key: string) => key === 'b' ? compactParam : null,
      getAll: (key: string) => key === 'b' ? [compactParam] : []
    });

    expect(service.getCombinedParams()).toEqual({ Weapon: 'Calamitous Battle Axe' });
  });

  it('ignores a stale savedBuildId in a bookmarked/pre-existing URL - it is no longer read at all', () => {
    // A URL minted before savedBuildId was removed from the identity JSON
    // may still be sitting in someone's bookmarks or browser history. It
    // must decode exactly as if that field were never there, not error out
    // or (worse) resurrect ownership from it.
    const service: QueryParamsService = TestBed.inject(QueryParamsService);
    const codec = TestBed.inject(BuildUrlCodecService);
    const listener = { updateFromParams: jasmine.createSpy('updateFromParams') };
    const identityEmissions: any[] = [];
    service.buildIdentityFromUrl$.subscribe(value => identityEmissions.push(value));
    const withStaleIdentity = {
      Weapon: 'Calamitous Battle Axe',
      __buildRef: JSON.stringify({ shortId: 'ab12cd34', name: 'My Build', savedBuildId: 'build-1' })
    };
    const compactParam = codec.encode(withStaleIdentity);

    service.subscribe(listener);
    service.updateFromParams({
      keys: ['b'],
      get: (key: string) => key === 'b' ? compactParam : null,
      getAll: (key: string) => key === 'b' ? [compactParam] : []
    });

    expect(identityEmissions).toEqual([{ shortId: 'ab12cd34', name: 'My Build' }]);
  });

  it('round-trips a name-only identity (null shortId) for a never-saved build', () => {
    const service: QueryParamsService = TestBed.inject(QueryParamsService);
    const codec = TestBed.inject(BuildUrlCodecService);
    const listener = { updateFromParams: jasmine.createSpy('updateFromParams') };
    const identityEmissions: any[] = [];
    service.buildIdentityFromUrl$.subscribe(value => identityEmissions.push(value));

    service.setBuildIdentityForUrl({ shortId: null, name: 'My New Build' });
    const withIdentity = (service as any).withBuildIdentityForUrl({ Weapon: 'Calamitous Battle Axe' });
    const compactParam = codec.encode(withIdentity);

    service.subscribe(listener);
    service.updateFromParams({
      keys: ['b'],
      get: (key: string) => key === 'b' ? compactParam : null,
      getAll: (key: string) => key === 'b' ? [compactParam] : []
    });

    expect(identityEmissions).toEqual([{ shortId: null, name: 'My New Build' }]);
  });

  it('refreshLiveEditUrl forces the current identity+params into the URL immediately, with replaceUrl', () => {
    const router = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    (router as any).url = '/';
    const service: QueryParamsService = TestBed.inject(QueryParamsService);
    const source = new BehaviorSubject<any>({ levelrange: '1,36' });
    service.register('source', source);
    // register() alone doesn't subscribe until initialPageLoad flips false -
    // applyDecodedBuildParams (a no-op load) flips it, as in production.
    service.applyDecodedBuildParams({});
    service.setBuildIdentityForUrl({ shortId: null, name: 'My New Build' });

    service.refreshLiveEditUrl();

    const call = router.navigate.calls.mostRecent();
    expect(call.args[1]?.replaceUrl).toBeTrue();
    const codec = TestBed.inject(BuildUrlCodecService);
    const queryParams = call.args[1]?.queryParams as any;
    expect(codec.decode(queryParams.b)).toEqual({
      levelrange: '1,36',
      __buildRef: JSON.stringify({ shortId: null, name: 'My New Build' })
    });
  });

  it('emits a null build identity when the current URL carries none', () => {
    const service: QueryParamsService = TestBed.inject(QueryParamsService);
    const identityEmissions: any[] = [];
    service.buildIdentityFromUrl$.subscribe(value => identityEmissions.push(value));

    service.updateFromParams({ keys: [], get: () => null, getAll: () => [] });

    expect(identityEmissions).toEqual([null]);
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
