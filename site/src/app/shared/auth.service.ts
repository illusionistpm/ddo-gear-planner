import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService as Auth0Service } from '@auth0/auth0-angular';
import { Observable, distinctUntilChanged, filter } from 'rxjs';

import { environment } from '../../environments/environment';

// sessionStorage key used to carry the pre-logout path/query across the
// Auth0 logout redirect - see signOut()'s comment for why this exists
// instead of just passing the path as returnTo.
const POST_LOGOUT_RETURN_TO_KEY = 'auth.postLogoutReturnTo';

// The same idea for signIn(): the SDK carries the build path through the
// login redirect in appState, but drops it when the callback fails - see
// the error$ subscription in the constructor.
const SIGN_IN_RETURN_TO_KEY = 'auth.signInReturnTo';

// Token-fetch error codes (auth0-spa-js's GenericError.error) meaning the
// stored session can never produce another access token - see the error$
// subscription in the constructor.
const DEAD_SESSION_ERRORS = new Set(['invalid_grant', 'missing_refresh_token']);

// Thin wrapper around @auth0/auth0-angular's AuthService. BuildsService
// needs no auth-specific code of its own - the SDK's AuthHttpInterceptor
// (registered in app.module.ts) attaches the Authorization: Bearer header
// automatically to any request matching the configured allowed list.
@Injectable({
  providedIn: 'root'
})
export class AuthService {
  readonly isAuthenticated$: Observable<boolean>;
  readonly user$: Auth0Service['user$'];
  // True for the whole callback-processing window after a login redirect
  // (and briefly on any fresh load, while the SDK checks for an existing
  // session) - stays true until after the SDK has already dispatched its
  // own restore-navigation back to appState.target, so code that needs to
  // know "has the real post-login URL landed yet" can gate on this instead
  // of racing it.
  readonly isLoading$: Observable<boolean>;

  // Set right before signIn()/signOut() trigger their real window.location
  // redirect to Auth0 - both round-trip back to this exact build (see their
  // comments), so AppComponent's beforeunload handler shouldn't show the
  // browser's generic "leave site? changes may not be saved" warning for
  // this specific navigation the way it should for e.g. closing the tab.
  private redirectingAwayForAuth = false;
  get isRedirectingAwayForAuth(): boolean {
    return this.redirectingAwayForAuth;
  }

  constructor(
    private readonly auth0: Auth0Service,
    private readonly http: HttpClient,
    private readonly router: Router
  ) {
    // Assigned here rather than as field initializers, which would read
    // this.auth0 before it is set under standard class-field semantics.
    this.isAuthenticated$ = this.auth0.isAuthenticated$;
    this.user$ = this.auth0.user$;
    this.isLoading$ = this.auth0.isLoading$;

    // GET /api/users/me both upserts the user's own D1 row (updating
    // last_login_at) and is the only thing that ever creates that row in
    // the first place - nothing else in the app calls it. Fired once per
    // false->true transition (a fresh login and a session restored on
    // reload both count), not on every isAuthenticated$ emission.
    this.isAuthenticated$.pipe(
      distinctUntilChanged(),
      filter(isAuthenticated => isAuthenticated)
    ).subscribe(() => {
      this.http.get(`${environment.apiBaseUrl}/api/users/me`).subscribe({
        error: () => { /* best-effort - a failed login-recording call shouldn't surface to the user */ }
      });
    });

    // A refresh token Auth0 no longer accepts (expired, revoked, or gone
    // from localstorage) can't come back, but the SDK leaves the session in
    // place: the cached ID token keeps isAuthenticated$ true, so the user
    // looks signed in while every API call fails its token exchange. Clear
    // the local session so the UI says what's actually true - signed out -
    // and offers Sign in. openUrl: false skips the redirect to Auth0's
    // /v2/logout; there's no server session worth ending and no reason to
    // navigate away from the build on screen.
    //
    // Any other error on a page load that is the login callback means the
    // login itself failed (an Action denied it, consent was refused, or a
    // stale ?code&state was reloaded). The SDK then navigates to '/' and
    // loses appState, so the build the user was on would vanish - restore
    // the path signIn() stashed. Only on the callback load: a stash left
    // behind by an abandoned login must not redirect on some later error.
    const isLoginCallback = AuthService.isLoginCallback(window.location.search);
    if (!isLoginCallback) {
      sessionStorage.removeItem(SIGN_IN_RETURN_TO_KEY);
    }
    this.auth0.error$.subscribe(error => {
      if (DEAD_SESSION_ERRORS.has((error as { error?: string }).error ?? '')) {
        this.auth0.logout({ openUrl: false }).subscribe();
        return;
      }
      const signInReturnTo = isLoginCallback ? sessionStorage.getItem(SIGN_IN_RETURN_TO_KEY) : null;
      if (signInReturnTo) {
        sessionStorage.removeItem(SIGN_IN_RETURN_TO_KEY);
        this.router.navigateByUrl(signInReturnTo, { replaceUrl: true });
      }
    });
    this.isAuthenticated$.pipe(filter(isAuthenticated => isAuthenticated)).subscribe(() => {
      sessionStorage.removeItem(SIGN_IN_RETURN_TO_KEY);
    });

    // Restores whatever path signOut() stashed before redirecting to Auth0,
    // once the post-logout redirect lands back here. One-shot: consumed and
    // removed immediately so it can't affect an unrelated later reload.
    const returnTo = sessionStorage.getItem(POST_LOGOUT_RETURN_TO_KEY);
    if (returnTo) {
      sessionStorage.removeItem(POST_LOGOUT_RETURN_TO_KEY);
      this.router.navigateByUrl(returnTo, { replaceUrl: true });
    }
  }

  signIn(): void {
    this.redirectingAwayForAuth = true;
    sessionStorage.setItem(SIGN_IN_RETURN_TO_KEY, window.location.pathname + window.location.search);
    // appState.target is the field the SDK actually reads to decide where to
    // land after the redirect callback (defaults to '/' otherwise, wiping
    // whatever build was in progress) - since build state already lives in
    // the URL, nothing unsaved is lost across the redirect.
    this.auth0.loginWithRedirect({
      appState: { target: window.location.pathname + window.location.search }
    });
  }

  // The SDK's own test (auth0-angular's shouldHandleCallback): Auth0
  // returns to redirect_uri with code or error, plus state.
  private static isLoginCallback(search: string): boolean {
    const params = new URLSearchParams(search);
    return (params.has('code') || params.has('error')) && params.has('state');
  }

  signOut(): void {
    this.redirectingAwayForAuth = true;
    // returnTo must be one of the tenant's Allowed Logout URLs, which is
    // just the bare origin (see SETUP.md) - Auth0 rejects anything else
    // with an opaque "Oops, something went wrong" error page, which is a
    // dead end since it happens *after* the session's already been cleared
    // (a manual refresh at that point does show signed-out correctly, just
    // confusingly). So the actual build path/query has to survive some
    // other way: stash it here and restore it in the constructor once the
    // post-logout redirect lands back at the origin.
    sessionStorage.setItem(POST_LOGOUT_RETURN_TO_KEY, window.location.pathname + window.location.search);
    this.auth0.logout({
      logoutParams: { returnTo: window.location.origin }
    });
  }
}
