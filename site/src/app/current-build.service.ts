import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

import { BuildUrlIdentity, QueryParamsService } from './query-params.service';

// Replaces a plain boolean so "haven't checked ownership yet" can be told
// apart from "checked, and it's not yours" - 'unknown' isn't produced
// anywhere yet (nothing here derives ownership asynchronously), but the type
// exists now so that follow-up doesn't need another state-shape migration.
export type BuildOwnership = 'unknown' | 'owned' | 'other';

export interface CurrentBuildState {
  savedBuildId: string | null;
  shortId: string | null;
  name: string | null;
  isDirty: boolean;
  ownership: BuildOwnership;
}

const UNSAVED_STATE: CurrentBuildState = {
  savedBuildId: null,
  shortId: null,
  name: null,
  isDirty: false,
  ownership: 'other'
};

// Owns { savedBuildId, shortId, name, isDirty, ownership } for
// whatever build is currently loaded. Deliberately doesn't call
// BuildsService itself: GET /api/build/:shortId is public and only returns
// {name, blob} (no id, no owner - see builds.service.ts), so there's no way
// to know ownership from that response alone - and, just as deliberately,
// ownership can no longer be derived from the URL either (see
// BuildUrlIdentity's comment: savedBuildId doesn't travel there any more).
// The component driving a shared-link load or a history restore is expected
// to separately check the signed-in user's own listMine() results and call
// confirmOwnership() once that check resolves, one way or the other - this
// service just holds the resulting state (starting at 'unknown' until that
// call arrives) and tracks dirtiness.
@Injectable({
  providedIn: 'root'
})
export class CurrentBuildService {
  private readonly stateSubject = new BehaviorSubject<CurrentBuildState>(UNSAVED_STATE);
  readonly state$: Observable<CurrentBuildState> = this.stateSubject.asObservable();

  // Compared against on every combinedParamsChanges emission to compute
  // isDirty - captured fresh every time the baseline should reset (a load
  // or a save just completed).
  private baselineParamsJson: string;

  // The last-known-canonical (clean) param set for the currently loaded
  // build, keyed by shortId - set alongside markLoaded/markSaved (via
  // applyIdentity's callers, when they pass canonicalParams), whichever last
  // represented a genuine clean state (not restoreIdentity, which
  // deliberately doesn't touch this - see its comment). MainComponent uses
  // this to instantly restore a build's clean state when browser back/
  // forward lands back on its bare /build/:shortId(/:slug) URL, instead of
  // re-fetching over the network and flashing the loading screen for a
  // build that's already on screen.
  private canonicalParamsCache: { shortId: string; params: Record<string, string | Array<string>> } | null = null;

  constructor(private readonly queryParams: QueryParamsService) {
    // Not a field initializer: that would read this.queryParams before it is
    // set under standard class-field semantics.
    this.baselineParamsJson = this.stableStringify(this.queryParams.getCombinedParams());
    this.queryParams.combinedParamsChanges.subscribe(params => {
      this.setDirty(this.stableStringify(params) !== this.baselineParamsJson);
    });
  }

  get value(): CurrentBuildState {
    return this.stateSubject.value;
  }

