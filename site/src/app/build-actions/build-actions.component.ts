import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild
} from '@angular/core';
import { Subscription } from 'rxjs';

import { AuthService } from '../shared/auth.service';
import { CurrentBuildService, CurrentBuildState } from '../build/current-build.service';
import { MAX_BUILD_NAME_LENGTH, validateBuildName } from '../save-build-dialog/save-build-dialog.component';
import { BuildSaveError, BuildSaveService } from './build-save.service';

type DialogMode = 'create' | 'save-as';

// The popovers hanging off the build bar. At most one is open at a time.
// 'build' opens over the build's name: rename, Save As, My builds.
export type BuildActionsMenu = 'build' | 'share' | 'account';

/** How long Save says "Saved" after a save lands. */
const SAVED_FLASH_MS = 1600;

// The view model behind the single save split-button (see the plan's "Save
// controls" section) - one primary action whose label/enabled-ness follows
// buildState, plus an optional caret for a secondary action. Always shown
// when signed in, even for a build the viewer doesn't own or hasn't had
// ownership confirmed for yet: Save As/"Save a copy" is the ONLY save
// affordance in those states, so hiding the whole control behind a
// conditionally-rendered button (the old showPrimarySave/showSaveAs split)
// would leave them with no way to save at all.
export interface SaveControlViewModel {
  label: string;
  // Shown instead of `label` below 768px, where the first line of the page
  // chrome has about 65px for this button. Only "Save a copy" needs one; the
  // rest already fit, so they repeat their own label.
  shortLabel: string;
  disabled: boolean;
  // Whether the build menu offers Save As - only when there's a genuinely
  // distinct secondary action, i.e. an owned build where the primary action
  // is already "save in place". (Named for the split button's caret it once
  // revealed.)
  hasMenu: boolean;
}

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

  openMenu: BuildActionsMenu | null = null;
  editingName = false;
  nameDraft = '';
  renameError: string | null = null;
  // Bound to the rename input's [maxLength] - was a bare maxlength="60" in
  // the template, hand-duplicating validateBuildName's own limit.
  readonly nameMaxLength = MAX_BUILD_NAME_LENGTH;

  // True while an in-place Save (saveInPlace, below) is in flight - unlike
  // create/Save As, this path has no dialog to show its own "Saving…" state
  // (see save-build-dialog.component's `dialogSaving`), so the primary
  // button needs its own indicator or clicking Save looks like nothing
  // happened for however long the request takes.
  savingInPlace = false;
  // Same reasoning as above - saveInPlace has no dialog to surface an error
  // in either, so it needs its own slot (rendered next to the save
  // control) rather than silently clearing savingInPlace with nothing
  // shown, which is what this path used to do for every failure.
  savingInPlaceError: string | null = null;

  // A brief "Saved" on the Save button once a save lands - the button
  // otherwise just goes quietly disabled, which reads as nothing happening.
  justSaved = false;
  private justSavedTimer: ReturnType<typeof setTimeout> | null = null;
  // Enter in the name field commits and closes the menu; blur only commits.
  private closeAfterRename = false;

  @ViewChild('nameInput') private readonly nameInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('nameTrigger') private readonly nameTriggerRef?: ElementRef<HTMLButtonElement>;

  private buildStateSub?: Subscription;
  private authSub?: Subscription;
  private userSub?: Subscription;

  constructor(
    private readonly currentBuild: CurrentBuildService,
    private readonly buildSave: BuildSaveService,
    private readonly auth: AuthService,
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
    if (this.justSavedTimer) {
      clearTimeout(this.justSavedTimer);
    }
  }

  signIn(): void {
    this.auth.signIn();
  }

  signOut(): void {
    this.closeMenu();
    this.auth.signOut();
  }

  isMenuOpen(menu: BuildActionsMenu): boolean {
    return this.openMenu === menu;
  }

  /** Opens `menu` (closing whichever other one was open), or closes it if it's already open. */
  toggleMenu(menu: BuildActionsMenu): void {
    this.setOpenMenu(this.openMenu === menu ? null : menu);
  }

  closeMenu(): void {
    this.setOpenMenu(null);
  }

  // Also reached from outside this OnPush view: the account menu's rows are
  // MainComponent's projected content, and close it from there.
  private setOpenMenu(menu: BuildActionsMenu | null): void {
    this.openMenu = menu;
    this.cdr.markForCheck();
  }

  /** An owned, saved build with edits not yet saved: a dot by its name says so. */
  get showUnsavedDot(): boolean {
    return this.isAuthenticated && this.buildState.ownership === 'owned' && this.buildState.isDirty;
  }

  toggleBuildMenu(): void {
    if (this.isMenuOpen('build')) {
      this.closeBuildMenu();
    } else {
      this.startRename();
    }
  }

  /**
   * Closes the build menu without saving what's in the name field: Escape,
   * and a click elsewhere (which has already committed it on blur by then).
   */
  closeBuildMenu(): void {
    this.cancelRename();
    this.closeMenu();
    this.nameTriggerRef?.nativeElement.focus();
  }

  onNameEnter(): void {
    this.closeAfterRename = true;
    this.commitRename();
  }

  /** Up and down move between the name field and the menu's buttons. */
  onBuildMenuKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }
    const menu = event.currentTarget as HTMLElement;
    const items = [...menu.querySelectorAll<HTMLElement>('input, button:not(:disabled)')];
    if (!items.length) {
      return;
    }
    event.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    items[(index + step + items.length) % items.length].focus();
  }

  /**
   * Ctrl/Cmd+S saves, as everywhere else - rather than the browser saving
   * the page as HTML. Signed out there's no save to make, so the browser's
   * own shortcut is left alone.
   */
  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key?.toLowerCase() !== 's') {
      return;
    }
    if (!this.isAuthenticated || this.dialogOpen) {
      return;
    }
    event.preventDefault();
    // Mid-rename, the field's own commit is already on its way; a save on top
    // of it would race it.
    if (this.isMenuOpen('build') || this.saveControl.disabled) {
      return;
    }
    this.closeMenu();
    this.onSaveControlPrimaryClick();
  }

  private flashSaved(): void {
    this.justSaved = true;
    if (this.justSavedTimer) {
      clearTimeout(this.justSavedTimer);
    }
    this.justSavedTimer = setTimeout(() => {
      this.justSavedTimer = null;
      this.justSaved = false;
      this.cdr.markForCheck();
    }, SAVED_FLASH_MS);
  }

  // Naming is available to anyone, saved or not, signed in or not - see the
  // plan's "Naming without saving". commitRename() below branches on
  // whether there's actually a savedBuildId to persist the rename to.
  //
  // Renaming happens in the build menu, whose first row is the name as a
  // field, laid over the name in the bar - so this opens that menu.
  startRename(): void {
    this.setOpenMenu('build');
    this.nameDraft = this.buildState.name ?? '';
    this.renameError = null;
    this.editingName = true;
    this.closeAfterRename = false;
    // A touch screen would throw up its keyboard over the menu; there the
    // field waits for a tap. The input doesn't exist until the @if switches
    // over on the next change-detection pass, so defer the focus until then.
    if (prefersFinePointer()) {
      setTimeout(() => {
        this.nameInputRef?.nativeElement.focus();
        this.nameInputRef?.nativeElement.select();
      });
    }
  }

  cancelRename(): void {
    this.editingName = false;
    this.renameError = null;
    this.closeAfterRename = false;
    this.nameDraft = this.buildState.name ?? '';
  }

  commitRename(): void {
    if (!this.editingName) {
      return;
    }

    const validated = validateBuildName(this.nameDraft);
    if (!validated || validated === this.buildState.name) {
      // Nothing to save. An emptied field goes back to the name it had.
      this.nameDraft = this.buildState.name ?? '';
      this.finishRename();
      return;
    }

    const savedBuildId = this.buildState.savedBuildId;
    if (!savedBuildId) {
      // Nothing saved yet (or this build isn't ours) - nothing to persist
      // or duplicate-check against, just update the local name. See
      // CurrentBuildService.setName().
      this.currentBuild.setName(validated);
      this.finishRename();
      return;
    }

    this.buildSave.rename(savedBuildId, validated).subscribe({
      next: () => this.finishRename(),
      error: (err: unknown) => {
        this.closeAfterRename = false;
        this.renameError = saveErrorMessage(err);
        this.cdr.markForCheck();
      }
    });
  }

  private finishRename(): void {
    this.editingName = false;
    this.renameError = null;
    if (this.closeAfterRename) {
      this.closeAfterRename = false;
      this.closeMenu();
      this.nameTriggerRef?.nativeElement.focus();
    }
    this.cdr.markForCheck();
  }

  // Save control state matrix (see the plan's "Save controls: one split
  // button"). Requiring sign-in is handled entirely by the template (the
  // whole control only renders `@if (isAuthenticated)`, with a single "Sign
  // in to save builds" button otherwise) - there's nothing to click through
  // to here but a redirect anyway, and gating the getter itself would just
  // let a caller invoke it against a meaningless anonymous state.
  //
  // Unlike the two-button version this replaced, the primary action is
  // ALWAYS present in every signed-in state, never conditionally hidden:
  // "Save a copy" (ownership 'other') and the disabled placeholder
  // (ownership 'unknown', still waiting on confirmOwnership()) are each the
  // ONLY save affordance available in their state - hiding the control
  // behind a "does it apply" check would leave the viewer with no way to
  // save at all. The caret (hasMenu), not the whole control, is what's
  // conditional: it only appears when there's a genuinely distinct second
  // action (an owned build, where Save As… is meaningfully different from
  // the primary "save in place").
  get saveControl(): SaveControlViewModel {
    if (this.savingInPlace) {
      return { label: 'Saving…', shortLabel: 'Saving', disabled: true, hasMenu: false };
    }
    if (!this.buildState.shortId) {
      return { label: 'Save…', shortLabel: 'Save', disabled: false, hasMenu: false };
    }
    switch (this.buildState.ownership) {
      case 'owned':
        return { label: 'Save', shortLabel: 'Save', disabled: !this.buildState.isDirty, hasMenu: true };
      case 'other':
        return { label: 'Save a copy', shortLabel: 'Copy', disabled: false, hasMenu: false };
      default:
        // 'unknown' - confirmOwnership() hasn't resolved yet (see
        // CurrentBuildService). Never assume either way; disabled rather
        // than silently offering the wrong action for however long that
        // check takes.
        return { label: 'Save', shortLabel: 'Save', disabled: true, hasMenu: false };
    }
  }

  onSaveControlPrimaryClick(): void {
    if (!this.buildState.shortId) {
      this.openDialog('create', this.buildState.name ?? '');
      return;
    }
    if (this.buildState.ownership === 'owned') {
      if (this.buildState.savedBuildId && !this.savingInPlace) {
        this.saveInPlace(this.buildState.savedBuildId);
      }
      return;
    }
    if (this.buildState.ownership === 'other') {
      this.openDialog('save-as', this.buildState.name ?? '');
    }
    // 'unknown' falls through to nothing - the button is disabled in this
    // state (see saveControl), so a click shouldn't reach here at all; this
    // is just not assuming that stays true forever.
  }

  onSaveAsMenuItemClick(): void {
    this.cancelRename();
    this.closeMenu();
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
    // 'create' and 'save-as' both create a brand new build row.
    this.buildSave.create(name).subscribe({
      next: () => {
        this.dialogSaving = false;
        this.dialogOpen = false;
        this.flashSaved();
        this.cdr.markForCheck();
      },
      error: (err: unknown) => {
        this.dialogSaving = false;
        this.dialogError = saveErrorMessage(err);
        this.cdr.markForCheck();
      }
    });
  }

  private saveInPlace(savedBuildId: string): void {
    this.savingInPlaceError = null;
    this.savingInPlace = true;
    this.buildSave.saveInPlace(savedBuildId).subscribe({
      next: () => {
        this.savingInPlace = false;
        this.flashSaved();
        this.cdr.markForCheck();
      },
      // A failed in-place save leaves isDirty as-is - clear the saving
      // indicator so the button re-enables, and say why (there's no dialog
      // on this path to show it in).
      error: (err: unknown) => {
        this.savingInPlace = false;
        this.savingInPlaceError = saveErrorMessage(err);
        this.cdr.markForCheck();
      }
    });
  }
}

function prefersFinePointer(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)')?.matches;
}

function saveErrorMessage(err: unknown): string {
  return err instanceof BuildSaveError ? err.message : 'Could not save that build. Please try again.';
}
