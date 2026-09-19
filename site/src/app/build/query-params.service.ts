import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, ReplaySubject } from 'rxjs';
import { BuildUrlCodecService } from './build-url-codec.service';
import { isBuildParamKey } from './build-param-keys';
import { isBuildShortIdRoute } from './build-route';
import { perfMark, perfStart } from '../shared/perf-trace';
import { QueryParamRecord } from './query-param-types';

export type ParamsAdapter = {
  keys: string[];
  get: (key: string) => string | null;
  getAll: (key: string) => string[];
};
type DecodedParamsResult = {
  params: ParamsAdapter;
  source: string;
  shouldCanonicalize: boolean;
  canonicalParams: QueryParamRecord;
};

// Identity of the loaded/saved build a live edit belongs to, carried inside
// the `b` blob itself (as a reserved key, stripped before gear/filter params
// ever reach EquippedService/FiltersService - see extractBuildIdentity)
// rather than as generic passthrough. It has to be a genuinely separate
// channel from passthroughParams: that mechanism is deliberately designed to
// survive into save payloads (so a viewer's manually-appended custom query
// param sticks around through edits/saves), which is exactly what this must
// NOT do - this identity has no business being embedded in the publicly-served
// saved blob (GET /api/build/:shortId deliberately omits it - see
// builds.service.ts).
//
// Deliberately excludes the build's savedBuildId (the internal id used for
// PUT/DELETE). This is the address bar's own live-edit URL - copying it is
// the single most common way a build gets shared - so anything here is
// effectively public. savedBuildId used to ride along, and CurrentBuildService
// trusted its mere presence as proof of ownership: open a copied link and the
// UI offered an in-place Save aimed at someone else's build (the Worker
// correctly 403s, but the client had no idea and just showed nothing).
// Ownership can't be derived from the URL at all - see
// CurrentBuildService.confirmOwnership(), which is the only legitimate source
// (cross-referencing the signed-in viewer's own listMine() results).
export interface BuildUrlIdentity {
  // null covers a build that's never been loaded/saved from a shortId at
  // all - a name typed onto a fresh scratch build still needs to survive
  // reload/sharing the long URL (see CurrentBuildService.setName()), even
  // though there's no shortId behind it yet.
  shortId: string | null;
  name: string;
}

// Exported so BUILD_IDENTITY_PARAM_KEY has exactly one definition, following
// the pattern already used for reserved/well-known param keys elsewhere (see
// build-param-keys.ts, build-route.ts) rather than being a private literal
// only this file can check.
export const BUILD_IDENTITY_PARAM_KEY = '__buildRef';

/** A service whose state is restored from the URL's build params. */
export interface QueryParamsListener {
  updateFromParams(params: ParamsAdapter): void;
}

/** Emits a registered source's current params, or null before it has any. */
type ParamsSource = Observable<QueryParamRecord | null>;

@Injectable({
  providedIn: 'root'
})
export class QueryParamsService {
  // Keyed by the registering source (only its identity matters).
  private paramsFromCode: Map<unknown, QueryParamRecord | null>;

  private observables: Array<[unknown, ParamsSource]>;

  private updateListeners: QueryParamsListener[];

  private initialPageLoad = true;

  private applyingParamsFromUrl = false;

  private appUrlWritesToIgnore = 0;

  private passthroughParams: QueryParamRecord = {};

  // Equipment slot names are data-driven (loaded game data), not a fixed
  // list - EquippedService pushes them here rather than this service
  // injecting GearDbService directly, which would be a circular DI
  // dependency (GearDbService -> FiltersService -> QueryParamsService).
  private ownedSlots: ReadonlyArray<string> = [];

  // Emits whenever combinedParams is recomputed, whether from a genuine
  // user-driven change (equipping something, toggling a filter) or a
  // URL-driven apply (updateFromParams/applyDecodedBuildParams - loading a
  // build, or a browser back/forward replaying an edit-history point).
  // CurrentBuildService compares each emission against its own baseline for
  // dirty-tracking - it needs this to fire on a URL-driven restore just as
  // much as a live edit, or browser back/forward through history lands on
  // stale dirty state (see the regression this fixed: switch to a different
  // build, then back to a still-dirty one - the gear/identity restore
  // correctly, but isDirty silently kept whatever the OTHER build's clean
  // value was, since this stream used to skip URL-driven applies entirely).
  // A load's own reset to a fresh clean baseline (markLoaded/markSaved)
  // still wins in the end: it runs synchronously right after the apply that
  // triggers this, before anything observes the state in between. Exposed
  // as a BehaviorSubject (not just an Observable) so a snapshot is always
  // available via getCombinedParams() too, not just future emissions.
  private readonly combinedParamsSubject = new BehaviorSubject<QueryParamRecord>({});
  readonly combinedParamsChanges: Observable<QueryParamRecord> = this.combinedParamsSubject.asObservable();

