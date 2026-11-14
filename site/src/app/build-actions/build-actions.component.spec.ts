import type { MockedObject } from 'vitest';
import { ChangeDetectorRef } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';

import { AppModule } from '../app.module';
import { AuthService } from '../shared/auth.service';
import { BuildsService } from '../build/builds.service';
import { CurrentBuildService, CurrentBuildState } from '../build/current-build.service';
import { QueryParamsService } from '../build/query-params.service';
import { ShoppingListService } from '../planner/shopping-list/shopping-list.service';
import { BuildActionsComponent, BuildActionsMenu } from './build-actions.component';
import { BuildSaveService } from './build-save.service';

function makeState(overrides: Partial<CurrentBuildState> = {}): CurrentBuildState {
  return {
    savedBuildId: null,
    shortId: null,
    name: null,
    isDirty: false,
    ownership: 'other',
    ...overrides
  };
}

describe('BuildActionsComponent', () => {
  let currentBuild: MockedObject<CurrentBuildService> & {
    state$: BehaviorSubject<CurrentBuildState>;
  };
  let buildsService: MockedObject<BuildsService>;
  let queryParams: MockedObject<QueryParamsService>;
  let auth: MockedObject<AuthService> & {
    isAuthenticated$: BehaviorSubject<boolean>;
    user$: BehaviorSubject<unknown>;
  };
  let router: MockedObject<Router>;
  let shoppingList: { progressForSave: ReturnType<typeof vi.fn>; savedWithBuild: ReturnType<typeof vi.fn> };
  let component: BuildActionsComponent;

  function create(): BuildActionsComponent {
    const state$ = new BehaviorSubject<CurrentBuildState>(makeState());
    currentBuild = Object.assign({
      markLoaded: vi.fn().mockName('CurrentBuildService.markLoaded'),
      markSaved: vi.fn().mockName('CurrentBuildService.markSaved'),
      confirmOwnership: vi.fn().mockName('CurrentBuildService.confirmOwnership'),
      reset: vi.fn().mockName('CurrentBuildService.reset'),
      restoreIdentity: vi.fn().mockName('CurrentBuildService.restoreIdentity'),
      getCanonicalParamsCache: vi.fn().mockName('CurrentBuildService.getCanonicalParamsCache'),
      setName: vi.fn().mockName('CurrentBuildService.setName'),
      value: makeState()
    }, { state$ }) as any;
    Object.defineProperty(currentBuild, 'state$', { value: state$ });

    buildsService = {
      create: vi.fn().mockName('BuildsService.create'),
      update: vi.fn().mockName('BuildsService.update'),
      listMine: vi.fn().mockName('BuildsService.listMine')
    } as unknown as MockedObject<BuildsService>;
    buildsService.listMine.mockReturnValue(of([]));
    queryParams = {
      getCombinedParams: vi.fn().mockName('QueryParamsService.getCombinedParams'),
      encodeCurrentBuild: vi.fn().mockName('QueryParamsService.encodeCurrentBuild')
    } as unknown as MockedObject<QueryParamsService>;
    queryParams.getCombinedParams.mockReturnValue({ Weapon: 'Sword' });
    queryParams.encodeCurrentBuild.mockReturnValue('z1.encoded');

    const isAuthenticated$ = new BehaviorSubject(false);
    const user$ = new BehaviorSubject<unknown>(null);
    auth = Object.assign({
      signIn: vi.fn().mockName('AuthService.signIn'),
      signOut: vi.fn().mockName('AuthService.signOut')
    }, { isAuthenticated$, user$ }) as any;

    router = {
      url: '/',
      navigateByUrl: vi.fn().mockName('Router.navigateByUrl'),
      // ShoppingListViewService follows the URL's fragment through these.
      events: new Subject()
    } as unknown as MockedObject<Router>;
    const cdr = {
      markForCheck: vi.fn().mockName('ChangeDetectorRef.markForCheck')
    };
    // No friends' link to follow the build, unless a test says so.
    shoppingList = { progressForSave: vi.fn(() => null), savedWithBuild: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: CurrentBuildService, useValue: currentBuild },
        { provide: BuildsService, useValue: buildsService },
        { provide: QueryParamsService, useValue: queryParams },
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
        { provide: ShoppingListService, useValue: shoppingList },
        { provide: ChangeDetectorRef, useValue: cdr }
      ]
    });

    const instance = TestBed.runInInjectionContext(
    // The real BuildSaveService (over the mocked services above), so these
    // tests exercise the actual save/rename logic, not a stub of it.
    () => new BuildActionsComponent(currentBuild, TestBed.inject(BuildSaveService), auth,
      cdr as unknown as ChangeDetectorRef));
    instance.ngOnInit();
    return instance;
  }

  function setState(overrides: Partial<CurrentBuildState>) {
    currentBuild.state$.next(makeState(overrides));
  }

  beforeEach(() => {
    component = create();
  });

  // Note there is no "hides Save entirely when anonymous" test any more -
  // that gating moved into the template (`@if (isAuthenticated)`), so it's
  // covered by the component-level HTML tests further down, not by
  // asserting on a component property the way showPrimarySave/showSaveAs
  // used to. saveControl itself is deliberately auth-agnostic (see its
  // comment) - it has nothing meaningful to say about "signed out".

  it('offers only "Save…", no caret, for an unnamed build', () => {
    auth.isAuthenticated$.next(true);

    expect(component.saveControl).toEqual({ label: 'Save…', shortLabel: 'Save', disabled: false, hasMenu: false });
  });

  it('offers Save (enabled) plus a Save As caret for a named, dirty, owned build', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', isDirty: true, ownership: 'owned' });

    expect(component.saveControl).toEqual({ label: 'Save', shortLabel: 'Save', disabled: false, hasMenu: true });
  });

  it('disables Save but keeps the Save As caret for a named, clean, owned build', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', isDirty: false, ownership: 'owned' });

    expect(component.saveControl).toEqual({ label: 'Save', shortLabel: 'Save', disabled: true, hasMenu: true });
  });

  it('offers "Save a copy", with no caret, for a build not owned by the viewer', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', name: 'Someone Else\'s Build', isDirty: false, ownership: 'other' });

    expect(component.saveControl).toEqual({ label: 'Save a copy', shortLabel: 'Copy', disabled: false, hasMenu: false });
  });

  it('disables Save, with no caret, while ownership is still unknown - never assumes either way', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', name: 'My Build', isDirty: true, ownership: 'unknown' });

    expect(component.saveControl).toEqual({ label: 'Save', shortLabel: 'Save', disabled: true, hasMenu: false });
  });

  it('opens the create dialog for an unnamed build', () => {
    auth.isAuthenticated$.next(true);

    component.onSaveControlPrimaryClick();

    expect(component.dialogOpen).toBe(true);
    expect(component.dialogMode).toBe('create');
  });

  it('opens the save-as dialog when the primary action is "Save a copy"', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', name: 'Someone Else\'s Build', isDirty: false, ownership: 'other' });

    component.onSaveControlPrimaryClick();

    expect(component.dialogOpen).toBe(true);
    expect(component.dialogMode).toBe('save-as');
  });

  it('does nothing when clicked while ownership is unknown, matching the disabled state', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', name: 'My Build', isDirty: true, ownership: 'unknown' });

    component.onSaveControlPrimaryClick();

    expect(component.dialogOpen).toBe(false);
    expect(buildsService.update).not.toHaveBeenCalled();
  });

  it('opens the save-as dialog from the build menu for an owned build', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', isDirty: true, ownership: 'owned' });

    component.toggleBuildMenu();
    expect(component.isMenuOpen('build')).toBe(true);
    component.onSaveAsMenuItemClick();

    expect(component.isMenuOpen('build')).toBe(false);
    expect(component.dialogOpen).toBe(true);
    expect(component.dialogMode).toBe('save-as');
  });

  it('closes the build menu without keeping a half-typed name, and returns focus to the name', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', ownership: 'owned' });
    component.toggleBuildMenu();
    component.nameDraft = 'Half typed';
    const trigger = { focus: vi.fn().mockName('trigger.focus') };
    (component as any).nameTriggerRef = { nativeElement: trigger };

    component.closeBuildMenu();
    component.commitRename(); // the field's blur, as it goes

    expect(component.isMenuOpen('build')).toBe(false);
    expect(trigger.focus).toHaveBeenCalled();
    expect(buildsService.update).not.toHaveBeenCalled();
    expect(component.nameDraft).toBe('My Build');
  });

  it('commits the name on Enter and closes the build menu', () => {
    component.toggleBuildMenu();
    component.nameDraft = 'Fresh Name';

    component.onNameEnter();

    expect(currentBuild.setName).toHaveBeenCalledWith('Fresh Name');
    expect(component.isMenuOpen('build')).toBe(false);
  });

  it('commits the name on blur but leaves the build menu open', () => {
    component.toggleBuildMenu();
    component.nameDraft = 'Fresh Name';

    component.commitRename();

    expect(currentBuild.setName).toHaveBeenCalledWith('Fresh Name');
    expect(component.isMenuOpen('build')).toBe(true);
  });

  it('keeps the build menu open, with the error, when a rename on Enter fails', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', ownership: 'owned' });
    buildsService.update.mockReturnValue(throwError(() => new Error('nope')));
    component.toggleBuildMenu();
    component.nameDraft = 'Renamed Build';

    component.onNameEnter();

    expect(component.isMenuOpen('build')).toBe(true);
    expect(component.renameError).toContain('Could not rename');
  });

  it('marks unsaved edits to an owned build, and only those', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', isDirty: true, ownership: 'owned' });
    expect(component.showUnsavedDot).toBe(true);

    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', isDirty: false, ownership: 'owned' });
    expect(component.showUnsavedDot).toBe(false);

    setState({ shortId: 'abc123', name: 'Their Build', isDirty: true, ownership: 'other' });
    expect(component.showUnsavedDot).toBe(false);
  });

  describe('Ctrl/Cmd+S', () => {
    function pressSave(init: KeyboardEventInit = { ctrlKey: true }) {
      const event = new KeyboardEvent('keydown', { key: 's', cancelable: true, ...init });
      component.onDocumentKeydown(event);
      return event;
    }

    beforeEach(() => {
      auth.isAuthenticated$.next(true);
      setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', isDirty: true, ownership: 'owned' });
      buildsService.update.mockReturnValue(of({ id: 'build-1', shortId: 'abc123', name: 'My Build', blob: 'z1.encoded' }));
    });

    it('saves in place, instead of the browser saving the page', () => {
      const event = pressSave({ metaKey: true });

      expect(event.defaultPrevented).toBe(true);
      expect(buildsService.update).toHaveBeenCalled();
    });

    it('does nothing to a clean build, but still keeps the browser\'s dialog away', () => {
      setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', isDirty: false, ownership: 'owned' });

      const event = pressSave();

      expect(event.defaultPrevented).toBe(true);
      expect(buildsService.update).not.toHaveBeenCalled();
    });

    it('leaves the browser\'s own shortcut alone when signed out', () => {
      auth.isAuthenticated$.next(false);

      const event = pressSave();

      expect(event.defaultPrevented).toBe(false);
      expect(buildsService.update).not.toHaveBeenCalled();
    });

    it('waits for a rename in progress rather than racing it', () => {
      component.toggleBuildMenu();

      pressSave();

      expect(buildsService.update).not.toHaveBeenCalled();
    });

    it('ignores plain "s" and other modifiers', () => {
      pressSave({});
      pressSave({ ctrlKey: true, shiftKey: true });

      expect(buildsService.update).not.toHaveBeenCalled();
    });
  });

  it('says "Saved" for a moment after an in-place save lands', () => {
    vi.useFakeTimers();
    try {
      auth.isAuthenticated$.next(true);
      setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', isDirty: true, ownership: 'owned' });
      buildsService.update.mockReturnValue(of({ id: 'build-1', shortId: 'abc123', name: 'My Build', blob: 'z1.encoded' }));

      component.onSaveControlPrimaryClick();
      expect(component.justSaved).toBe(true);

      vi.advanceTimersByTime(2000);
      expect(component.justSaved).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('saves in place (PUT) without a dialog for a named, dirty, owned build', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', isDirty: true, ownership: 'owned' });
    buildsService.update.mockReturnValue(of({ id: 'build-1', shortId: 'abc123', name: 'My Build', blob: 'z1.encoded' }));

    component.onSaveControlPrimaryClick();

    expect(buildsService.update).toHaveBeenCalledWith('build-1', { blob: 'z1.encoded' });
    expect(component.dialogOpen).toBe(false);
    expect(currentBuild.markSaved).toHaveBeenCalledWith({
      savedBuildId: 'build-1', shortId: 'abc123', name: 'My Build', canonicalParams: { Weapon: 'Sword' }
    });
    // Editing accumulates a ?b= param on the /build/:shortId/:slug URL -
    // saving in place must strip it back off, not leave a stale non-clean
    // URL showing for an already-clean, just-saved build.
    expect(router.navigateByUrl).toHaveBeenCalledWith('/build/abc123/my-build', { replaceUrl: true });
  });

  it('sends the shopping list with a save in place, so friends get the new gear and its list together', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', isDirty: true, ownership: 'owned' });
    const progress = { needed: ['k'], route: {}, order: null };
    shoppingList.progressForSave.mockReturnValue(progress);
    buildsService.update.mockReturnValue(of({ id: 'build-1', shortId: 'abc123', name: 'My Build', blob: 'z1.encoded', progressSaved: false }));

    component.onSaveControlPrimaryClick();

    expect(buildsService.update).toHaveBeenCalledWith('build-1', { blob: 'z1.encoded', progress });
    expect(shoppingList.savedWithBuild).toHaveBeenCalledWith(progress, false);
  });

  it('keeps the view open across a save, carrying the URL fragment to the saved build\'s URL', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', isDirty: true, ownership: 'owned' });
    buildsService.update.mockReturnValue(of({ id: 'build-1', shortId: 'abc123', name: 'My Build', blob: 'z1.encoded' }));
    (router as { url: string }).url = '/?b=z1.edited#shopping-list';

    component.onSaveControlPrimaryClick();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/build/abc123/my-build#shopping-list', { replaceUrl: true });
  });

  it('shows a "Saving…" indicator on the primary button while an in-place save is in flight', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', isDirty: true, ownership: 'owned' });
    const update$ = new Subject<{
      id: string;
      shortId: string;
      name: string;
      blob: string;
    }>();
    buildsService.update.mockReturnValue(update$);

    component.onSaveControlPrimaryClick();

    expect(component.saveControl).toEqual({ label: 'Saving…', shortLabel: 'Saving', disabled: true, hasMenu: false });
    // A repeat click (e.g. a fast double-click before the button visually
    // disables) must not fire a second PUT.
    component.onSaveControlPrimaryClick();
    expect(buildsService.update).toHaveBeenCalledTimes(1);

    update$.next({ id: 'build-1', shortId: 'abc123', name: 'My Build', blob: 'z1.encoded' });
    update$.complete();

    expect(component.savingInPlace).toBe(false);
  });

  it('clears the "Saving…" indicator, re-enables the button, and surfaces an error if the in-place save fails', () => {
    // Previously failed completely silently - no dialog exists on this
    // path to show an error in, so it needs its own slot (savingInPlaceError).
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', isDirty: true, ownership: 'owned' });
    buildsService.update.mockReturnValue(throwError(() => new Error('network down')));

    component.onSaveControlPrimaryClick();

    expect(component.saveControl).toEqual({ label: 'Save', shortLabel: 'Save', disabled: false, hasMenu: true });
    expect(component.savingInPlaceError).toContain('Could not save');
  });

  it('rejects an oversized blob client-side on save-in-place, without calling update()', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', isDirty: true, ownership: 'owned' });
    queryParams.encodeCurrentBuild.mockReturnValue('x'.repeat(4097));

    component.onSaveControlPrimaryClick();

    expect(buildsService.update).not.toHaveBeenCalled();
    expect(component.savingInPlaceError).toContain('too large');
    expect(component.savingInPlace).toBe(false);
  });

  it('creates and navigates to the new build on dialog confirm', () => {
    auth.isAuthenticated$.next(true);
    buildsService.create.mockReturnValue(of({ id: 'build-1', shortId: 'abc123', name: 'My New Build', blob: 'z1.encoded' }));

    component.openDialog('create', '');
    component.onDialogConfirmed('My New Build');

    expect(buildsService.create).toHaveBeenCalledWith('My New Build', 'z1.encoded');
    expect(currentBuild.markSaved).toHaveBeenCalledWith({
      savedBuildId: 'build-1', shortId: 'abc123', name: 'My New Build', canonicalParams: { Weapon: 'Sword' }
    });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/build/abc123/my-new-build', { replaceUrl: true });
    expect(component.dialogOpen).toBe(false);
  });

  it('blocks creating a build whose name duplicates an existing one', () => {
    auth.isAuthenticated$.next(true);
    buildsService.listMine.mockReturnValue(of([
      { id: 'build-1', shortId: 'abc123', name: 'My Build', blob: 'z1.old' }
    ]));

    component.openDialog('create', '');
    component.onDialogConfirmed('My Build');

    expect(buildsService.create).not.toHaveBeenCalled();
    expect(component.dialogSaving).toBe(false);
    expect(component.dialogOpen).toBe(true);
    expect(component.dialogError).toContain('already have a build named "My Build"');
  });

  it('matches duplicate names case-insensitively and ignoring surrounding whitespace', () => {
    auth.isAuthenticated$.next(true);
    buildsService.listMine.mockReturnValue(of([
      { id: 'build-1', shortId: 'abc123', name: '  my build  ', blob: 'z1.old' }
    ]));

    component.openDialog('create', '');
    component.onDialogConfirmed('My Build');

    expect(buildsService.create).not.toHaveBeenCalled();
    expect(component.dialogError).toContain('already have a build named');
  });

  it('creates the build when the name has no duplicate', () => {
    auth.isAuthenticated$.next(true);
    buildsService.listMine.mockReturnValue(of([
      { id: 'build-1', shortId: 'abc123', name: 'Some Other Build', blob: 'z1.old' }
    ]));
    buildsService.create.mockReturnValue(of({ id: 'build-2', shortId: 'def456', name: 'My Build', blob: 'z1.encoded' }));

    component.openDialog('create', '');
    component.onDialogConfirmed('My Build');

    expect(buildsService.create).toHaveBeenCalledWith('My Build', 'z1.encoded');
  });

  it('proceeds with the save if the duplicate-name check itself fails', () => {
    auth.isAuthenticated$.next(true);
    buildsService.listMine.mockReturnValue(throwError(() => new Error('network down')));
    buildsService.create.mockReturnValue(of({ id: 'build-2', shortId: 'def456', name: 'My Build', blob: 'z1.encoded' }));

    component.openDialog('create', '');
    component.onDialogConfirmed('My Build');

    expect(buildsService.create).toHaveBeenCalledWith('My Build', 'z1.encoded');
  });

  it('rejects an oversized blob client-side, before ever calling create()', () => {
    auth.isAuthenticated$.next(true);
    queryParams.encodeCurrentBuild.mockReturnValue('x'.repeat(4097));

    component.openDialog('create', '');
    component.onDialogConfirmed('My Build');

    expect(buildsService.create).not.toHaveBeenCalled();
    expect(component.dialogError).toContain('too large');
    expect(component.dialogSaving).toBe(false);
  });

  it('shows an error and keeps the dialog open if create fails', () => {
    auth.isAuthenticated$.next(true);
    buildsService.create.mockReturnValue(throwError(() => new Error('nope')));

    component.openDialog('create', '');
    component.onDialogConfirmed('My Build');

    expect(component.dialogOpen).toBe(true);
    expect(component.dialogError).toContain('Could not save');
    expect(component.dialogSaving).toBe(false);
  });

  it('surfaces the server\'s specific error message (e.g. hitting the build limit) instead of the generic fallback', () => {
    auth.isAuthenticated$.next(true);
    buildsService.create.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 403,
      error: { error: 'You\'ve reached the limit of 100 saved builds. Delete an existing build to save a new one.' }
    })));

    component.openDialog('create', '');
    component.onDialogConfirmed('My Build');

    expect(component.dialogError).toBe('You\'ve reached the limit of 100 saved builds. Delete an existing build to save a new one.');
  });

  it('shows sign-in when anonymous and sign-out with a display name when authenticated', () => {
    expect(component.isAuthenticated).toBe(false);

    auth.isAuthenticated$.next(true);
    auth.user$.next({ name: 'Jane Doe' });

    expect(component.isAuthenticated).toBe(true);
    expect(component.userDisplayName).toBe('Jane Doe');
  });

  it('exposes the Auth0 profile picture when present', () => {
    auth.user$.next({ name: 'Jane Doe', picture: 'https://example.com/jane.png' });

    expect(component.userPicture).toBe('https://example.com/jane.png');
  });

  it('falls back to an initial derived from the display name when there is no picture', () => {
    auth.user$.next({ name: 'Jane Doe' });

    expect(component.userPicture).toBeNull();
    expect(component.userInitial).toBe('J');
  });

  it('toggles the account menu open and closed, closing the build menu if it was open', () => {
    component.openMenu = 'build';

    component.toggleMenu('account');
    expect(component.isMenuOpen('account')).toBe(true);
    expect(component.isMenuOpen('build')).toBe(false);

    component.toggleMenu('account');
    expect(component.isMenuOpen('account')).toBe(false);
  });

  it('closes the account menu on sign out', () => {
    component.openMenu = 'account';

    component.signOut();

    expect(auth.signOut).toHaveBeenCalled();
    expect(component.isMenuOpen('account')).toBe(false);
  });

  it('keeps at most one menu open: opening any menu closes the others', () => {
    for (const menu of ['build', 'account', 'share'] as const) {
      component.openMenu = 'account';
      component.toggleMenu(menu);
      expect<BuildActionsMenu | null>(component.openMenu).toBe(menu === 'account' ? null : menu);
    }
  });

  it('starts renaming with the current name pre-filled, regardless of auth/save state', () => {
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', ownership: 'owned' });

    component.startRename();

    expect(component.isMenuOpen('build')).toBe(true);
    expect(component.editingName).toBe(true);
    expect(component.nameDraft).toBe('My Build');
  });

  it('allows starting a rename on a never-saved, anonymous build', () => {
    component.startRename();

    expect(component.editingName).toBe(true);
    expect(component.nameDraft).toBe('');
  });

  it('commits a name locally (no network call) for a never-saved build', () => {
    component.startRename();
    component.nameDraft = 'My New Build';

    component.commitRename();

    expect(component.editingName).toBe(false);
    expect(buildsService.update).not.toHaveBeenCalled();
    expect(buildsService.listMine).not.toHaveBeenCalled();
    expect(currentBuild.setName).toHaveBeenCalledWith('My New Build');
  });

  it('cancels renaming without saving', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', ownership: 'owned' });
    component.startRename();
    component.nameDraft = 'Something else';

    component.cancelRename();

    expect(component.editingName).toBe(false);
    expect(buildsService.update).not.toHaveBeenCalled();
  });

  it('commits a rename, updating state and navigating to the (possibly re-slugified) URL', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', ownership: 'owned' });
    buildsService.update.mockReturnValue(of({ id: 'build-1', shortId: 'abc123', name: 'Renamed Build', blob: 'z1.old' }));
    component.startRename();
    component.nameDraft = 'Renamed Build';

    component.commitRename();

    expect(buildsService.update).toHaveBeenCalledWith('build-1', { name: 'Renamed Build' });
    expect(component.editingName).toBe(false);
    expect(currentBuild.markSaved).toHaveBeenCalledWith({ savedBuildId: 'build-1', shortId: 'abc123', name: 'Renamed Build' });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/build/abc123/renamed-build', { replaceUrl: true });
  });

  it('does nothing on commit when the name is unchanged', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', ownership: 'owned' });
    component.startRename();

    component.commitRename();

    expect(buildsService.update).not.toHaveBeenCalled();
    expect(component.editingName).toBe(false);
  });

  it('cancels the edit on commit when the draft is empty', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', ownership: 'owned' });
    component.startRename();
    component.nameDraft = '   ';

    component.commitRename();

    expect(buildsService.update).not.toHaveBeenCalled();
    expect(component.editingName).toBe(false);
  });

  it('blocks a rename that duplicates another of the user\'s builds', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', ownership: 'owned' });
    buildsService.listMine.mockReturnValue(of([
      { id: 'build-1', shortId: 'abc123', name: 'My Build', blob: 'z1.old' },
      { id: 'build-2', shortId: 'def456', name: 'Other Build', blob: 'z1.old' }
    ]));
    component.startRename();
    component.nameDraft = 'Other Build';

    component.commitRename();

    expect(buildsService.update).not.toHaveBeenCalled();
    expect(component.editingName).toBe(true);
    expect(component.renameError).toContain('already have a build named "Other Build"');
  });

  it('does not treat the build\'s own current name as a rename duplicate', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', ownership: 'owned' });
    buildsService.listMine.mockReturnValue(of([
      { id: 'build-1', shortId: 'abc123', name: 'My Build', blob: 'z1.old' }
    ]));
    buildsService.update.mockReturnValue(of({ id: 'build-1', shortId: 'abc123', name: 'Renamed Build', blob: 'z1.old' }));
    component.startRename();
    component.nameDraft = 'Renamed Build';

    component.commitRename();

    expect(buildsService.update).toHaveBeenCalledWith('build-1', { name: 'Renamed Build' });
  });

  it('proceeds with the rename if the duplicate-name check itself fails', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', ownership: 'owned' });
    buildsService.listMine.mockReturnValue(throwError(() => new Error('network down')));
    buildsService.update.mockReturnValue(of({ id: 'build-1', shortId: 'abc123', name: 'Renamed Build', blob: 'z1.old' }));
    component.startRename();
    component.nameDraft = 'Renamed Build';

    component.commitRename();

    expect(buildsService.update).toHaveBeenCalledWith('build-1', { name: 'Renamed Build' });
  });

  it('shows an error and keeps editing if the rename request fails', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', ownership: 'owned' });
    buildsService.update.mockReturnValue(throwError(() => new Error('nope')));
    component.startRename();
    component.nameDraft = 'Renamed Build';

    component.commitRename();

    expect(component.editingName).toBe(true);
    expect(component.renameError).toContain('Could not rename');
  });

  it('toggles the share menu open and closed, closing the other menus', () => {
    component.openMenu = 'build';

    component.toggleMenu('share');
    expect(component.isMenuOpen('share')).toBe(true);
    expect(component.isMenuOpen('build')).toBe(false);

    component.toggleMenu('share');
    expect(component.isMenuOpen('share')).toBe(false);
  });
});

