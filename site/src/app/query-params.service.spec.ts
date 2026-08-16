import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { QueryParamsService } from './query-params.service';

describe('QueryParamsService', () => {
  beforeEach(() => TestBed.configureTestingModule({
    providers: [
      {
        provide: Router,
        useValue: {
          url: '',
          navigate: jasmine.createSpy('navigate').and.returnValue(Promise.resolve(true))
        }
      }
    ]
  }));

  it('should be created', () => {
    const service: QueryParamsService = TestBed.inject(QueryParamsService);
    expect(service).toBeTruthy();
  });

  it('preserves the incoming hash route path when syncing query params', () => {
    const router = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    const service: QueryParamsService = TestBed.inject(QueryParamsService);
    const source = new BehaviorSubject<any>({ levelrange: '1,36' });

    window.location.hash = '#/main?levelrange=1,36';

    const navigateFn = (service as any)._makeNavigateFn(['source', source]);
    navigateFn({ levelrange: '1,36' });

    expect(router.navigate).toHaveBeenCalledWith(
      ['main'],
      jasmine.objectContaining({
        queryParams: { levelrange: '1,36' },
        replaceUrl: false
      })
    );
    const navigateOptions = router.navigate.calls.mostRecent().args[1] as any;
    expect(navigateOptions.queryParamsHandling).toBeUndefined();
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

    expect(router.navigate).not.toHaveBeenCalled();

    source.next({ tracked: ['Strength', 'Constitution'] });

    expect(router.navigate).toHaveBeenCalledWith(
      [],
      jasmine.objectContaining({
        queryParams: { tracked: ['Strength', 'Constitution'] },
        replaceUrl: false
      })
    );
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
});
