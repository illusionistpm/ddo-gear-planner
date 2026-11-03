import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, startWith } from 'rxjs/operators';

import { buildPath } from './build-route';
import { CurrentBuildState } from './current-build.service';
import { QueryParamsService } from './query-params.service';
import { ShortLinksService } from './short-links.service';

// 'canonical': the build's own existing /build/:shortId/:slug URL, shared
// as-is with no mint at all - only possible for a clean, owned, already-
// saved build (see canonicalShareUrl). 'short': a freshly minted immutable
// snapshot link (shortLinks.create) - what a dirty edit or a build the
// viewer doesn't own falls back to. 'long': the current ?b=... URL,
// unauthenticated visitors only (short links are locked behind sign-in).
export type ShareLinkKind = 'canonical' | 'short' | 'long';

// A copy click can land before the link resolves (the mint is a network
// round trip), and the menu needs to say so rather than silently doing
// nothing.
export type ShareLinkState =
  | { status: 'pending' }
  | { status: 'ready'; url: string; kind: ShareLinkKind }
  | { status: 'error'; message: string };

/**
 * The link to share the build on screen by, for the share menus. They
 * resolve it as they open rather than on the copy click: the copy itself
 * must stay synchronous inside the click's user gesture (see clipboard.ts),
 * and a network round trip between gesture and clipboard write silently
 * failed the write in Firefox/Safari.
 */
@Injectable({
  providedIn: 'root'
})
export class ShareLinkResolverService {
  constructor(
    private readonly shortLinks: ShortLinksService,
    private readonly queryParams: QueryParamsService
  ) { }

  // Three ways the link resolves, checked in order:
  //  1. Synchronously, to the build's own canonical URL - only for a clean,
  //     owned, already-saved build (see canonicalShareUrl).
  //  2. Synchronously, to the current long ?b=... URL - signed-out visitors
  //     only (window.location.href already reflects the current gear/name
  //     thanks to QueryParamsService.refreshLiveEditUrl()).
  //  3. Asynchronously, via a freshly minted short link - everything else.
  //     'pending' until then, which the menus show; a copy click that lands
  //     first is a no-op rather than an async copy.
  resolve(buildState: CurrentBuildState, isAuthenticated: boolean): Observable<ShareLinkState> {
    const canonicalUrl = this.canonicalShareUrl(buildState, isAuthenticated);
    if (canonicalUrl) {
      return of({ status: 'ready', url: canonicalUrl, kind: 'canonical' });
    }
    if (!isAuthenticated) {
      return of({ status: 'ready', url: window.location.href, kind: 'long' });
    }

    return this.shortLinks.create(this.queryParams.encodeCurrentBuild(), buildState.name ?? '').pipe(
      map(({ shortId }): ShareLinkState => ({
        status: 'ready',
        url: window.location.origin + buildPath(shortId, buildState.name),
        kind: 'short'
      })),
      catchError(() => of<ShareLinkState>({ status: 'error', message: 'Could not create a share link. Please try again.' })),
      startWith<ShareLinkState>({ status: 'pending' })
    );
  }

  // A clean, owned, already-saved build's own URL always reflects its current
  // content - sharing it instead of minting a snapshot means recipients see
  // later saves, and avoids handing out a second, divergent URL for the same
  // build. (ownership can only be 'owned' for a signed-in viewer; the
  // isAuthenticated check states that invariant rather than leaning on it.)
  private canonicalShareUrl(buildState: CurrentBuildState, isAuthenticated: boolean): string | null {
    const { ownership, shortId, isDirty, name } = buildState;
    if (!isAuthenticated || ownership !== 'owned' || !shortId || isDirty) {
      return null;
    }
    return window.location.origin + buildPath(shortId, name);
  }
}
