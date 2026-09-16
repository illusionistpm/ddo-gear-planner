import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService as Auth0Service } from '@auth0/auth0-angular';
import { Observable } from 'rxjs';
import { distinctUntilChanged, filter } from 'rxjs/operators';

import { environment } from '../environments/environment';

// sessionStorage key used to carry the pre-logout path/query across the
// Auth0 logout redirect - see signOut()'s comment for why this exists
// instead of just passing the path as returnTo.
const POST_LOGOUT_RETURN_TO_KEY = 'auth.postLogoutReturnTo';

// Thin wrapper around @auth0/auth0-angular's AuthService. BuildsService
// needs no auth-specific code of its own - the SDK's AuthHttpInterceptor
// (registered in app.module.ts) attaches the Authorization: Bearer header
// automatically to any request matching the configured allowed list.
@Injectable({
  providedIn: 'root'
})
export class AuthService {
  readonly isAuthenticated$: Observable<boolean> = this.auth0.isAuthenticated$;
  readonly user$ = this.auth0.user$;
  // True for the whole callback-processing window after a login redirect
  // (and briefly on any fresh load, while the SDK checks for an existing
  // session) - stays true until after the SDK has already dispatched its
  // own restore-navigation back to appState.target, so code that needs to
  // know "has the real post-login URL landed yet" can gate on this instead
  // of racing it.
  readonly isLoading$: Observable<boolean> = this.auth0.isLoading$;

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
    // appState.target is the field the SDK actually reads to decide where to
    // land after the redirect callback (defaults to '/' otherwise, wiping
    // whatever build was in progress) - since build state already lives in
    // the URL, nothing unsaved is lost across the redirect.
    this.auth0.loginWithRedirect({
      appState: { target: window.location.pathname + window.location.search }
    });
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