  // Emits once, the first time params from the URL (or a loaded build) have
  // actually been applied to listeners like EquippedService. A routed
  // component's ngOnInit runs before AppComponent's NavigationEnd-driven
  // updateFromParams() call reaches it - code that needs to know "is there
  // real build data yet" (e.g. deciding whether to show first-run
  // onboarding) has to wait for this rather than checking synchronously in
  // ngOnInit, or it always sees the pre-load empty state. A ReplaySubject
  // so a listener that subscribes after this already fired still gets it.
  private readonly initialParamsAppliedSubject = new ReplaySubject<void>(1);
  readonly initialParamsApplied$: Observable<void> = this.initialParamsAppliedSubject.asObservable();

  // What identity (if any) to tag onto the NEXT live-edit URL write - set by
  // CurrentBuildService whenever its own state changes (loaded/saved/reset),
  // read back out by navigateWithParams. One-directional (this service never
  // depends on CurrentBuildService) to avoid the circular DI that would
  // otherwise result, since CurrentBuildService already depends on this one.
  private buildIdentityForUrl: BuildUrlIdentity | null = null;

  // Emits the identity decoded from the URL every time updateFromParams runs
  // (null when the current b= blob carries none) - MainComponent forwards
  // this to CurrentBuildService, since this service can't depend on it
  // directly (see buildIdentityForUrl above). ReplaySubject for the same
  // reason as initialParamsAppliedSubject: a subscriber set up in
  // MainComponent's ngOnInit can run before AppComponent's NavigationEnd
  // handler has reached this service for the current navigation.
  private readonly buildIdentitySubject = new ReplaySubject<BuildUrlIdentity | null>(1);
  readonly buildIdentityFromUrl$: Observable<BuildUrlIdentity | null> = this.buildIdentitySubject.asObservable();

  constructor(
    private readonly router: Router,
    private readonly buildUrlCodec: BuildUrlCodecService
  ) {
    this.updateListeners = [];
    this.observables = [];

    this.paramsFromCode = new Map<unknown, QueryParamRecord | null>();
  }

  // Called by CurrentBuildService whenever its own state changes - see
  // buildIdentityForUrl's comment above.
  setBuildIdentityForUrl(identity: BuildUrlIdentity | null): void {
    this.buildIdentityForUrl = identity;
  }

  // Keeps buildIdentityFromUrl$'s replay value in sync with the CURRENT
  // truth, for every genuine identity change (a load, a save, an ownership
  // confirmation, a reset, a rename) - not just an incoming URL decode,
  // which is the only thing that otherwise ever calls next() on this
  // stream (inside updateFromParams). Call from CurrentBuildService's own
  // mutators (NOT from restoreIdentity, which is itself a *reaction* to an
  // emission on this same stream - re-publishing from inside that reaction
  // would recurse into the subscriber that's still on the call stack).
  //
  // Why this matters: any self-triggered write that crosses route configs
  // (e.g. dropping /build/:shortId to root on the very first edit of a
  // loaded build, or navigating from there to a *different* saved build)
  // destroys and recreates MainComponent. Its fresh buildIdentityFromUrl$
  // subscription immediately replays whatever this ReplaySubject(1) last
  // held - and since a self-triggered write is deliberately skipped by
  // AppComponent's consumeAppUrlWrite() and never reaches updateFromParams,
  // that could otherwise be arbitrarily stale (e.g. `null` from an earlier,
  // unrelated plain-root visit this same session, or a previously loaded
  // build's identity after switching to a different one). MainComponent's
  // subscriber would read that stale value as this navigation's truth -
  // silently wiping (a stale null) or reverting (a stale identity) the
  // name/shortId/savedBuildId CurrentBuildService (unaffected by
  // MainComponent being recreated, since it's a singleton) already had
  // exactly right.
  publishBuildIdentity(identity: BuildUrlIdentity | null): void {
    this.buildIdentitySubject.next(identity);
  }

