// ALLOWED_ORIGINS is a comma-separated list (e.g. the production site plus
// http://localhost:4200 for local `ng serve` testing against the real
// deployed API) rather than a single fixed origin, since local dev needs to
// be a genuinely allowed origin too, not just production.
export function parseAllowedOrigins(allowedOriginsVar: string): string[] {
  return allowedOriginsVar.split(',').map(origin => origin.trim()).filter(Boolean);
}

/**
 * Echoes the request's Origin back as Access-Control-Allow-Origin only if
 * it's in the allow-list (the standard pattern for supporting more than one
 * allowed origin, since the header can only ever hold one value - it can't
 * be a list itself). Falls back to the first configured origin when the
 * request has no Origin header (e.g. a non-browser client) or its origin
 * isn't allowed, so the response still carries a well-formed CORS header
 * rather than none at all.
 */
export function resolveAllowedOrigin(requestOrigin: string | null, allowedOrigins: string[]): string {
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }
  return allowedOrigins[0] ?? '';
}
