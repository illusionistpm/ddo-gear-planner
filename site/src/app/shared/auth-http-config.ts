import { HttpInterceptorConfig } from '@auth0/auth0-angular';

import { environment } from '../../environments/environment';

// Lets BuildsService stay auth-agnostic: any request whose URL matches gets
// an Authorization: Bearer header attached automatically by
// AuthHttpInterceptor (registered in app.module.ts).
//
// GET /api/build/:shortId (singular - the public shared-link fetch) needs
// its own entry with allowAnonymous: true. Without it, a signed-out visitor
// opening a shared build link fails silently: the interceptor tries to
// attach a token anyway (because the URL still matches an allowedList
// entry), that token fetch throws login_required since there's no session,
// and the interceptor - by default - turns that into an error on the whole
// HTTP request rather than letting it through unauthenticated.
// MainComponent's error handler for that request then redirects to '/',
// which looks like the build URL "blanks itself" for a signed-out viewer
// even though the build still exists.
export const authHttpInterceptorConfig: HttpInterceptorConfig = {
  allowedList: [
    { uri: `${environment.apiBaseUrl}/api/build/*`, allowAnonymous: true },
    `${environment.apiBaseUrl}/api/*`
  ]
};