/*
 * Rendered-markup checks, which the block above cannot do - it builds the
 * component directly, with no fixture. These exist because hiding the build
 * name group on narrow screens once took My Builds and Save As with it: both
 * the caret that opened them and, for My Builds, the panel itself live inside
 * that group.
 */
describe('BuildActionsComponent markup', () => {
  let fixture: ComponentFixture<BuildActionsComponent>;
  const isAuthenticated$ = new BehaviorSubject(true);

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AppModule] }).compileComponents();
    TestBed.overrideProvider(AuthService, {
      useValue: {
        isAuthenticated$, user$: of({ name: 'Tester', picture: null }),
        isLoading$: of(false), signIn: () => { }, signOut: () => { }
      }
    });
    fixture = TestBed.createComponent(BuildActionsComponent);
    fixture.detectChanges();
  });

  const el = () => fixture.nativeElement as HTMLElement;

  function click(selector: string) {
    el().querySelector<HTMLButtonElement>(selector)!.click();
    fixture.detectChanges();
  }

  it('offers Sign out from the account menu, which the avatar opens', () => {
    click('.account-toggle.avatar-button');

    const items = [...el().querySelectorAll('.account-menu.open .account-menu-item')].map(e => e.textContent?.trim());
    expect(items).toContain('Sign out');
  });

  it('opens the build menu from the name, with the name to edit and My builds below it', () => {
    click('.build-name-trigger');

    const menu = el().querySelector('.build-menu');
    expect(menu?.querySelector('input[aria-label="Build name"]')).not.toBeNull();
    expect(menu?.querySelector('app-my-builds')).not.toBeNull();
  });

  it('offers sign-in, not My builds, in the build menu when signed out', () => {
    isAuthenticated$.next(false);
    fixture.detectChanges();

    click('.build-name-trigger');

    expect(el().querySelector('.build-menu app-my-builds')).toBeNull();
    expect(el().querySelector('.build-menu-sign-in')).not.toBeNull();
    isAuthenticated$.next(true);
  });

  it('closes each of its menus on a click anywhere else', () => {
    const open = (toggle: string, menu: string) => {
      click(toggle);
      expect(el().querySelector(menu)).not.toBeNull();
    };
    const clickAway = (label: string) => click(`button[aria-label="${label}"]`);

    open('.account-toggle', '.account-menu.open');
    clickAway('Close account menu');
    expect(el().querySelector('.account-menu.open')).toBeNull();

    open('.build-name-trigger', '.build-menu');
    clickAway('Close build menu');
    expect(el().querySelector('.build-menu')).toBeNull();

    open('.build-share', 'app-build-share-menu');
    clickAway('Close share menu');
    expect(el().querySelector('app-build-share-menu')).toBeNull();
  });

  it('closes each of its menus on Escape', () => {
    const escapeCloses = (toggle: string, menu: string) => {
      click(toggle);
      expect(el().querySelector(menu)).not.toBeNull();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();
      expect(el().querySelector(menu)).toBeNull();
    };

    escapeCloses('.account-toggle', '.account-menu.open');
    escapeCloses('.build-name-trigger', '.build-menu');
    escapeCloses('.build-share', 'app-build-share-menu');
  });

  it('projects the page\'s settings into the account menu, and its bar items beside Share', () => {
    expect(el().querySelector('.account-menu-utilities')).not.toBeNull();
  });

  it('gives Share a label and an icon, so either can carry it', () => {
    const share = fixture.nativeElement.querySelector('.build-share');

    expect(share.querySelector('.build-share-label')?.textContent?.trim()).toBe('Share');
    expect(share.querySelector('.build-share-icon')).not.toBeNull();
    expect(share.getAttribute('aria-label')).toBe('Share');
  });
});
