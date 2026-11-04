import { DefaultUrlSerializer, PRIMARY_OUTLET } from '@angular/router';

import { slugifyBuildName } from './build-slug';

// The app registers no UrlSerializer of its own, so this parses as the router does.
const urlSerializer = new DefaultUrlSerializer();

/**
 * A URL's route path segments, as the router reads them: without the query
 * string or the fragment, and decoded. Splitting on '?' kept a fragment
 * that had no query string ahead of it as part of the last segment.
 */
export function routeSegmentsOf(url: string): string[] {
  return urlSerializer.parse(url).root.children[PRIMARY_OUTLET]?.segments.map(segment => segment.path) ?? [];
}

/** A URL's route path, as routeSegmentsOf reads it: '/' for the root. */
export function routePathOf(url: string): string {
  return `/${routeSegmentsOf(url).join('/')}`;
}

/**
 * A URL's fragment with its '#', exactly as written, or '' when it has
 * none - for carrying a view (the shopping list, say) over to a new URL.
 */
export function urlFragmentOf(url: string): string {
  const hash = url.indexOf('#');
  return hash < 0 ? '' : url.slice(hash);
}

/** A URL without its fragment: what's left is the build, and where it's loaded from. */
export function urlWithoutFragment(url: string): string {
  return url.slice(0, url.length - urlFragmentOf(url).length);
}

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
  return `/build${shortIdPath(shortId, name)}`;
}

// A friend's view of what a saved build still needs
// (StillNeededPageComponent): a page of its own, which never loads the
// build into the planner. Like a build loaded by shortId, AppComponent
// must leave it alone.
const STILL_NEEDED_ROUTE = /^\/still-needed\/[^/]+(?:\/[^/]*)?$/;

export function isStillNeededRoute(routePath: string): boolean {
  return STILL_NEEDED_ROUTE.test(routePath);
}

/** The path to a friend's view of what a saved build still needs: /still-needed/:shortId/:slug. */
export function stillNeededPath(shortId: string, name: string | null): string {
  return `/still-needed${shortIdPath(shortId, name)}`;
}

function shortIdPath(shortId: string, name: string | null): string {
  const slugSegment = name ? `/${slugifyBuildName(name)}` : '';
  return `/${encodeURIComponent(shortId)}${slugSegment}`;
}
