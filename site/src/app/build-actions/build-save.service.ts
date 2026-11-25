import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, map, of, switchMap, tap, throwError } from 'rxjs';

import { Build, BuildSummary, MAX_BLOB_LENGTH } from '../build/build';
import { gearSummaryOf } from '../build/build-gear-summary';
import { buildPath, urlFragmentOf } from '../build/build-route';
import { BuildsService } from '../build/builds.service';
import { BuildUrlCodecService } from '../build/build-url-codec.service';
import { CurrentBuildService } from '../build/current-build.service';
import { QueryParamsService } from '../build/query-params.service';
import { EquippedService } from '../planner/equipped.service';
import { ShoppingListService } from '../planner/shopping-list/shopping-list.service';

/** A save/rename failure, carrying the message to show the user. */
export class BuildSaveError extends Error { }

const TOO_LARGE = 'This build is too large to save - try tracking fewer items or affixes.';
const SAVE_FAILED = 'Could not save that build. Please try again.';
const RENAME_FAILED = 'Could not rename that build. Please try again.';
const DISCARD_FAILED = 'Could not load the saved build. Please try again.';

/**
 * Persists the current build: create (also Save As), save in place, and
 * rename - and its opposite, discarding edits for the saved copy. Each call
 * checks what it must, records the result on
 * CurrentBuildService, and navigates to the build's clean
 * /build/:shortId/:slug URL, or errors with a BuildSaveError.
 */
@Injectable({
  providedIn: 'root'
})
export class BuildSaveService {
  constructor(
    private readonly buildsService: BuildsService,
    private readonly currentBuild: CurrentBuildService,
    private readonly queryParams: QueryParamsService,
    private readonly router: Router,
    private readonly shoppingList: ShoppingListService,
    private readonly equipped: EquippedService,
    private readonly buildUrlCodec: BuildUrlCodecService
  ) { }

  /** Creates a new build row from the current build - both "Save…" and Save As. */
  create(name: string): Observable<void> {
    return this.rejectDuplicateName(name, null).pipe(
      switchMap(() => {
        const blob = this.encodeWithinLimit();
        return this.buildsService.create(name, blob, this.gearSummary()).pipe(
          // Surface the worker's specific reason when it gives one (e.g. the
          // per-account build limit - worker/src/routes/builds.ts's
          // MAX_BUILDS_PER_USER) rather than always the generic fallback.
          catchError((err: HttpErrorResponse) => throwError(() => new BuildSaveError(
            typeof err.error?.error === 'string' ? err.error.error : SAVE_FAILED
          )))
        );
      }),
      tap(build => this.recordSaved(build, true)),
      map(() => undefined)
    );
  }

  /**
   * Saves the current build over its saved copy. Its shopping list, as it
   * is for the build being saved, goes with it, so friends following the
   * list get the new gear and what it still needs in one step.
   */
  saveInPlace(savedBuildId: string): Observable<void> {
    return of(null).pipe(
      map(() => ({ blob: this.encodeWithinLimit(), summary: this.gearSummary(), progress: this.shoppingList.progressForSave() })),
      switchMap(({ blob, summary, progress }) => this.buildsService.update(savedBuildId,
        progress ? { blob, summary, progress } : { blob, summary }).pipe(
        catchError(() => throwError(() => new BuildSaveError(SAVE_FAILED))),
        map(build => ({ build, progress }))
      )),
      tap(({ build, progress }) => {
        this.recordSaved(build, true);
        if (progress) {
          this.shoppingList.savedWithBuild(progress, build.progressSaved === true);
        }
      }),
      map(() => undefined)
    );
  }

  rename(savedBuildId: string, name: string): Observable<void> {
    return this.rejectDuplicateName(name, savedBuildId).pipe(
      switchMap(() => this.buildsService.update(savedBuildId, { name }).pipe(
        catchError(() => throwError(() => new BuildSaveError(RENAME_FAILED)))
      )),
      tap(build => this.recordSaved(build, false)),
      map(() => undefined)
    );
  }

