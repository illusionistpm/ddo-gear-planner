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
      navigateByUrl: vi.fn().mockName('Router.navigateByUrl')
    } as unknown as MockedObject<Router>;
    const cdr = {
      markForCheck: vi.fn().mockName('ChangeDetectorRef.markForCheck')
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: CurrentBuildService, useValue: currentBuild },
        { provide: BuildsService, useValue: buildsService },
        { provide: QueryParamsService, useValue: queryParams },
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
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

  it('opens the save-as dialog from the caret menu for an owned build', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', isDirty: true, ownership: 'owned' });

    component.toggleSaveMenu();
    expect(component.isMenuOpen('save')).toBe(true);
    component.onSaveAsMenuItemClick();

    expect(component.isMenuOpen('save')).toBe(false);
    expect(component.dialogOpen).toBe(true);
    expect(component.dialogMode).toBe('save-as');
  });

  it('closes the save menu on Escape and returns focus to the caret', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', isDirty: true, ownership: 'owned' });
    component.toggleSaveMenu();
    const caret = {
      focus: vi.fn().mockName('caret.focus')
    };
    (component as any).saveCaretRef = { nativeElement: caret };

    component.onSaveMenuKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(component.isMenuOpen('save')).toBe(false);
    expect(caret.focus).toHaveBeenCalled();
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

  it('toggles the avatar menu open and closed, and closing My Builds if it was open', () => {
    component.openMenu = 'myBuilds';

    component.toggleMenu('avatar');
    expect(component.isMenuOpen('avatar')).toBe(true);
    expect(component.isMenuOpen('myBuilds')).toBe(false);

    component.toggleMenu('avatar');
    expect(component.isMenuOpen('avatar')).toBe(false);
  });

  it('closes the avatar menu on sign out', () => {
    component.openMenu = 'avatar';

    component.signOut();

    expect(auth.signOut).toHaveBeenCalled();
    expect(component.isMenuOpen('avatar')).toBe(false);
  });

  it('opens My Builds and closes the avatar menu', () => {
    component.openMenu = 'avatar';

    component.onMyBuildsClick();

    expect(component.isMenuOpen('myBuilds')).toBe(true);
    expect(component.isMenuOpen('avatar')).toBe(false);
  });

  it('keeps at most one menu open: opening any menu closes the others', () => {
    for (const menu of ['myBuilds', 'avatar', 'share', 'save'] as const) {
      component.openMenu = 'avatar';
      component.toggleMenu(menu);
      expect<BuildActionsMenu | null>(component.openMenu).toBe(menu === 'avatar' ? null : menu);
    }
  });

  it('starts renaming with the current name pre-filled, regardless of auth/save state', () => {
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', ownership: 'owned' });

    component.startRename();

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

  it('the explicit cancel button prevents the input\'s own blur, so clicking it discards rather than committing', () => {
    // Regression guard for the swallowed-click bug (see the plan): mousedown
    // fires before blur, so preventDefault() there is what stops
    // commitRename() from firing first. Without it, "cancel" would silently
    // save the in-progress edit instead of discarding it.
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', ownership: 'owned' });
    component.startRename();
    component.nameDraft = 'Something else';
    const event = {
      preventDefault: vi.fn().mockName('MouseEvent.preventDefault')
    };

    component.onCancelRenameMouseDown(event as unknown as MouseEvent);

    expect(event.preventDefault).toHaveBeenCalled();
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
    component.openMenu = 'save';

    component.toggleMenu('share');
    expect(component.isMenuOpen('share')).toBe(true);
    expect(component.isMenuOpen('save')).toBe(false);

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

  function openOverflowMenu() {
    (fixture.nativeElement.querySelector('.build-overflow-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  function overflowItems(): (string | undefined)[] {
    return [...fixture.nativeElement.querySelectorAll('.build-overflow-item')]
      .map((e: Element) => e.textContent?.trim());
  }

  it('offers My Builds and Sign out from the one overflow menu', () => {
    openOverflowMenu();

    expect(overflowItems()).toContain('My builds');
    expect(overflowItems()).toContain('Sign out');
  });

  it('opens the My Builds panel from it, with the panel still rendered', () => {
    openOverflowMenu();
    const myBuilds = [...fixture.nativeElement.querySelectorAll('.build-overflow-item')]
      .find((e: Element) => e.textContent?.trim() === 'My builds') as HTMLButtonElement;

    myBuilds.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-my-builds')).not.toBeNull();
  });

  it('keeps the build name group in the DOM, since the panel lives inside it', () => {
    expect(fixture.nativeElement.querySelector('.build-name-group')).not.toBeNull();
  });

  it('projects whatever the page passes in into that same menu', () => {
    // MainComponent hands it Ko-fi, the theme toggle and Admin, so there is
    // one overflow menu rather than two sitting next to each other.
    expect(fixture.nativeElement.querySelector('.build-overflow-utilities')).not.toBeNull();
  });

  it('gives Share a label and an icon, so either can carry it', () => {
    const share = fixture.nativeElement.querySelector('.build-share');

    expect(share.querySelector('.build-share-label')?.textContent?.trim()).toBe('Share');
    expect(share.querySelector('.build-share-icon')).not.toBeNull();
    expect(share.getAttribute('aria-label')).toBe('Share');
  });
});