  // setBuildIdentityForUrl alone only takes effect on the NEXT param-driven
  // navigation (_makeNavigateFn above) - fine for every other caller, since
  // they already have a correct URL for their case. But naming a fresh,
  // still-untouched scratch build has no next navigation coming, so
  // CurrentBuildService.setName() calls this right after to force the
  // identity into the address bar immediately - otherwise a reload or a
  // copied URL right after typing a name would lose it. replaceUrl: true
  // since a name edit shouldn't spam browser history the way a real gear
  // edit does.
  refreshLiveEditUrl(): void {
    this.navigateWithParams(this.withBuildIdentityForUrl(this.getCombinedParams()), true);
  }

  // Called once by EquippedService with the current (data-driven) set of
  // equipment slot names, so isOwnedParamKey() can tell a build's own slot
  // params apart from an unrecognized param a viewer might have appended to
  // a shared link by hand.
  registerOwnedSlots(slots: ReadonlyArray<string>) {
    this.ownedSlots = slots;
  }

  _makeNavigateFn(pair: [unknown, ParamsSource]) {
    return (val: QueryParamRecord | null) => {
        const done = perfStart('QueryParamsService.navigateFromObservable');
        this.paramsFromCode.set(pair[0], val);

        // Dirty-tracking must see every recompute, URL-driven or not (see
        // combinedParamsChanges' comment) - only the actual navigate-back-
        // out-to-the-URL step below stays guarded, to avoid re-navigating
        // while we're still in the middle of applying an incoming URL.
        const combinedParams = this.getCombinedParams();
        this.combinedParamsSubject.next(combinedParams);

        if (this.applyingParamsFromUrl) {
          done({ skipped: 'applyingParamsFromUrl' });
          return;
        }

        this.navigateWithParams(this.withBuildIdentityForUrl(combinedParams), false);
        done({ keys: Object.keys(combinedParams).length });
      };
    }

  // Called by the app when the page is loaded
  updateFromParams(rawParams: ParamsAdapter) {
    const done = perfStart('QueryParamsService.updateFromParams');
    // Auth0's login redirect lands on the bare app root carrying its own
    // code/state (or error/error_description) query params - stripped here
    // before anything else sees them, or they'd otherwise look exactly like
    // unrecognized "legacy" build params and get canonicalized into a
    // compact `b` blob via a real navigation (see navigateWithParams below).
    // That extra navigation would overwrite the URL's code/state well
    // before Auth0's own async token exchange finishes, which is what
    // MainComponent's isOnAuthRedirectCallbackUrl() relies on staying put
    // for the whole callback window to avoid a "start page" flash - see its
    // comment for the full timing story.
    const params = this.withoutAuthCallbackParams(rawParams);
    const paramsToApply = this.decodeCompactParams(params);
    // Split the build's identity (if any) out before anything else sees this
    // set: getPassthroughParams below feeds getCombinedParams(), which is
    // also what composes the save payload - the identity must never end up
    // there (see BuildUrlIdentity's comment), and EquippedService/
    // FiltersService's updateFromParams shouldn't have to recognize and
    // ignore an unrelated reserved key either.
    const { params: cleanParams, identity } = this.extractBuildIdentity(paramsToApply.params);
    this.passthroughParams = this.getPassthroughParams(cleanParams);

    if (paramsToApply.shouldCanonicalize) {
      perfMark('QueryParamsService.legacyUrlCanonicalize', {
        keys: paramsToApply.params.keys.length
      });
      this.navigateWithParams(paramsToApply.canonicalParams, true);
    }

    this.applyParamsToListeners(cleanParams);
    this.buildIdentitySubject.next(identity);
    done({ keys: Array.from(cleanParams.keys).length, source: paramsToApply.source });
  }

  /**
   * For a build loaded by shortId (`/build/:shortId`), which carries no
   * query string at all - MainComponent fetches {name, blob} from the
   * Worker, decodes the blob itself (already the final flat param record),
   * and hands it here directly, skipping the URL-decode/canonicalize logic
   * in updateFromParams/decodeCompactParams that doesn't apply to this
   * path. Passthrough is cleared: a freshly loaded saved build's blob is
   * the whole story, there's no sibling flat query param to preserve.
   */
  applyDecodedBuildParams(record: Record<string, string | Array<string>>) {
    const done = perfStart('QueryParamsService.applyDecodedBuildParams');
    this.passthroughParams = {};
    this.applyParamsToListeners(this.paramsAdapterFromRecord(record));
    done({ keys: Object.keys(record).length });
  }

