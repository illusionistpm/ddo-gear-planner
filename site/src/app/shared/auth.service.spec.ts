import type { MockedObject } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { AuthService as Auth0Service } from '@auth0/auth0-angular';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

const POST_LOGOUT_RETURN_TO_KEY = 'auth.postLogoutReturnTo';
const SIGN_IN_RETURN_TO_KEY = 'auth.signInReturnTo';

describe('AuthService', () => {
  let httpMock: HttpTestingController;
  let isAuthenticated$: BehaviorSubject<boolean>;
  let auth0: MockedObject<Auth0Service>;
  let error$: Subject<Error>;
  let isLoading$: BehaviorSubject<boolean>;

  function create(): AuthService {
    isAuthenticated$ = new BehaviorSubject<boolean>(false);
    error$ = new Subject<Error>();
    isLoading$ = new BehaviorSubject<boolean>(false);
    auth0 = {
      loginWithRedirect: vi.fn().mockName('Auth0Service.loginWithRedirect'),
      logout: vi.fn().mockName('Auth0Service.logout'),
      getAccessTokenSilently: vi.fn().mockName('Auth0Service.getAccessTokenSilently'),
      isAuthenticated$,
      error$,
      user$: of(null),
      isLoading$
    } as unknown as MockedObject<Auth0Service>;
    auth0.logout.mockReturnValue(of(undefined));

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, RouterTestingModule.withRoutes([])],
      providers: [{ provide: Auth0Service, useValue: auth0 }]
    });

    httpMock = TestBed.inject(HttpTestingController);
    return TestBed.inject(AuthService);
  }

  afterEach(() => {
    httpMock.verify();
    sessionStorage.removeItem(POST_LOGOUT_RETURN_TO_KEY);
    sessionStorage.removeItem(SIGN_IN_RETURN_TO_KEY);
  });

  it('calls GET /api/users/me once when isAuthenticated$ transitions to true', () => {
    create();

    isAuthenticated$.next(true);

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/api/users/me`);
    expect(req.request.method).toBe('GET');
    req.flush({ id: 'user-1', email: null, displayName: null, buildCount: 0 });
  });

  it('does not call it while never authenticated', () => {
    create();

    httpMock.expectNone(`${environment.apiBaseUrl}/api/users/me`);
  });

  it('does not re-call it on a redundant true emission', () => {
    create();

    isAuthenticated$.next(true);
    httpMock.expectOne(`${environment.apiBaseUrl}/api/users/me`).flush({ id: 'user-1', email: null, displayName: null, buildCount: 0 });

    isAuthenticated$.next(true);
    httpMock.expectNone(`${environment.apiBaseUrl}/api/users/me`);
  });

  it('calls it again after a sign-out/sign-in cycle', () => {
    create();

    isAuthenticated$.next(true);
    httpMock.expectOne(`${environment.apiBaseUrl}/api/users/me`).flush({ id: 'user-1', email: null, displayName: null, buildCount: 0 });

    isAuthenticated$.next(false);
    isAuthenticated$.next(true);
    httpMock.expectOne(`${environment.apiBaseUrl}/api/users/me`).flush({ id: 'user-1', email: null, displayName: null, buildCount: 0 });
  });

  it('does not throw if the call fails', () => {
    create();

    isAuthenticated$.next(true);
    const req = httpMock.expectOne(`${environment.apiBaseUrl}/api/users/me`);

    expect(() => req.flush('nope', { status: 500, statusText: 'Server Error' })).not.toThrow();
  });

  describe('signOut', () => {
    const originalUrl = window.location.pathname + window.location.search;

    afterEach(() => {
      window.history.replaceState(null, '', originalUrl);
    });

    it('stashes the current path, query and fragment and logs out with a bare-origin returnTo', () => {
      const service = create();
      window.history.replaceState(null, '', '/build/abc123/my-build?b=z1.test#shopping-list');

      service.signOut();

      expect(sessionStorage.getItem(POST_LOGOUT_RETURN_TO_KEY)).toBe('/build/abc123/my-build?b=z1.test#shopping-list');
      expect(auth0.logout).toHaveBeenCalledWith({
        logoutParams: { returnTo: window.location.origin }
      });
    });
  });

  describe('a session that can no longer get tokens', () => {
    // auth0-spa-js's GenericError shape: message plus an OAuth error code.
    function tokenError(error: string): Error {
      return Object.assign(new Error(error), { error, error_description: error });
    }

    it.each(['invalid_grant', 'missing_refresh_token'])('clears the local session, without redirecting, on %s', code => {
      create();

      error$.next(tokenError(code));

      expect(auth0.logout).toHaveBeenCalledWith({ openUrl: false });
    });

    it('leaves the session alone for other errors', () => {
      create();

      error$.next(tokenError('login_required'));
      error$.next(new Error('network down'));

      expect(auth0.logout).not.toHaveBeenCalled();
    });
  });

  describe('a failed login', () => {
    const originalUrl = window.location.pathname + window.location.search;

    function landOnLoginCallback(): void {
      window.history.replaceState(null, '', '/?code=abc&state=xyz');
    }

    afterEach(() => {
      window.history.replaceState(null, '', originalUrl);
    });

    it('signIn stashes the current path, query and fragment alongside appState', () => {
      const service = create();
      window.history.replaceState(null, '', '/build/abc123/my-build?b=z1.test#shopping-list');

      service.signIn();

      const target = '/build/abc123/my-build?b=z1.test#shopping-list';
      expect(sessionStorage.getItem(SIGN_IN_RETURN_TO_KEY)).toBe(target);
      expect(auth0.loginWithRedirect).toHaveBeenCalledWith({ appState: { target } });
    });

    it('navigates back to the stashed build when the callback errors, and clears it', () => {
      sessionStorage.setItem(SIGN_IN_RETURN_TO_KEY, '/build/abc123/my-build');
      landOnLoginCallback();
      const navigateSpy = vi.spyOn(Router.prototype, 'navigateByUrl').mockResolvedValue(true);
      create();

      error$.next(Object.assign(new Error('denied'), { error: 'access_denied' }));

      expect(navigateSpy).toHaveBeenCalledWith('/build/abc123/my-build', { replaceUrl: true });
      expect(sessionStorage.getItem(SIGN_IN_RETURN_TO_KEY)).toBeNull();
    });

    it('drops a stash left by an abandoned login on any other load, and never acts on it', () => {
      sessionStorage.setItem(SIGN_IN_RETURN_TO_KEY, '/build/abc123/my-build');
      const navigateSpy = vi.spyOn(Router.prototype, 'navigateByUrl').mockResolvedValue(true);
      create();

      expect(sessionStorage.getItem(SIGN_IN_RETURN_TO_KEY)).toBeNull();
      error$.next(new Error('network down'));
      expect(navigateSpy).not.toHaveBeenCalled();
    });

    it('clears the stash once the login succeeds', () => {
      sessionStorage.setItem(SIGN_IN_RETURN_TO_KEY, '/build/abc123/my-build');
      landOnLoginCallback();
      create();

      isAuthenticated$.next(true);
      httpMock.expectOne(`${environment.apiBaseUrl}/api/users/me`).flush({});

      expect(sessionStorage.getItem(SIGN_IN_RETURN_TO_KEY)).toBeNull();
    });
  });

  describe('getAccessToken', () => {
    function signedIn(): AuthService {
      const service = create();
      isAuthenticated$.next(true);
      httpMock.expectOne(`${environment.apiBaseUrl}/api/users/me`).flush({});
      return service;
    }

    it('returns a token while signed in', async () => {
      const service = signedIn();
      auth0.getAccessTokenSilently.mockReturnValue(of('token-1') as never);

      expect(await service.getAccessToken()).toBe('token-1');
    });

    it('returns null while signed out, without asking for a token', async () => {
      const service = create();

      expect(await service.getAccessToken()).toBeNull();
      expect(auth0.getAccessTokenSilently).not.toHaveBeenCalled();
    });

    it('waits for the startup session check before deciding', async () => {
      const service = create();
      isLoading$.next(true);
      auth0.getAccessTokenSilently.mockReturnValue(of('token-1') as never);

      const token = service.getAccessToken();
      isAuthenticated$.next(true);
      httpMock.expectOne(`${environment.apiBaseUrl}/api/users/me`).flush({});
      isLoading$.next(false);

      expect(await token).toBe('token-1');
    });

    it('stops asking for the rest of the page\'s life once an exchange fails', async () => {
      const service = signedIn();
      auth0.getAccessTokenSilently.mockReturnValue(throwError(() => ({ error: 'login_required' })) as never);

      expect(await service.getAccessToken()).toBeNull();
      auth0.getAccessTokenSilently.mockReturnValue(of('token-1') as never);
      expect(await service.getAccessToken()).toBeNull();
      expect(auth0.getAccessTokenSilently).toHaveBeenCalledTimes(1);
    });
  });

  describe('post-logout restore', () => {
    it('navigates back to a stashed path once and clears it', () => {
      sessionStorage.setItem(POST_LOGOUT_RETURN_TO_KEY, '/build/abc123/my-build?foo=bar');
      const navigateSpy = vi.spyOn(Router.prototype, 'navigateByUrl').mockResolvedValue(true);

      create();

      expect(navigateSpy).toHaveBeenCalledWith('/build/abc123/my-build?foo=bar', { replaceUrl: true });
      expect(sessionStorage.getItem(POST_LOGOUT_RETURN_TO_KEY)).toBeNull();
    });

    it('does nothing when there is no stashed path', () => {
      const navigateSpy = vi.spyOn(Router.prototype, 'navigateByUrl').mockResolvedValue(true);

      create();

      expect(navigateSpy).not.toHaveBeenCalled();
    });
  });
});
