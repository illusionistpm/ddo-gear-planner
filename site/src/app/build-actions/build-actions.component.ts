import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren
} from '@angular/core';
import { Subscription } from 'rxjs';

import { AuthService } from '../auth.service';
import { CurrentBuildService, CurrentBuildState } from '../current-build.service';
import { MAX_BUILD_NAME_LENGTH, validateBuildName } from '../save-build-dialog/save-build-dialog.component';
import { BuildSaveError, BuildSaveService } from './build-save.service';

type DialogMode = 'create' | 'save-as';

// The four popovers hanging off the build bar. At most one is open at a time.
export type BuildActionsMenu = 'myBuilds' | 'avatar' | 'share' | 'save';

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
  disabled: boolean;
  // Whether the caret (revealing "Save As…") should render at all - only
  // when there's a genuinely distinct secondary action, i.e. an owned build
  // where the primary action is already "save in place".
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

  @ViewChild('nameInput') private readonly nameInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('saveCaret') private readonly saveCaretRef?: ElementRef<HTMLButtonElement>;
  @ViewChildren('saveMenuItem') private readonly saveMenuItemRefs?: QueryList<ElementRef<HTMLButtonElement>>;

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
    this.openMenu = this.openMenu === menu ? null : menu;
  }

  closeMenu(): void {
    this.openMenu = null;
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

  // Explicit cancel affordance alongside Escape (which isn't discoverable
  // on its own) - bound to mousedown, not click, specifically so it can
  // preventDefault() there: mousedown fires before the input's blur, and
  // blur is what commits (see the input's own (blur)="commitRename()").
  // Without the preventDefault, clicking this button would blur-and-commit
  // the in-progress edit a moment before the click handler ran, making
  // "cancel" silently save instead.
  onCancelRenameMouseDown(event: MouseEvent): void {
    event.preventDefault();
    this.cancelRename();
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

    this.buildSave.rename(savedBuildId, validated).subscribe({
      next: () => {
        this.editingName = false;
        this.renameError = null;
        this.cdr.markForCheck();
      },
      error: (err: unknown) => {
        this.renameError = saveErrorMessage(err);
        this.cdr.markForCheck();
      }
    });
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
      return { label: 'Saving…', disabled: true, hasMenu: false };
    }
    if (!this.buildState.shortId) {
      return { label: 'Save…', disabled: false, hasMenu: false };
    }
    switch (this.buildState.ownership) {
      case 'owned':
        return { label: 'Save', disabled: !this.buildState.isDirty, hasMenu: true };
      case 'other':
        return { label: 'Save a copy', disabled: false, hasMenu: false };
      default:
        // 'unknown' - confirmOwnership() hasn't resolved yet (see
        // CurrentBuildService). Never assume either way; disabled rather
        // than silently offering the wrong action for however long that
        // check takes.
        return { label: 'Save', disabled: true, hasMenu: false };
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

  toggleSaveMenu(): void {
    this.toggleMenu('save');
    if (this.isMenuOpen('save')) {
      // The menu item doesn't exist in the DOM until the @if switches over
      // on the next change-detection pass - defer the focus move until then
      // instead of racing it (same pattern as startRename's nameInputRef).
      setTimeout(() => this.focusFirstSaveMenuItem());
    }
  }

  // `returnFocusToCaret`: true for every close that isn't itself already
  // moving focus somewhere else (Escape, a menu item's own action) - a
  // backdrop click already moved focus onto the backdrop's own click
  // target, so forcing it back onto the caret there would fight the user.
  closeSaveMenu(returnFocusToCaret = false): void {
    this.closeMenu();
    if (returnFocusToCaret) {
      this.saveCaretRef?.nativeElement.focus();
    }
  }

  onSaveAsMenuItemClick(): void {
    this.closeSaveMenu();
    this.openDialog('save-as', this.buildState.name ?? '');
  }

  // ArrowDown/Enter/Space open the menu and move focus in - Enter/Space
  // already trigger (click) on a <button> on their own, so this only needs
  // to additionally handle ArrowDown (which wouldn't otherwise do anything)
  // and Escape (closing a menu that's already open from here would be a
  // mis-click; nothing to do if it's already closed).
  onSaveCaretKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!this.isMenuOpen('save')) {
        this.toggleSaveMenu();
      } else {
        this.focusFirstSaveMenuItem();
      }
    } else if (event.key === 'Escape' && this.isMenuOpen('save')) {
      this.closeSaveMenu();
    }
  }

  // Roving focus within the open menu (today just one item, but this
  // doesn't assume that stays true) plus Escape-to-close-and-return-focus -
  // neither of the two older menus this pattern is modeled on (Share,
  // account) have this; see the plan for why they aren't retrofitted here.
  onSaveMenuKeydown(event: KeyboardEvent): void {
    // Escape/Tab close the menu regardless of whether there are any items to
    // roam between - only the arrow-key roving-focus branches below actually
    // need a non-empty item list.
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeSaveMenu(true);
      return;
    }
    if (event.key === 'Tab') {
      // Don't fight the browser's own focus move - just stop showing a menu
      // that focus is about to leave.
      this.closeSaveMenu();
      return;
    }

    const items = this.saveMenuItemRefs?.toArray() ?? [];
    if (items.length === 0) {
      return;
    }
    const activeIndex = items.findIndex(item => item.nativeElement === document.activeElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(activeIndex + 1) % items.length]?.nativeElement.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(activeIndex - 1 + items.length) % items.length]?.nativeElement.focus();
    }
  }

  private focusFirstSaveMenuItem(): void {
    this.saveMenuItemRefs?.first?.nativeElement.focus();
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
        this.cdr.markForCheck();
      },
      error: (err: unknown) => {
        this.dialogSaving = false;
        this.dialogError = saveErrorMessage(err);
        this.cdr.markForCheck();
      }
    });
  }

  onMyBuildsClick(): void {
    this.openMenu = 'myBuilds';
  }

  private saveInPlace(savedBuildId: string): void {
    this.savingInPlaceError = null;
    this.savingInPlace = true;
    this.buildSave.saveInPlace(savedBuildId).subscribe({
      next: () => {
        this.savingInPlace = false;
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

function saveErrorMessage(err: unknown): string {
  return err instanceof BuildSaveError ? err.message : 'Could not save that build. Please try again.';
}
