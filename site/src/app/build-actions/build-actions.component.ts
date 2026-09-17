import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, of, Subscription } from 'rxjs';
import { map } from 'rxjs/operators';

import { AnalyticsService } from '../analytics.service';
import { AuthService } from '../auth.service';
import { Build } from '../build';
import { BuildUrlCodecService } from '../build-url-codec.service';
import { BuildsService } from '../builds.service';
import { Clipboard } from '../clipboard';
import { CurrentBuildService, CurrentBuildState } from '../current-build.service';
import { EquippedService } from '../equipped.service';
import { QueryParamsService } from '../query-params.service';
import { ShortLinksService } from '../short-links.service';
import { slugifyBuildName } from '../build-slug';
import { validateBuildName } from '../save-build-dialog/save-build-dialog.component';

type DialogMode = 'create' | 'save-as';
type ShareCopyKind = 'link' | 'text-link' | 'text';

@Component({
  selector: 'app-build-actions',
  templateUrl: './build-actions.component.html',
  styleUrls: ['./build-actions.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false
})
export class BuildActionsComponent implements OnInit, OnDestroy {
  buildState: CurrentBuildState = {
    savedBuildId: null,
    shortId: null,
    name: null,
    isDirty: false,
    ownership: 'other'
  };
  isAuthenticated = false;
  userDisplayName: string | null = null;
  userPicture: string | null = null;
  userInitial = '?';

  dialogOpen = false;
  dialogMode: DialogMode = 'create';
  dialogInitialName = '';
  dialogSaving = false;
  dialogError: string | null = null;

  myBuildsOpen = false;
  avatarMenuOpen = false;
  shareMenuOpen = false;
  // Transient "Copied!" confirmation - which share-menu action last copied
  // something, cleared after a short delay. Not persisted/tested down to
  // the millisecond, just a nicety since copyLink/copyTextAndLink now have
  // a real network round-trip when authenticated and aren't as obviously
  // instant as a plain clipboard copy.
  justCopied: ShareCopyKind | null = null;

  editingName = false;
  nameDraft = '';
  renameError: string | null = null;

  // True while an in-place Save (saveInPlace, below) is in flight - unlike
  // create/Save As, this path has no dialog to show its own "Saving…" state
  // (see save-build-dialog.component's `dialogSaving`), so the primary
  // button needs its own indicator or clicking Save looks like nothing
  // happened for however long the request takes.
  savingInPlace = false;

  @ViewChild('nameInput') private readonly nameInputRef?: ElementRef<HTMLInputElement>;

  private buildStateSub?: Subscription;
  private authSub?: Subscription;
  private userSub?: Subscription;

  constructor(
    private readonly currentBuild: CurrentBuildService,
    private readonly buildsService: BuildsService,
    private readonly shortLinks: ShortLinksService,
    private readonly queryParams: QueryParamsService,
    private readonly codec: BuildUrlCodecService,
    private readonly equipped: EquippedService,
    private readonly analytics: AnalyticsService,
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {}

  // OnPush doesn't redraw on its own when state is mutated from inside an
  // async callback (an HTTP/observable subscription, not a template event) -
  // every subscription and callback below that mutates component state
  // calls markForCheck for exactly this reason. Without it, e.g. the Save
  // dialog's "Saving..." state can end up set back to false internally but
  // never actually clear from the screen.
  ngOnInit(): void {
    this.buildStateSub = this.currentBuild.state$.subscribe(state => {
      this.buildState = state;
      this.cdr.markForCheck();
    });
    this.authSub = this.auth.isAuthenticated$.subscribe(value => {
      this.isAuthenticated = value;
      this.cdr.markForCheck();
    });
    this.userSub = this.auth.user$.subscribe(user => {
      this.userDisplayName = (user?.name as string) ?? (user?.email as string) ?? null;
      this.userPicture = (user?.picture as string) ?? null;
      this.userInitial = this.userDisplayName ? this.userDisplayName.charAt(0).toUpperCase() : '?';
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.buildStateSub?.unsubscribe();
    this.authSub?.unsubscribe();
    this.userSub?.unsubscribe();
  }

  signIn(): void {
    this.auth.signIn();
  }

  signOut(): void {
    this.avatarMenuOpen = false;
    this.auth.signOut();
  }

  toggleAvatarMenu(): void {
    this.avatarMenuOpen = !this.avatarMenuOpen;
    this.myBuildsOpen = false;
  }

  closeAvatarMenu(): void {
    this.avatarMenuOpen = false;
  }

  toggleShareMenu(): void {
    this.shareMenuOpen = !this.shareMenuOpen;
    this.myBuildsOpen = false;
    this.avatarMenuOpen = false;
  }

  closeShareMenu(): void {
    this.shareMenuOpen = false;
  }

  // Naming is available to anyone, saved or not, signed in or not - see the
  // plan's "Naming without saving". commitRename() below branches on
  // whether there's actually a savedBuildId to persist the rename to.
  startRename(): void {
    this.nameDraft = this.buildState.name ?? '';
    this.renameError = null;
    this.editingName = true;
    // The input doesn't exist in the DOM until the @if switches over on the
    // next change-detection pass triggered by this click - defer the focus
    // until then instead of racing it.
    setTimeout(() => {
      this.nameInputRef?.nativeElement.focus();
      this.nameInputRef?.nativeElement.select();
    });
  }

  cancelRename(): void {
    this.editingName = false;
    this.renameError = null;
  }

  commitRename(): void {
    if (!this.editingName) {
      return;
    }

    const validated = validateBuildName(this.nameDraft);
    if (!validated) {
      this.cancelRename();
      return;
    }
    if (validated === this.buildState.name) {
      this.editingName = false;
      return;
    }

    const savedBuildId = this.buildState.savedBuildId;
    if (!savedBuildId) {
      // Nothing saved yet (or this build isn't ours) - nothing to persist
      // or duplicate-check against, just update the local name. See
      // CurrentBuildService.setName().
      this.editingName = false;
      this.renameError = null;
      this.currentBuild.setName(validated);
      this.cdr.markForCheck();
      return;
    }

    // Same duplicate-name guard as Save As - check against the user's own
    // builds (excluding this one) before committing, and don't let a failed
    // check itself block the rename.
    this.buildsService.listMine().subscribe({
      next: builds => this.rejectDuplicateRenameOrSave(validated, savedBuildId, builds),
      error: () => this.saveRename(savedBuildId, validated)
    });
  }

  private rejectDuplicateRenameOrSave(name: string, savedBuildId: string, existingBuilds: Build[]): void {
    const isDuplicate = existingBuilds.some(
      build => build.id !== savedBuildId && build.name.trim().toLowerCase() === name.trim().toLowerCase()
    );
    if (isDuplicate) {
      this.renameError = `You already have a build named "${name}". Choose a different name.`;
      this.cdr.markForCheck();
      return;
    }
    this.saveRename(savedBuildId, name);
  }

  private saveRename(savedBuildId: string, name: string): void {
    this.buildsService.update(savedBuildId, { name }).subscribe({
      next: build => {
        this.editingName = false;
        this.renameError = null;
        this.currentBuild.markSaved({ savedBuildId: build.id, shortId: build.shortId, name: build.name });
        this.navigateToSavedBuild(build.shortId, build.name);
        this.cdr.markForCheck();
      },
      error: () => {
        this.renameError = 'Could not rename that build. Please try again.';
        this.cdr.markForCheck();
      }
    });
  }

  // Save/Save-As button-state matrix (see the plan): both require being
  // signed in - there's nothing to click through to but a sign-in redirect
  // otherwise, so anonymous visitors get a single "Sign in to save builds"
  // button instead. Once authenticated: an unnamed build only offers
  // "Save…"; a named+owned build offers in-place "Save" (disabled once
  // clean) plus "Save As…"; anything not owned by the viewer only offers
  // "Save As…".
  get showPrimarySave(): boolean {
    return this.isAuthenticated && (!this.buildState.shortId || (this.buildState.ownership === 'owned' && this.buildState.isDirty));
  }

  get primarySaveLabel(): string {
    if (this.savingInPlace) {
      return 'Saving…';
    }
    return this.buildState.shortId ? 'Save' : 'Save…';
  }

  get primarySaveDisabled(): boolean {
    if (this.savingInPlace) {
      return true;
    }
    return this.buildState.shortId != null && this.buildState.ownership === 'owned' && !this.buildState.isDirty;
  }

  get showSaveAs(): boolean {
    return this.isAuthenticated && this.buildState.shortId != null;
  }

  onPrimarySaveClick(): void {
    if (!this.isAuthenticated) {
      this.auth.signIn();
      return;
    }

    if (!this.buildState.shortId) {
      this.openDialog('create', this.buildState.name ?? '');
      return;
    }

    if (this.buildState.ownership === 'owned' && this.buildState.savedBuildId && !this.savingInPlace) {
      this.saveInPlace(this.buildState.savedBuildId);
    }
  }

  onSaveAsClick(): void {
    if (!this.isAuthenticated) {
      this.auth.signIn();
      return;
    }
    this.openDialog('save-as', this.buildState.name ?? '');
  }

  openDialog(mode: DialogMode, initialName: string): void {
    this.dialogMode = mode;
    this.dialogInitialName = initialName;
    this.dialogError = null;
    this.dialogOpen = true;
  }

  closeDialog(): void {
    if (this.dialogSaving) {
      return;
    }
    this.dialogOpen = false;
  }

  onDialogConfirmed(name: string): void {
    this.dialogSaving = true;
    this.dialogError = null;

    // 'create' and 'save-as' both end up here and both create a brand new
    // build row - check for a name collision against the user's own builds
    // first and block outright, since nothing else stops someone from
    // ending up with two builds named the same thing otherwise. Best-
    // effort: if the check itself fails, don't let that block the save -
    // just proceed as if no duplicate was found.
    this.buildsService.listMine().subscribe({
      next: builds => this.rejectDuplicateNameOrCreate(name, builds),
      error: () => this.createBuild(name)
    });
  }

  private rejectDuplicateNameOrCreate(name: string, existingBuilds: { name: string }[]): void {
    const isDuplicate = existingBuilds.some(build => build.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (isDuplicate) {
      this.dialogSaving = false;
      this.dialogError = `You already have a build named "${name}". Choose a different name.`;
      this.cdr.markForCheck();
      return;
    }
    this.createBuild(name);
  }

  private createBuild(name: string): void {
    this.buildsService.create(name, this.currentBlob()).subscribe({
      next: build => {
        this.dialogSaving = false;
        this.dialogOpen = false;
        // Cache this content locally before navigating - if the build is
        // edited again and browser back later returns all the way to this
        // bare /build/:shortId/:slug URL, MainComponent reapplies this cache
        // synchronously instead of re-fetching over the network (see
        // CurrentBuildService.getCanonicalParamsCache's comment).
        this.currentBuild.markSaved({
          savedBuildId: build.id,
          shortId: build.shortId,
          name: build.name,
          canonicalParams: this.queryParams.getCombinedParams() as Record<string, string | string[]>
        });
        this.navigateToSavedBuild(build.shortId, build.name);
        this.cdr.markForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.dialogSaving = false;
        // Surface a specific, actionable message when the worker rejects
        // the create for a known reason (e.g. hitting the per-account build
        // limit - see worker/src/routes/builds.ts's MAX_BUILDS_PER_USER)
        // rather than always showing the same generic fallback.
        this.dialogError = typeof err.error?.error === 'string'
          ? err.error.error
          : 'Could not save that build. Please try again.';
        this.cdr.markForCheck();
      }
    });
  }

  onMyBuildsClick(): void {
    this.myBuildsOpen = true;
    this.avatarMenuOpen = false;
  }

  closeMyBuilds(): void {
    this.myBuildsOpen = false;
  }

  private saveInPlace(savedBuildId: string): void {
    this.savingInPlace = true;
    this.buildsService.update(savedBuildId, { blob: this.currentBlob() }).subscribe({
      next: build => {
        this.savingInPlace = false;
        // See createBuild()'s comment - same caching, so browser back to
        // this build's bare URL after further edits doesn't need a
        // network round trip to restore this saved content.
        this.currentBuild.markSaved({
          savedBuildId: build.id,
          shortId: build.shortId,
          name: build.name,
          canonicalParams: this.queryParams.getCombinedParams() as Record<string, string | string[]>
        });
        // Editing a loaded build accumulates a ?b= query param on the root
        // route (see QueryParamsService.navigateWithParams) once it's
        // dirty, so a mid-edit refresh doesn't lose unsaved changes -
        // navigate back to the clean /build/:shortId/:slug URL now that
        // it's saved, or the address bar is left pointing at that
        // now-stale root/b= URL for an already-clean build.
        this.navigateToSavedBuild(build.shortId, build.name);
        this.cdr.markForCheck();
      },
      // A failed in-place save leaves isDirty as-is (no dialog to show an
      // error in for this path) - just clear the saving indicator so the
      // button re-enables and the user can simply try again.
      error: () => {
        this.savingInPlace = false;
        this.cdr.markForCheck();
      }
    });
  }

  private currentBlob(): string {
    return this.codec.encode(this.queryParams.getCombinedParams());
  }

  private navigateToSavedBuild(shortId: string, name: string): void {
    this.router.navigateByUrl(`/build/${encodeURIComponent(shortId)}/${slugifyBuildName(name)}`, { replaceUrl: true });
  }

  // Link-copying is available to everyone - signed in gets a minted short
  // link (network round trip), signed out gets the current long ?b=... URL
  // (window.location.href, zero network - already reflects the current
  // gear and name thanks to CurrentBuildService.setName()/
  // QueryParamsService.refreshLiveEditUrl()). See the plan for why short
  // links are locked behind sign-in.
  private getShareUrl(): Observable<string> {
    if (!this.isAuthenticated) {
      return of(window.location.href);
    }
    return this.shortLinks.create(this.currentBlob(), this.buildState.name ?? '').pipe(
      map(({ shortId }) => {
        const slugSegment = this.buildState.name ? `/${slugifyBuildName(this.buildState.name)}` : '';
        return `${window.location.origin}/build/${encodeURIComponent(shortId)}${slugSegment}`;
      })
    );
  }

  copyLink(): void {
    this.getShareUrl().subscribe(url => {
      Clipboard.copy(url);
      this.trackShareCopy('link');
      this.finishShareCopy('link');
    });
  }

  copyTextAndLink(): void {
    this.getShareUrl().subscribe(url => {
      Clipboard.copy(`${this.equipped.getGearDescription()}\n${url}`);
      this.trackShareCopy('text-link');
      this.finishShareCopy('text-link');
    });
  }

  copyTextOnly(): void {
    Clipboard.copy(this.equipped.getGearDescription());
    this.trackShareCopy('text');
    this.finishShareCopy('text');
  }

  private finishShareCopy(kind: ShareCopyKind): void {
    this.justCopied = kind;
    this.cdr.markForCheck();
    setTimeout(() => {
      this.justCopied = null;
      this.cdr.markForCheck();
    }, 1500);
  }

  private trackShareCopy(kind: ShareCopyKind): void {
    const equippedSlotCount = Array.from(this.equipped.getSlotsSnapshot().values()).filter(item => item && item.isValid()).length;
    this.analytics.track('copy_build', {
      copy_kind: kind,
      link_kind: kind === 'text' ? 'none' : (this.isAuthenticated ? 'short' : 'long'),
      equipped_slot_count: equippedSlotCount
    });
  }
}
