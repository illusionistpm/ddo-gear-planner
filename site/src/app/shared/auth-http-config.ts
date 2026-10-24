import { HttpInterceptorConfig } from '@auth0/auth0-angular';

import { environment } from '../../environments/environment';

const API_PREFIX = `${environment.apiBaseUrl}/api/`;
// The trailing slash is what keeps /api/builds (plural, authenticated) out.
const PUBLIC_BUILD_PREFIX = `${environment.apiBaseUrl}/api/build/`;

// Lets BuildsService stay auth-agnostic: any request whose URL matches gets
// an Authorization: Bearer header attached automatically by
// AuthHttpInterceptor (registered in app.module.ts).
//
// GET /api/build/:shortId (singular - the public shared-link fetch) is left
// out entirely, since the worker never reads a token there. It used to be
// an allowAnonymous entry, which still asked Auth0 for a token first: that
// cost a signed-in viewer a refresh-token exchange just to open a shared
// link, and when the refresh token was dead the exchange failed with
// invalid_grant - which allowAnonymous doesn't cover - and took the whole
// request down with it, so the link showed the network-error panel.
export const authHttpInterceptorConfig: HttpInterceptorConfig = {
  allowedList: [
    { uriMatcher: url => url.startsWith(API_PREFIX) && !url.startsWith(PUBLIC_BUILD_PREFIX) }
  ]
};
