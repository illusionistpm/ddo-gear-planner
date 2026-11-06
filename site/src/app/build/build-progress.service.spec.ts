import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { environment } from '../../environments/environment';
import { BuildProgressService, buildProgressFailureOf } from './build-progress.service';

describe('BuildProgressService', () => {
  const api = `${environment.apiBaseUrl}/api`;
  let service: BuildProgressService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(BuildProgressService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.unstubAllGlobals();
  });

  it('reads and writes the owner\'s doc by build id', () => {
    service.getOwn('build-1').subscribe();
    const get = httpMock.expectOne(`${api}/builds/build-1/progress`);
    expect(get.request.method).toBe('GET');
    get.flush({});

    const body = { patch: { k: 1 as const, j: null }, picksPatch: { Thing: ['Quest'] }, needed: ['k'], route: { Thing: ['Quest'] } };
    service.put('build-1', body).subscribe();
    const put = httpMock.expectOne(`${api}/builds/build-1/progress`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual(body);
    put.flush({});
  });

  describe('flushWithKeepalive', () => {
    it('sends the write with keepalive and the given token, outside HttpClient', () => {
      const fetchSpy = vi.fn().mockResolvedValue(new Response(null));
      vi.stubGlobal('fetch', fetchSpy);

      const sent = service.flushWithKeepalive('build-1', { patch: { k: 1 } }, 'token-1');

      expect(sent).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(`${api}/builds/build-1/progress`, {
        method: 'PUT',
        keepalive: true,
        headers: { 'Authorization': 'Bearer token-1', 'Content-Type': 'application/json' },
        body: '{"patch":{"k":1}}'
      });
      httpMock.expectNone(() => true);
    });

    it('does not send a body too big for keepalive', () => {
      const fetchSpy = vi.fn().mockResolvedValue(new Response(null));
      vi.stubGlobal('fetch', fetchSpy);

      const sent = service.flushWithKeepalive('build-1', { needed: ['k'.repeat(70000)], route: {} }, 'token-1');

      expect(sent).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('swallows a failed send', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));

      expect(service.flushWithKeepalive('build-1', { patch: { k: 1 } }, 'token-1')).toBe(true);
      await Promise.resolve();
    });
  });
});

describe('buildProgressFailureOf', () => {
  function httpError(status: number, error: unknown = null): HttpErrorResponse {
    return new HttpErrorResponse({ status, error });
  }

  it.each([
    [httpError(429, { error: 'x', retryAfterMs: 700 }), { kind: 'throttled', retryAfterMs: 700 }],
    [httpError(429, null), { kind: 'throttled', retryAfterMs: 1500 }],
    [httpError(429, { error: 'x', dailyCapReached: true }), { kind: 'daily-cap' }],
    [httpError(401), { kind: 'unauthorized' }],
    [httpError(403), { kind: 'not-owned' }],
    [httpError(404), { kind: 'not-owned' }],
    [httpError(400), { kind: 'rejected' }],
    [httpError(413), { kind: 'rejected' }],
    [httpError(0), { kind: 'unavailable' }],
    [httpError(500), { kind: 'unavailable' }],
    [new Error('token exchange failed'), { kind: 'unavailable' }]
  ])('reads %s as %o', (error, failure) => {
    expect(buildProgressFailureOf(error)).toEqual(failure);
  });
});
