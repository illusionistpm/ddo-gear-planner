import { slugifyBuildName } from './build-slug';

// A build loaded by shortId (`/build/:shortId(/:slug)`) carries no query
// string at all - its state comes from a server fetch + decode
// (MainComponent's own logic), not from AppComponent's generic
// query-param-driven updateFromParams() flow. AppComponent needs to
// recognize and skip this route shape entirely, or it would reapply an
// empty query-param set and clobber state before the async fetch resolves.
const BUILD_SHORT_ID_ROUTE = /^\/build\/[^/]+(?:\/[^/]*)?$/;

export function isBuildShortIdRoute(routePath: string): boolean {
  return BUILD_SHORT_ID_ROUTE.test(routePath);
}

/** The app path for a saved build or short link: /build/:shortId/:slug, or /build/:shortId when it has no name. */
export function buildPath(shortId: string, name: string | null): string {
  const slugSegment = name ? `/${slugifyBuildName(name)}` : '';
  return `/build/${encodeURIComponent(shortId)}${slugSegment}`;
}