  /**
   * Throws away unsaved edits: puts the build back as it was last saved and
   * returns to its clean /build/:shortId/:slug URL. The params come from the
   * local cache when this session loaded or saved the build, else from the
   * server. A new history entry, not a replacement, so browser back still
   * reaches the discarded edits.
   */
  discardChanges(): Observable<void> {
    const { shortId, name, savedBuildId, ownership } = this.currentBuild.value;
    if (!shortId) {
      return throwError(() => new BuildSaveError(DISCARD_FAILED));
    }
    const cached = this.currentBuild.getCanonicalParamsCache(shortId);
    const saved$: Observable<{ name: string; params: Record<string, string | string[]> }> = cached
      ? of({ name: name ?? '', params: cached })
      : this.buildsService.getByShortId(shortId).pipe(
        catchError(() => throwError(() => new BuildSaveError(DISCARD_FAILED))),
        map(build => {
          const params = this.buildUrlCodec.decode(build.blob);
          if (!params) {
            throw new BuildSaveError(DISCARD_FAILED);
          }
          return { name: build.name, params: params as Record<string, string | string[]> };
        })
      );
    return saved$.pipe(
      tap(saved => {
        this.queryParams.applyDecodedBuildParams(saved.params);
        this.currentBuild.markLoaded({ shortId, name: saved.name, savedBuildId, canonicalParams: saved.params });
        // Whose build it is hasn't changed: keep it rather than leave it to
        // be checked again ('unknown' would disable Save meanwhile).
        if (ownership !== 'unknown') {
          this.currentBuild.confirmOwnership(shortId, savedBuildId);
        }
        this.router.navigateByUrl(buildPath(shortId, saved.name) + urlFragmentOf(this.router.url));
      }),
      map(() => undefined)
    );
  }

  /**
   * Errors if another of the user's builds (other than `ownBuildId`) already
   * has this name, compared case-insensitively and ignoring surrounding
   * whitespace. Best effort: if the lookup itself fails, the save proceeds.
   */
  private rejectDuplicateName(name: string, ownBuildId: string | null): Observable<void> {
    const normalized = name.trim().toLowerCase();
    return this.buildsService.listMine().pipe(
      catchError(() => of([] as BuildSummary[])),
      map(builds => {
        if (builds.some(build => build.id !== ownBuildId && build.name.trim().toLowerCase() === normalized)) {
          throw new BuildSaveError(`You already have a build named "${name}". Choose a different name.`);
        }
      })
    );
  }

  /**
   * The worker's validateBlob() stays the authoritative size check (its API is
   * callable directly) - this is an earlier, friendlier rejection than its 400,
   * which can't say anything more specific than "a blob is required".
   */
  private encodeWithinLimit(): string {
    const blob = this.queryParams.encodeCurrentBuild();
    if (blob.length > MAX_BLOB_LENGTH) {
      throw new BuildSaveError(TOO_LARGE);
    }
    return blob;
  }

  /** What the build list shows for the gear being saved. */
  private gearSummary() {
    return gearSummaryOf(this.equipped.getSlotsSnapshot());
  }

  /**
   * `cacheContent`: a content save also caches the params locally, so browser
   * back to this build's bare URL after further edits reapplies them without a
   * network fetch (see CurrentBuildService.getCanonicalParamsCache). Then
   * leave the ?b= edit URL for the now-clean /build/:shortId/:slug one,
   * keeping its fragment - the view on screen stays open.
   */
  private recordSaved(build: Build, cacheContent: boolean) {
    this.currentBuild.markSaved({
      savedBuildId: build.id,
      shortId: build.shortId,
      name: build.name,
      ...(cacheContent
        ? { canonicalParams: this.queryParams.getCombinedParams() as Record<string, string | string[]> }
        : {})
    });
    this.router.navigateByUrl(buildPath(build.shortId, build.name) + urlFragmentOf(this.router.url), { replaceUrl: true });
  }
}