  private applyParamsToListeners(params: ParamsAdapter) {
    this.applyingParamsFromUrl = true;
    try {
      for (const listener of this.updateListeners) {
        listener.updateFromParams(params);
      }
    } finally {
      this.applyingParamsFromUrl = false;
    }

    this.initialParamsAppliedSubject.next();

    if (this.initialPageLoad) {
      this.initialPageLoad = false;

      // Don't start listening to the observables until after we've applied the query parameters.
      // Otherwise we just end up overwriting everything.
      this.applyingParamsFromUrl = true;
      try {
        for (const pair of this.observables) {
          pair[1].subscribe(this._makeNavigateFn(pair));
        }
      } finally {
        this.applyingParamsFromUrl = false;
      }
    }
  }

  // Call to register your observable params with the system
  register(source: unknown, obs: ParamsSource) {
    this.observables.push([source, obs]);

    if (!this.initialPageLoad) {
      obs.subscribe(this._makeNavigateFn([source, obs]));
    }
  }

  // Call to be notified when the params change
  subscribe(listener: QueryParamsListener) {
    this.updateListeners.push(listener);
  }

  consumeAppUrlWrite() {
    if (this.appUrlWritesToIgnore <= 0) {
      return false;
    }

    this.appUrlWritesToIgnore--;
    perfMark('QueryParamsService.consumeAppUrlWrite');
    return true;
  }

  private decodeCompactParams(params: ParamsAdapter): DecodedParamsResult {
    const compactParam = params.get('b');
    if (compactParam) {
      const decodedParams = this.buildUrlCodec.decode(compactParam);
      if (decodedParams) {
        const externalPassthroughParams = this.getPassthroughParams(this.withoutCompactParam(params));
        const mergedParams = { ...decodedParams, ...externalPassthroughParams };
        return {
          params: this.paramsAdapterFromRecord(mergedParams),
          source: 'compact',
          shouldCanonicalize: Object.keys(externalPassthroughParams).length > 0,
          canonicalParams: mergedParams
        };
      }

      perfMark('QueryParamsService.compactUrlDecodeFallback', {
        keys: params.keys.length,
        hasLegacyParams: params.keys.some(key => key !== 'b')
      });
    }

    const legacyParams = this.withoutCompactParam(params);
    return {
      params: legacyParams,
      source: compactParam ? 'legacy-fallback' : 'legacy',
      shouldCanonicalize: legacyParams.keys.length > 0,
      canonicalParams: this.paramsAdapterToRecord(legacyParams)
    };
  }

  // Auth0's redirect_uri is the bare app origin (see app.module.ts), so a
  // login round-trip always lands here carrying exactly these query params -
  // never real build data.
  private static readonly AUTH_CALLBACK_PARAM_KEYS = new Set(['code', 'state', 'error', 'error_description']);

  private withoutAuthCallbackParams(params: ParamsAdapter): ParamsAdapter {
    if (!params.keys.some(key => QueryParamsService.AUTH_CALLBACK_PARAM_KEYS.has(key))) {
      return params;
    }

    const record: Record<string, string | string[]> = {};
    for (const key of params.keys) {
      if (QueryParamsService.AUTH_CALLBACK_PARAM_KEYS.has(key)) {
        continue;
      }

      const values = params.getAll(key);
      if (values.length > 1) {
        record[key] = values;
      } else if (values.length === 1) {
        record[key] = values[0];
      }
    }
    return this.paramsAdapterFromRecord(record);
  }

  private withoutCompactParam(params: ParamsAdapter): ParamsAdapter {
    return this.withoutKey(params, 'b');
  }

  private withoutKey(params: ParamsAdapter, keyToRemove: string): ParamsAdapter {
    if (!params.keys.includes(keyToRemove)) {
      return params;
    }

    const record: Record<string, string | string[]> = {};
    for (const key of params.keys) {
      if (key === keyToRemove) {
        continue;
      }

      const values = params.getAll(key);
      if (values.length > 1) {
        record[key] = values;
      } else if (values.length === 1) {
        record[key] = values[0];
      }
    }
    return this.paramsAdapterFromRecord(record);
  }

  private withBuildIdentityForUrl(params: QueryParamRecord): QueryParamRecord {
    if (!this.buildIdentityForUrl) {
      return params;
    }
    return { ...params, [BUILD_IDENTITY_PARAM_KEY]: JSON.stringify(this.buildIdentityForUrl) };
  }

  private extractBuildIdentity(params: ParamsAdapter): { params: ParamsAdapter; identity: BuildUrlIdentity | null } {
    if (!params.keys.includes(BUILD_IDENTITY_PARAM_KEY)) {
      return { params, identity: null };
    }

    let identity: BuildUrlIdentity | null = null;
    const raw = params.get(BUILD_IDENTITY_PARAM_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        // A bookmarked/previously-shared URL minted before savedBuildId was
        // removed from BuildUrlIdentity may still carry one in its JSON - it's
        // simply not read here, which is exactly the point (see
        // BuildUrlIdentity's comment).
        if (parsed && (parsed.shortId === null || typeof parsed.shortId === 'string') && typeof parsed.name === 'string') {
          identity = {
            shortId: parsed.shortId,
            name: parsed.name
          };
        }
      } catch {
        identity = null;
      }
    }