  /**
   * The one place identity + dirty-state transitions actually happen - every
   * public mutator below is a thin wrapper describing *what kind* of
   * transition it is, rather than re-deriving this same list of side
   * effects itself (four separate bugs this session traced back to exactly
   * that: a mutator forgetting one piece of this list). `identity: null`
   * naturally produces UNSAVED_STATE (every field null/false, ownership
   * 'other'), so reset() is just this method called with null - no separate
   * branch needed.
   *
   * - resetBaseline: true for a genuine clean state (a load or a save just
   *   completed) - forces isDirty false and recaptures the dirty-tracking
   *   baseline. false for a transition that's purely metadata (a rename, an
   *   ownership confirmation, a history-restore) - isDirty is left exactly
   *   as it was.
   * - publish: whether to also push this identity onto
   *   queryParams.buildIdentityFromUrl$ (see publishBuildIdentity's own
   *   comment for why this matters - a freshly-recreated MainComponent
   *   instance replays whatever that stream last held). Always true except
   *   from restoreIdentity, which is itself a *reaction* to an emission on
   *   that same stream - publishing back onto it there would recurse
   *   synchronously into the still-running subscriber.
   * - savedBuildId / ownership: unlike the rest of the state, these are NOT
   *   derived from `identity` - BuildUrlIdentity no longer carries an
   *   ownership signal at all (see its comment for why). Every caller must
   *   say explicitly what it actually knows; omitting both defaults to
   *   {savedBuildId: null, ownership: 'unknown'}, which is deliberately the
   *   "don't know yet" state rather than a silent "not owned".
   */
  private applyIdentity(
    identity: BuildUrlIdentity | null,
    opts: { resetBaseline: boolean; publish: boolean; savedBuildId?: string | null; ownership?: BuildOwnership }
  ): void {
    this.stateSubject.next(identity ? {
      shortId: identity.shortId,
      name: identity.name,
      savedBuildId: opts.savedBuildId ?? null,
      isDirty: opts.resetBaseline ? false : this.stateSubject.value.isDirty,
      ownership: opts.ownership ?? 'unknown'
    } : UNSAVED_STATE);
    if (opts.resetBaseline) {
      this.resetBaseline();
    }
    this.queryParams.setBuildIdentityForUrl(identity);
    if (opts.publish) {
      this.queryParams.publishBuildIdentity(identity);
    }
  }

  /**
   * Call once a shared/saved build's params have been applied to the build.
   * `savedBuildId` is only ever passed by a caller that already knows it
   * directly (there is no such caller in production today - loading a build
   * always goes through the public, ownership-blind GET /api/build/:shortId,
   * so ownership starts 'unknown' and the caller is expected to follow up
   * with confirmOwnership() once it's actually checked).
   */
  markLoaded(params: {
    shortId: string;
    name: string;
    savedBuildId?: string | null;
    canonicalParams: Record<string, string | Array<string>>;
  }): void {
    this.canonicalParamsCache = { shortId: params.shortId, params: params.canonicalParams };
    const savedBuildId = params.savedBuildId ?? null;
    this.applyIdentity(
      { shortId: params.shortId, name: params.name },
      { resetBaseline: true, publish: true, savedBuildId, ownership: savedBuildId != null ? 'owned' : 'unknown' }
    );
  }

  /**
   * Called when browser back/forward restores a dirty edit's identity from
   * the URL (see QueryParamsService.buildIdentityFromUrl$) - updates only
   * the build's identity fields, deliberately NOT touching the dirty-
   * tracking baseline or canonicalParamsCache the way markLoaded/markSaved
   * do. The restored point is a mid-edit-session snapshot, not a new
   * canonical clean state - treating it as one would let the dirty
   * indicator (and the cache MainComponent uses to restore the true clean
   * state) drift to wherever the user last happened to land via history
   * navigation, instead of staying pinned to the build's actual last saved
   * state. See applyIdentity's comment for why this doesn't publish.
   *
   * Ownership can't come from the URL (see BuildUrlIdentity's comment) - if
   * the restored point is the same build (shortId unchanged) whatever
   * ownership was already resolved is carried forward untouched, since
   * nothing about ownership actually changed. Landing on a genuinely
   * different build's identity (a different shortId, or newly-null where it
   * wasn't before) resets to 'unknown' - MainComponent's
   * buildIdentityFromUrl$ subscriber is expected to re-run confirmOwnership()
   * for it, the same as a fresh load.
   */
  restoreIdentity(identity: BuildUrlIdentity): void {
    const current = this.stateSubject.value;
    const sameBuild = identity.shortId === current.shortId;
    this.applyIdentity(identity, {
      resetBaseline: false,
      publish: false,
      savedBuildId: sameBuild ? current.savedBuildId : null,
      ownership: sameBuild ? current.ownership : 'unknown'
    });
  }

  /**
   * Anyone can name/rename the current build at any time, whether or not
   * it's ever been saved (see the plan's "Naming without saving") - no
   * network call, no dirty-baseline/canonicalParamsCache touch, and no
   * requirement that shortId/savedBuildId be set. Renaming doesn't change
   * ownership, so the existing savedBuildId/ownership just carry forward.
   * Also refreshes the live-edit URL immediately (see refreshLiveEditUrl's
   * comment) so a name typed onto a fresh scratch build survives a reload
   * or being copy-pasted before any further gear edit would otherwise carry
   * it along.
   */
  setName(name: string): void {
    const current = this.stateSubject.value;
    this.applyIdentity(
      { shortId: current.shortId, name },
      { resetBaseline: false, publish: true, savedBuildId: current.savedBuildId, ownership: current.ownership }
    );
    this.queryParams.refreshLiveEditUrl();
  }

