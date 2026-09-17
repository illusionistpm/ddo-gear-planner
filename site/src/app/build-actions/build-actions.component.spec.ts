import { ChangeDetectorRef } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';

import { AnalyticsService } from '../analytics.service';
import { AuthService } from '../auth.service';
import { BuildUrlCodecService } from '../build-url-codec.service';
import { BuildsService } from '../builds.service';
import { Clipboard } from '../clipboard';
import { CurrentBuildService, CurrentBuildState } from '../current-build.service';
import { EquippedService } from '../equipped.service';
import { QueryParamsService } from '../query-params.service';
import { ShortLinksService } from '../short-links.service';
import { BuildActionsComponent } from './build-actions.component';

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
  let currentBuild: jasmine.SpyObj<CurrentBuildService> & { state$: BehaviorSubject<CurrentBuildState> };
  let buildsService: jasmine.SpyObj<BuildsService>;
  let shortLinks: jasmine.SpyObj<ShortLinksService>;
  let queryParams: jasmine.SpyObj<QueryParamsService>;
  let codec: jasmine.SpyObj<BuildUrlCodecService>;
  let equipped: jasmine.SpyObj<EquippedService>;
  let analytics: jasmine.SpyObj<AnalyticsService>;
  let auth: jasmine.SpyObj<AuthService> & { isAuthenticated$: BehaviorSubject<boolean>; user$: BehaviorSubject<unknown> };
  let router: jasmine.SpyObj<Router>;
  let component: BuildActionsComponent;

  function create(): BuildActionsComponent {
    const state$ = new BehaviorSubject<CurrentBuildState>(makeState());
    currentBuild = Object.assign(
      jasmine.createSpyObj<CurrentBuildService>(
        'CurrentBuildService',
        ['markLoaded', 'markSaved', 'confirmOwnership', 'reset', 'restoreIdentity', 'getCanonicalParamsCache', 'setName'],
        { value: makeState() }
      ),
      { state$ }
    ) as any;
    Object.defineProperty(currentBuild, 'state$', { value: state$ });

    buildsService = jasmine.createSpyObj('BuildsService', ['create', 'update', 'listMine']);
    buildsService.listMine.and.returnValue(of([]));
    shortLinks = jasmine.createSpyObj('ShortLinksService', ['create']);
    shortLinks.create.and.returnValue(of({ shortId: 'shrt1234' }));
    queryParams = jasmine.createSpyObj('QueryParamsService', ['getCombinedParams']);
    queryParams.getCombinedParams.and.returnValue({ Weapon: 'Sword' });
    codec = jasmine.createSpyObj('BuildUrlCodecService', ['encode']);
    codec.encode.and.returnValue('z1.encoded');
    equipped = jasmine.createSpyObj('EquippedService', ['getGearDescription', 'getSlotsSnapshot']);
    equipped.getGearDescription.and.returnValue('Weapon: Sword');
    equipped.getSlotsSnapshot.and.returnValue(new Map());
    analytics = jasmine.createSpyObj('AnalyticsService', ['track']);

    const isAuthenticated$ = new BehaviorSubject(false);
    const user$ = new BehaviorSubject<unknown>(null);
    auth = Object.assign(
      jasmine.createSpyObj<AuthService>('AuthService', ['signIn', 'signOut']),
      { isAuthenticated$, user$ }
    ) as any;

    router = jasmine.createSpyObj('Router', ['navigateByUrl']);
    const cdr = jasmine.createSpyObj('ChangeDetectorRef', ['markForCheck']);

    TestBed.configureTestingModule({
      providers: [
        { provide: CurrentBuildService, useValue: currentBuild },
        { provide: BuildsService, useValue: buildsService },
        { provide: ShortLinksService, useValue: shortLinks },
        { provide: QueryParamsService, useValue: queryParams },
        { provide: BuildUrlCodecService, useValue: codec },
        { provide: EquippedService, useValue: equipped },
        { provide: AnalyticsService, useValue: analytics },
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
        { provide: ChangeDetectorRef, useValue: cdr }
      ]
    });

    const instance = TestBed.runInInjectionContext(
      () => new BuildActionsComponent(currentBuild, buildsService, shortLinks, queryParams, codec, equipped, analytics, auth, router, cdr)
    );
    instance.ngOnInit();
    return instance;
  }

  function setState(overrides: Partial<CurrentBuildState>) {
    currentBuild.state$.next(makeState(overrides));
  }

  beforeEach(() => {
    component = create();
  });

  it('hides Save and Save As entirely when anonymous, regardless of build state', () => {
    expect(component.showPrimarySave).toBeFalse();
    expect(component.showSaveAs).toBeFalse();

    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', isDirty: true, ownership: 'owned' });

    expect(component.showPrimarySave).toBeFalse();
    expect(component.showSaveAs).toBeFalse();
  });

  it('offers only "Save…" for an unnamed build', () => {
    auth.isAuthenticated$.next(true);

    expect(component.showPrimarySave).toBeTrue();
    expect(component.primarySaveLabel).toBe('Save…');
    expect(component.showSaveAs).toBeFalse();
  });

  it('offers Save (enabled) and Save As for a named, dirty, owned build', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', isDirty: true, ownership: 'owned' });

    expect(component.showPrimarySave).toBeTrue();
    expect(component.primarySaveLabel).toBe('Save');
    expect(component.primarySaveDisabled).toBeFalse();
    expect(component.showSaveAs).toBeTrue();
  });

  it('disables Save (but keeps Save As) for a named, clean, owned build', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', isDirty: false, ownership: 'owned' });

    expect(component.showPrimarySave).toBeFalse();
    expect(component.showSaveAs).toBeTrue();
  });

  it('offers only Save As for a build not owned by the viewer', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', name: 'Someone Else\'s Build', isDirty: false, ownership: 'other' });

    expect(component.showPrimarySave).toBeFalse();
    expect(component.showSaveAs).toBeTrue();
  });

  it('triggers sign-in instead of the dialog when anonymous and clicking primary save', () => {
    component.onPrimarySaveClick();

    expect(auth.signIn).toHaveBeenCalled();
    expect(component.dialogOpen).toBeFalse();
  });

  it('triggers sign-in instead of the dialog when anonymous and clicking Save As', () => {
    component.onSaveAsClick();

    expect(auth.signIn).toHaveBeenCalled();
    expect(component.dialogOpen).toBeFalse();
  });

  it('opens the create dialog when signed in and the build is unnamed', () => {
    auth.isAuthenticated$.next(true);

    component.onPrimarySaveClick();

    expect(component.dialogOpen).toBeTrue();
    expect(component.dialogMode).toBe('create');
  });

  it('saves in place (PUT) without a dialog for a named, dirty, owned build', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', isDirty: true, ownership: 'owned' });
    buildsService.update.and.returnValue(of({ id: 'build-1', shortId: 'abc123', name: 'My Build', blob: 'z1.encoded' }));

    component.onPrimarySaveClick();

    expect(buildsService.update).toHaveBeenCalledWith('build-1', { blob: 'z1.encoded' });
    expect(component.dialogOpen).toBeFalse();
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
    const update$ = new Subject<{ id: string; shortId: string; name: string; blob: string }>();
    buildsService.update.and.returnValue(update$);

    component.onPrimarySaveClick();

    expect(component.primarySaveLabel).toBe('Saving…');
    expect(component.primarySaveDisabled).toBeTrue();
    // A repeat click (e.g. a fast double-click before the button visually
    // disables) must not fire a second PUT.
    component.onPrimarySaveClick();
    expect(buildsService.update).toHaveBeenCalledTimes(1);

    update$.next({ id: 'build-1', shortId: 'abc123', name: 'My Build', blob: 'z1.encoded' });
    update$.complete();

    expect(component.primarySaveLabel).toBe('Save');
    expect(component.savingInPlace).toBeFalse();
  });

  it('clears the "Saving…" indicator and re-enables the button if the in-place save fails', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', isDirty: true, ownership: 'owned' });
    buildsService.update.and.returnValue(throwError(() => new Error('network down')));

    component.onPrimarySaveClick();

    expect(component.primarySaveLabel).toBe('Save');
    expect(component.primarySaveDisabled).toBeFalse();
  });

  it('creates and navigates to the new build on dialog confirm', () => {
    auth.isAuthenticated$.next(true);
    buildsService.create.and.returnValue(of({ id: 'build-1', shortId: 'abc123', name: 'My New Build', blob: 'z1.encoded' }));

    component.openDialog('create', '');
    component.onDialogConfirmed('My New Build');

    expect(buildsService.create).toHaveBeenCalledWith('My New Build', 'z1.encoded');
    expect(currentBuild.markSaved).toHaveBeenCalledWith({
      savedBuildId: 'build-1', shortId: 'abc123', name: 'My New Build', canonicalParams: { Weapon: 'Sword' }
    });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/build/abc123/my-new-build', { replaceUrl: true });
    expect(component.dialogOpen).toBeFalse();
  });

  it('blocks creating a build whose name duplicates an existing one', () => {
    auth.isAuthenticated$.next(true);
    buildsService.listMine.and.returnValue(of([
      { id: 'build-1', shortId: 'abc123', name: 'My Build', blob: 'z1.old' }
    ]));

    component.openDialog('create', '');
    component.onDialogConfirmed('My Build');

    expect(buildsService.create).not.toHaveBeenCalled();
    expect(component.dialogSaving).toBeFalse();
    expect(component.dialogOpen).toBeTrue();
    expect(component.dialogError).toContain('already have a build named "My Build"');
  });

  it('matches duplicate names case-insensitively and ignoring surrounding whitespace', () => {
    auth.isAuthenticated$.next(true);
    buildsService.listMine.and.returnValue(of([
      { id: 'build-1', shortId: 'abc123', name: '  my build  ', blob: 'z1.old' }
    ]));

    component.openDialog('create', '');
    component.onDialogConfirmed('My Build');

    expect(buildsService.create).not.toHaveBeenCalled();
    expect(component.dialogError).toContain('already have a build named');
  });

  it('creates the build when the name has no duplicate', () => {
    auth.isAuthenticated$.next(true);
    buildsService.listMine.and.returnValue(of([
      { id: 'build-1', shortId: 'abc123', name: 'Some Other Build', blob: 'z1.old' }
    ]));
    buildsService.create.and.returnValue(of({ id: 'build-2', shortId: 'def456', name: 'My Build', blob: 'z1.encoded' }));

    component.openDialog('create', '');
    component.onDialogConfirmed('My Build');

    expect(buildsService.create).toHaveBeenCalledWith('My Build', 'z1.encoded');
  });

  it('proceeds with the save if the duplicate-name check itself fails', () => {
    auth.isAuthenticated$.next(true);
    buildsService.listMine.and.returnValue(throwError(() => new Error('network down')));
    buildsService.create.and.returnValue(of({ id: 'build-2', shortId: 'def456', name: 'My Build', blob: 'z1.encoded' }));

    component.openDialog('create', '');
    component.onDialogConfirmed('My Build');

    expect(buildsService.create).toHaveBeenCalledWith('My Build', 'z1.encoded');
  });

  it('shows an error and keeps the dialog open if create fails', () => {
    auth.isAuthenticated$.next(true);
    buildsService.create.and.returnValue(throwError(() => new Error('nope')));

    component.openDialog('create', '');
    component.onDialogConfirmed('My Build');

    expect(component.dialogOpen).toBeTrue();
    expect(component.dialogError).toContain('Could not save');
    expect(component.dialogSaving).toBeFalse();
  });

  it('surfaces the server\'s specific error message (e.g. hitting the build limit) instead of the generic fallback', () => {
    auth.isAuthenticated$.next(true);
    // RxJS 6 (this repo's version) - throwError() takes a plain value, not
    // the RxJS 7+ factory form other tests in this file use; that form
    // silently passes the factory *function itself* through as the error
    // here, which every other test happens not to care about the shape of.
    buildsService.create.and.returnValue(throwError(new HttpErrorResponse({
      status: 403,
      error: { error: 'You\'ve reached the limit of 100 saved builds. Delete an existing build to save a new one.' }
    })));

    component.openDialog('create', '');
    component.onDialogConfirmed('My Build');

    expect(component.dialogError).toBe('You\'ve reached the limit of 100 saved builds. Delete an existing build to save a new one.');
  });

  it('shows sign-in when anonymous and sign-out with a display name when authenticated', () => {
    expect(component.isAuthenticated).toBeFalse();

    auth.isAuthenticated$.next(true);
    auth.user$.next({ name: 'Jane Doe' });

    expect(component.isAuthenticated).toBeTrue();
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
    component.myBuildsOpen = true;

    component.toggleAvatarMenu();
    expect(component.avatarMenuOpen).toBeTrue();
    expect(component.myBuildsOpen).toBeFalse();

    component.toggleAvatarMenu();
    expect(component.avatarMenuOpen).toBeFalse();
  });

  it('closes the avatar menu on sign out', () => {
    component.avatarMenuOpen = true;

    component.signOut();

    expect(auth.signOut).toHaveBeenCalled();
    expect(component.avatarMenuOpen).toBeFalse();
  });

  it('opens My Builds and closes the avatar menu', () => {
    component.avatarMenuOpen = true;

    component.onMyBuildsClick();

    expect(component.myBuildsOpen).toBeTrue();
    expect(component.avatarMenuOpen).toBeFalse();
  });

  it('starts renaming with the current name pre-filled, regardless of auth/save state', () => {
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', ownership: 'owned' });

    component.startRename();

    expect(component.editingName).toBeTrue();
    expect(component.nameDraft).toBe('My Build');
  });

  it('allows starting a rename on a never-saved, anonymous build', () => {
    component.startRename();

    expect(component.editingName).toBeTrue();
    expect(component.nameDraft).toBe('');
  });

  it('commits a name locally (no network call) for a never-saved build', () => {
    component.startRename();
    component.nameDraft = 'My New Build';

    component.commitRename();

    expect(component.editingName).toBeFalse();
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

    expect(component.editingName).toBeFalse();
    expect(buildsService.update).not.toHaveBeenCalled();
  });

  it('commits a rename, updating state and navigating to the (possibly re-slugified) URL', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', ownership: 'owned' });
    buildsService.update.and.returnValue(of({ id: 'build-1', shortId: 'abc123', name: 'Renamed Build', blob: 'z1.old' }));
    component.startRename();
    component.nameDraft = 'Renamed Build';

    component.commitRename();

    expect(buildsService.update).toHaveBeenCalledWith('build-1', { name: 'Renamed Build' });
    expect(component.editingName).toBeFalse();
    expect(currentBuild.markSaved).toHaveBeenCalledWith({ savedBuildId: 'build-1', shortId: 'abc123', name: 'Renamed Build' });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/build/abc123/renamed-build', { replaceUrl: true });
  });

  it('does nothing on commit when the name is unchanged', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', ownership: 'owned' });
    component.startRename();

    component.commitRename();

    expect(buildsService.update).not.toHaveBeenCalled();
    expect(component.editingName).toBeFalse();
  });

  it('cancels the edit on commit when the draft is empty', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', ownership: 'owned' });
    component.startRename();
    component.nameDraft = '   ';

    component.commitRename();

    expect(buildsService.update).not.toHaveBeenCalled();
    expect(component.editingName).toBeFalse();
  });

  it('blocks a rename that duplicates another of the user\'s builds', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', ownership: 'owned' });
    buildsService.listMine.and.returnValue(of([
      { id: 'build-1', shortId: 'abc123', name: 'My Build', blob: 'z1.old' },
      { id: 'build-2', shortId: 'def456', name: 'Other Build', blob: 'z1.old' }
    ]));
    component.startRename();
    component.nameDraft = 'Other Build';

    component.commitRename();

    expect(buildsService.update).not.toHaveBeenCalled();
    expect(component.editingName).toBeTrue();
    expect(component.renameError).toContain('already have a build named "Other Build"');
  });

  it('does not treat the build\'s own current name as a rename duplicate', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', ownership: 'owned' });
    buildsService.listMine.and.returnValue(of([
      { id: 'build-1', shortId: 'abc123', name: 'My Build', blob: 'z1.old' }
    ]));
    buildsService.update.and.returnValue(of({ id: 'build-1', shortId: 'abc123', name: 'Renamed Build', blob: 'z1.old' }));
    component.startRename();
    component.nameDraft = 'Renamed Build';

    component.commitRename();

    expect(buildsService.update).toHaveBeenCalledWith('build-1', { name: 'Renamed Build' });
  });

  it('proceeds with the rename if the duplicate-name check itself fails', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', ownership: 'owned' });
    buildsService.listMine.and.returnValue(throwError(() => new Error('network down')));
    buildsService.update.and.returnValue(of({ id: 'build-1', shortId: 'abc123', name: 'Renamed Build', blob: 'z1.old' }));
    component.startRename();
    component.nameDraft = 'Renamed Build';

    component.commitRename();

    expect(buildsService.update).toHaveBeenCalledWith('build-1', { name: 'Renamed Build' });
  });

  it('shows an error and keeps editing if the rename request fails', () => {
    auth.isAuthenticated$.next(true);
    setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', ownership: 'owned' });
    buildsService.update.and.returnValue(throwError(() => new Error('nope')));
    component.startRename();
    component.nameDraft = 'Renamed Build';

    component.commitRename();

    expect(component.editingName).toBeTrue();
    expect(component.renameError).toContain('Could not rename');
  });

  describe('share menu', () => {
    beforeEach(() => {
      spyOn(Clipboard, 'copy');
    });

    it('toggles open and closed, closing the other menus', () => {
      component.avatarMenuOpen = true;
      component.myBuildsOpen = true;

      component.toggleShareMenu();
      expect(component.shareMenuOpen).toBeTrue();
      expect(component.avatarMenuOpen).toBeFalse();
      expect(component.myBuildsOpen).toBeFalse();

      component.toggleShareMenu();
      expect(component.shareMenuOpen).toBeFalse();
    });

    it('copies the current long URL with no network call when signed out', () => {
      component.copyLink();

      expect(shortLinks.create).not.toHaveBeenCalled();
      expect(Clipboard.copy).toHaveBeenCalledWith(window.location.href);
    });

    it('mints a short link and copies it when signed in', () => {
      auth.isAuthenticated$.next(true);
      setState({ shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', ownership: 'owned' });

      component.copyLink();

      expect(shortLinks.create).toHaveBeenCalledWith('z1.encoded', 'My Build');
      expect(Clipboard.copy).toHaveBeenCalledWith(`${window.location.origin}/build/shrt1234/my-build`);
    });

    it('copies gear text plus the link for copyTextAndLink', () => {
      auth.isAuthenticated$.next(true);

      component.copyTextAndLink();

      expect(Clipboard.copy).toHaveBeenCalledWith(`Weapon: Sword\n${window.location.origin}/build/shrt1234`);
    });

    it('copies just the gear text for copyTextOnly, with no network call', () => {
      component.copyTextOnly();

      expect(shortLinks.create).not.toHaveBeenCalled();
      expect(Clipboard.copy).toHaveBeenCalledWith('Weapon: Sword');
    });

    it('shows a transient "Copied!" confirmation that clears itself', (done) => {
      component.copyTextOnly();

      expect(component.justCopied).toBe('text');
      setTimeout(() => {
        expect(component.justCopied).toBeNull();
        done();
      }, 1600);
    });

    it('tracks which copy action was used', () => {
      component.copyTextOnly();

      expect(analytics.track).toHaveBeenCalledWith('copy_build', jasmine.objectContaining({ copy_kind: 'text', link_kind: 'none' }));
    });
  });
});