    return { params: this.withoutKey(params, BUILD_IDENTITY_PARAM_KEY), identity };
  }

  // Public so CurrentBuildService can snapshot the current build state
  // directly (e.g. right after a load/save completes, to set its dirty-
  // tracking baseline) without waiting for the next combinedParamsChanges
  // emission, which only fires on subsequent edits.
  /** The current build as the compact blob stored for saved builds and short links. */
  encodeCurrentBuild(): string {
    return this.buildUrlCodec.encode(this.getCombinedParams());
  }

  getCombinedParams(): QueryParamRecord {
    let combinedParams: QueryParamRecord = { ...this.passthroughParams };
    for (const param of this.paramsFromCode.values()) {
      if (param) {
        combinedParams = { ...combinedParams, ...param };
      }
    }
    return combinedParams;
  }

  private getPassthroughParams(params: ParamsAdapter): Record<string, string | Array<string>> {
    const passthroughParams: Record<string, string | Array<string>> = {};
    for (const key of params.keys) {
      if (this.isOwnedParamKey(key)) {
        continue;
      }

      const values = params.getAll(key);
      if (values.length > 1) {
        passthroughParams[key] = values;
      } else if (values.length === 1) {
        passthroughParams[key] = values[0];
      }
    }
    return passthroughParams;
  }

  private paramsAdapterToRecord(params: ParamsAdapter): QueryParamRecord {
    const record: QueryParamRecord = {};
    for (const key of params.keys) {
      const values = params.getAll(key);
      if (values.length > 1) {
        record[key] = values;
      } else if (values.length === 1) {
        record[key] = values[0];
      }
    }
    return record;
  }

  private isOwnedParamKey(key: string) {
    return isBuildParamKey(key, this.ownedSlots);
  }

  private navigateWithParams(params: QueryParamRecord, replaceUrl: boolean) {
    const routePath = this.router.url.split('?')[0];
    // Once a loaded build has unsaved edits, drop its /build/:shortId path
    // segment rather than pile live-edit state onto a route that's supposed
    // to mean "the canonical saved build" - AppComponent deliberately
    // ignores query params on that route shape entirely (see its
    // updateFromLocation), so browser back/forward through those edits was
    // never actually read back into EquippedService/FiltersService. The
    // root route's query-param pipeline already handles this correctly; the
    // build's identity rides along in the params themselves (see
    // withBuildIdentityForUrl) so it survives the trip back through
    // history instead of being lost along with the path segment.
    //
    // Router.navigate([], ...) is NOT "go to root" - with zero commands and
    // no relativeTo, it means "stay exactly where you are, just change
    // query params" (a genuinely easy Angular Router gotcha to miss - an
    // earlier version of this exact fix shipped with [] here and silently
    // did nothing). ['/'] forces an absolute navigation to root.
    const routeSegments = this.buildIdentityForUrl && isBuildShortIdRoute(routePath)
      ? ['/']
      : routePath.split('/').filter(Boolean);
    const compactParam = this.buildUrlCodec.encode(params);
    const queryParams = { b: compactParam };

    perfMark('QueryParamsService.compactUrlWrite', {
      replaceUrl,
      keys: Object.keys(params).length,
      compactChars: compactParam.length
    });

    this.appUrlWritesToIgnore++;
    const navigateDone = perfStart('Router.navigate');
    this.router.navigate(routeSegments, {
      queryParams,
      replaceUrl
    }).finally(() => {
      navigateDone({ route: routeSegments.join('/'), keys: Object.keys(queryParams).length, replaceUrl });
      setTimeout(() => {
        if (this.appUrlWritesToIgnore > 0) {
          this.appUrlWritesToIgnore--;
        }
      });
    });
  }

  private paramsAdapterFromRecord(record: Record<string, string | Array<string>>): ParamsAdapter {
    return {
      keys: Object.keys(record),
      get: (key: string) => {
        const value = record[key];
        if (Array.isArray(value)) {
          return value.length ? value[0] : null;
        }
        return value === undefined ? null : value;
      },
      getAll: (key: string) => {
        const value = record[key];
        if (Array.isArray(value)) {
          return value;
        }
        return value === undefined ? [] : [value];
      }
    };
  }
}