  /**
   * Resolves the loaded build's ownership once the caller has actually
   * checked it (by cross-referencing the signed-in viewer's own listMine()
   * results) - this is the only legitimate source of ownership now that it
   * can't travel through the URL. `savedBuildId` non-null means a match was
   * found (ownership becomes 'owned'); explicitly passing null means the
   * check completed and found no match (ownership becomes 'other' - NOT
   * left at 'unknown', which would otherwise never resolve for a build that
   * genuinely isn't the viewer's). A no-op if a different build has since
   * loaded.
   */
  confirmOwnership(shortId: string, savedBuildId: string | null): void {
    const current = this.stateSubject.value;
    if (current.shortId !== shortId) {
      return;
    }
    this.applyIdentity(
      { shortId, name: current.name ?? '' },
      { resetBaseline: false, publish: true, savedBuildId, ownership: savedBuildId != null ? 'owned' : 'other' }
    );
  }

  /**
   * Call once a create or rename/update save completes. `canonicalParams` is
   * optional (unlike markLoaded, where it's required): createBuild/
   * saveInPlace changed the build's actual content and must re-cache it,
   * but a name-only rename leaves the underlying gear/filter params
   * untouched, so the existing cache entry for this shortId is still
   * correct and shouldn't be overwritten with a redundant recompute.
   * Ownership is always 'owned' here - the caller just got `savedBuildId`
   * back directly from a successful create/update response, so there's
   * nothing left to confirm.
   */
  markSaved(params: {
    savedBuildId: string;
    shortId: string;
    name: string;
    canonicalParams?: Record<string, string | Array<string>>;
  }): void {
    if (params.canonicalParams) {
      this.canonicalParamsCache = { shortId: params.shortId, params: params.canonicalParams };
    }
    this.applyIdentity(
      { shortId: params.shortId, name: params.name },
      { resetBaseline: true, publish: true, savedBuildId: params.savedBuildId, ownership: 'owned' }
    );
  }

  /** Null if nothing is cached for this shortId (e.g. a fresh session that never re-fetched it). */
  getCanonicalParamsCache(shortId: string): Record<string, string | Array<string>> | null {
    return this.canonicalParamsCache?.shortId === shortId ? this.canonicalParamsCache.params : null;
  }

  /** Call when the currently-loaded build is deleted, or navigating to a fresh scratch build. */
  reset(): void {
    // Idempotency guard, not just an optimization: MainComponent's
    // buildIdentityFromUrl$ subscriber calls reset() when it sees a null
    // identity with no route shortId - and applyIdentity(null, ...)'s own
    // publishBuildIdentity(null) call is exactly what produces that null
    // emission. Without this check, an already-unsaved state calling
    // reset() again would publish null again, re-triggering that same
    // subscriber branch, forever. UNSAVED_STATE is a single shared
    // constant, always assigned by reference (both here and in the
    // BehaviorSubject's initial value), so reference equality reliably
    // means "already reset."
    if (this.stateSubject.value === UNSAVED_STATE) {
      return;
    }
    this.canonicalParamsCache = null;
    this.applyIdentity(null, { resetBaseline: true, publish: true });
  }

  private resetBaseline(): void {
    this.baselineParamsJson = this.stableStringify(this.queryParams.getCombinedParams());
  }

  private setDirty(isDirty: boolean): void {
    if (this.stateSubject.value.isDirty === isDirty) {
      return;
    }
    this.stateSubject.next({ ...this.stateSubject.value, isDirty });
  }

  // combinedParams' key order must be deterministic between "just loaded"
  // and "after unrelated UI churn" for this comparison to be meaningful -
  // sorting keys here guarantees that regardless of the insertion order
  // _makeNavigateFn's merge happens to produce.
  private stableStringify(record: Record<string, unknown>): string {
    return JSON.stringify(Object.keys(record).sort().map(key => [key, record[key]]));
  }
}
