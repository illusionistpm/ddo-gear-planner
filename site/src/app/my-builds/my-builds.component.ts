import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, OnInit, Output } from '@angular/core';
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';

import { BuildSummary, MAX_BUILDS_PER_USER } from '../build';
import { BuildsService } from '../builds.service';
import { CurrentBuildService } from '../current-build.service';
import { confirmLeaveUnsavedChanges } from '../unsaved-changes.guard';
import { buildPath } from '../build-route';

@Component({
  selector: 'app-my-builds',
  templateUrl: './my-builds.component.html',
  styleUrls: ['./my-builds.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false
})
export class MyBuildsComponent implements OnInit {
  @Output() closed = new EventEmitter<void>();

  readonly maxBuilds = MAX_BUILDS_PER_USER;
  builds: BuildSummary[] | null = null;
  loadError: string | null = null;
  deletingId: string | null = null;
  deleteError: string | null = null;
  confirmingDeleteId: string | null = null;

  constructor(
    private readonly buildsService: BuildsService,
    private readonly currentBuild: CurrentBuildService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {}

  // Not fetched from the constructor: DI construction order isn't the same
  // guarantee as "this component is actually about to render" (a
  // constructor can run during change detection setup, before Angular
  // considers the component initialized), and firing an HTTP call from a
  // constructor is a well-known way to end up doing it earlier or more
  // often than intended if this component's instantiation timing ever
  // changes. ngOnInit is the idiomatic place for a component's initial data
  // fetch.
  ngOnInit(): void {
    this.refresh();
  }

  // OnPush doesn't pick up state set from inside an HTTP subscribe callback
  // on its own (no @Input changed, no template event, no async pipe) -
  // markForCheck tells it this component needs to be checked next tick,
  // instead of only refreshing on the next unrelated click.
  refresh(): void {
    this.loadError = null;
    this.buildsService.listMine().subscribe({
      next: builds => {
        this.builds = builds;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadError = 'Could not load your builds. Please try again.';
        this.cdr.markForCheck();
      }
    });
  }

  isCurrentBuild(build: BuildSummary): boolean {
    return build.id === this.currentBuild.value.savedBuildId;
  }

  newBuild(): void {
    // Same manual check as open() below, for the same reason: navigating to
    // '/' is explicitly whitelisted by unsaved-changes.guard.ts's
    // CanDeactivate (so genuine browser back/forward and the drop-to-root-
    // on-dirty-edit mechanism never get blocked by it), so it never shows a
    // confirm on its own here - this is the only thing that will.
    if (!confirmLeaveUnsavedChanges(this.currentBuild)) {
      return;
    }

    this.currentBuild.reset();
    this.router.navigateByUrl('/');
    this.closed.emit();
  }

  open(build: BuildSummary): void {
    // Angular's CanDeactivate guard (unsaved-changes.guard.ts) doesn't fire
    // here: this and the destination both match the same /build/:shortId
    // route config, so the router reuses MainComponent rather than
    // deactivating it. Check directly instead.
    if (!confirmLeaveUnsavedChanges(this.currentBuild)) {
      return;
    }

    this.router.navigateByUrl(buildPath(build.shortId, build.name));
    this.closed.emit();
  }

  requestDelete(build: BuildSummary, event: Event): void {
    event.stopPropagation();
    // Belt-and-suspenders: the template already disables this button for
    // the currently open build (deleting it out from under yourself dumps
    // you back on the start page with nothing loaded), but guard here too
    // in case this is ever reachable another way.
    if (this.isCurrentBuild(build)) {
      return;
    }
    this.confirmingDeleteId = build.id;
  }

  cancelDelete(event: Event): void {
    event.stopPropagation();
    this.confirmingDeleteId = null;
  }

  confirmDelete(build: BuildSummary, event: Event): void {
    event.stopPropagation();
    this.deleteError = null;
    this.deletingId = build.id;

    this.buildsService.delete(build.id).pipe(
      finalize(() => {
        this.deletingId = null;
        this.confirmingDeleteId = null;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: () => {
        this.builds = (this.builds ?? []).filter(existing => existing.id !== build.id);
        if (this.currentBuild.value.savedBuildId === build.id) {
          this.currentBuild.reset();
          this.router.navigateByUrl('/');
        }
      },
      error: () => (this.deleteError = 'Could not delete that build. Please try again.')
    });
  }
}
