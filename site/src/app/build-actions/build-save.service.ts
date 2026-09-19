import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, map, of, switchMap, tap, throwError } from 'rxjs';

import { Build, BuildSummary, MAX_BLOB_LENGTH } from '../build';
import { buildPath } from '../build-route';
import { BuildsService } from '../builds.service';
import { CurrentBuildService } from '../current-build.service';
import { QueryParamsService } from '../query-params.service';

/** A save/rename failure, carrying the message to show the user. */
export class BuildSaveError extends Error { }

const TOO_LARGE = 'This build is too large to save - try tracking fewer items or affixes.';
const SAVE_FAILED = 'Could not save that build. Please try again.';
const RENAME_FAILED = 'Could not rename that build. Please try again.';

/**
 * Persists the current build: create (also Save As), save in place, and
 * rename. Each call checks what it must, records the result on
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
    private readonly router: Router
  ) { }

  /** Creates a new build row from the current build - both "Save…" and Save As. */
  create(name: string): Observable<void> {
    return this.rejectDuplicateName(name, null).pipe(
      switchMap(() => {
        const blob = this.encodeWithinLimit();
        return this.buildsService.create(name, blob).pipe(
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

  saveInPlace(savedBuildId: string): Observable<void> {
    return of(null).pipe(
      map(() => this.encodeWithinLimit()),
      switchMap(blob => this.buildsService.update(savedBuildId, { blob }).pipe(
        catchError(() => throwError(() => new BuildSaveError(SAVE_FAILED)))
      )),
      tap(build => this.recordSaved(build, true)),
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

  /**
   * `cacheContent`: a content save also caches the params locally, so browser
   * back to this build's bare URL after further edits reapplies them without a
   * network fetch (see CurrentBuildService.getCanonicalParamsCache). Then
   * leave the ?b= edit URL for the now-clean /build/:shortId/:slug one.
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
    this.router.navigateByUrl(buildPath(build.shortId, build.name), { replaceUrl: true });
  }
}
