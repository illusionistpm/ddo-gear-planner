import type { MockedObject } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { AuthService as Auth0Service } from '@auth0/auth0-angular';
import { BehaviorSubject, Subject, of } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

const POST_LOGOUT_RETURN_TO_KEY = 'auth.postLogoutReturnTo';
const SIGN_IN_RETURN_TO_KEY = 'auth.signInReturnTo';

describe('AuthService', () => {
  let httpMock: HttpTestingController;
  let isAuthenticated$: BehaviorSubject<boolean>;
  let auth0: MockedObject<Auth0Service>;
  let error$: Subject<Error>;

  function create(): AuthService {
    isAuthenticated$ = new BehaviorSubject<boolean>(false);
    error$ = new Subject<Error>();
    auth0 = {
      loginWithRedirect: vi.fn().mockName('Auth0Service.loginWithRedirect'),
      logout: vi.fn().mockName('Auth0Service.logout'),
      isAuthenticated$,
      error$,
      user$: of(null),
      isLoading$: of(false)
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
    it('stashes the current path/query and logs out with a bare-origin returnTo', () => {
      // window.location isn't configurable in this test environment, so
      // this asserts against whatever it actually is (the test page's URL)
      // rather than a mocked build URL - still exercises the real
      // pathname+search/origin plumbing signOut() does.
      const service = create();

      service.signOut();

      expect(sessionStorage.getItem(POST_LOGOUT_RETURN_TO_KEY)).toBe(window.location.pathname + window.location.search);
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

    it('signIn stashes the current path/query alongside appState', () => {
      const service = create();

      service.signIn();

      const target = window.location.pathname + window.location.search;
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
