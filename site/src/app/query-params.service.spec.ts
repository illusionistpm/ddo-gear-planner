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
          navigate: jasmine.createSpy('navigate')
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
        replaceUrl: true,
        queryParamsHandling: 'merge'
      })
    );
  });
});
