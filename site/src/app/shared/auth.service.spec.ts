import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { AuthService as Auth0Service } from '@auth0/auth0-angular';
import { BehaviorSubject, of } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

const POST_LOGOUT_RETURN_TO_KEY = 'auth.postLogoutReturnTo';

describe('AuthService', () => {
  let httpMock: HttpTestingController;
  let isAuthenticated$: BehaviorSubject<boolean>;
  let auth0: jasmine.SpyObj<Auth0Service>;

  function create(): AuthService {
    isAuthenticated$ = new BehaviorSubject<boolean>(false);
    auth0 = jasmine.createSpyObj('Auth0Service', ['loginWithRedirect', 'logout'], {
      isAuthenticated$,
      user$: of(null),
      isLoading$: of(false)
    });

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
      // this asserts against whatever it actually is (Karma's runner page)
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

  describe('post-logout restore', () => {
    it('navigates back to a stashed path once and clears it', () => {
      sessionStorage.setItem(POST_LOGOUT_RETURN_TO_KEY, '/build/abc123/my-build?foo=bar');
      const navigateSpy = spyOn(Router.prototype, 'navigateByUrl');

      create();

      expect(navigateSpy).toHaveBeenCalledWith('/build/abc123/my-build?foo=bar', { replaceUrl: true });
      expect(sessionStorage.getItem(POST_LOGOUT_RETURN_TO_KEY)).toBeNull();
    });

    it('does nothing when there is no stashed path', () => {
      const navigateSpy = spyOn(Router.prototype, 'navigateByUrl');

      create();

      expect(navigateSpy).not.toHaveBeenCalled();
    });
  });
});
