import { TestBed } from '@angular/core/testing';
import { HTTP_INTERCEPTORS, HttpClient, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Auth0ClientService, AuthHttpInterceptor, AuthModule } from '@auth0/auth0-angular';

import { environment } from '../../environments/environment';
import { authHttpInterceptorConfig } from './auth-http-config';

// Drives the real AuthHttpInterceptor with this app's allowedList against a
// fake Auth0Client, so what's pinned is which requests ask Auth0 for a token
// and what happens when that ask fails - not the SDK's internals.
describe('authHttpInterceptorConfig', () => {
  const api = `${environment.apiBaseUrl}/api`;
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let getTokenSilently: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getTokenSilently = vi.fn().mockResolvedValue('access-token');
    TestBed.configureTestingModule({
      imports: [AuthModule.forRoot({ domain: 'example.auth0.com', clientId: 'client', httpInterceptor: authHttpInterceptorConfig })],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        { provide: HTTP_INTERCEPTORS, useClass: AuthHttpInterceptor, multi: true },
        {
          provide: Auth0ClientService,
          useValue: {
            checkSession: vi.fn().mockResolvedValue(undefined),
            getTokenSilently,
            isAuthenticated: vi.fn().mockResolvedValue(false),
            getUser: vi.fn().mockResolvedValue(undefined),
            getIdTokenClaims: vi.fn().mockResolvedValue(undefined)
          }
        }
      ]
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // The interceptor waits for the SDK's startup session check (a promise)
  // and then the token fetch (another) before the request reaches the
  // backend - let both settle.
  async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) {
      await new Promise(resolve => setTimeout(resolve));
    }
  }

  async function send(method: 'GET' | 'POST', url: string): Promise<{ error?: unknown }> {
    const outcome: { error?: unknown } = {};
    http.request(method, url).subscribe({ error: error => outcome.error = error });
    await settle();
    return outcome;
  }

  it.each([
    ['GET', `${api}/users/me`],
    ['GET', `${api}/builds/mine`],
    ['POST', `${api}/builds`],
    ['POST', `${api}/shortlinks`]
  ] as const)('attaches a Bearer token to %s %s', async (method, url) => {
    await send(method, url);

    const req = httpMock.expectOne(url);
    expect(req.request.headers.get('Authorization')).toBe('Bearer access-token');
    req.flush({});
  });

  it('asks for no token on a URL outside the API', async () => {
    await send('GET', 'https://example.com/other');

    const req = httpMock.expectOne('https://example.com/other');
    expect(req.request.headers.has('Authorization')).toBe(false);
    expect(getTokenSilently).not.toHaveBeenCalled();
    req.flush({});
  });

  it('attaches a token to the public shared-build fetch when one is available', async () => {
    await send('GET', `${api}/build/abc123`);

    const req = httpMock.expectOne(`${api}/build/abc123`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer access-token');
    req.flush({});
  });

  it('sends the public shared-build fetch anonymously when signed out', async () => {
    getTokenSilently.mockRejectedValue({ error: 'missing_refresh_token' });

    await send('GET', `${api}/build/abc123`);

    const req = httpMock.expectOne(`${api}/build/abc123`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('fails the public shared-build fetch when the refresh token is dead', async () => {
    getTokenSilently.mockRejectedValue({ error: 'invalid_grant' });

    const outcome = await send('GET', `${api}/build/abc123`);

    httpMock.expectNone(`${api}/build/abc123`);
    expect(outcome.error).toEqual({ error: 'invalid_grant' });
  });
});
