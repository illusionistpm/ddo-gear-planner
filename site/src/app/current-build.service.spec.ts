import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';

import { CurrentBuildService } from './current-build.service';
import { QueryParamsService } from './query-params.service';

describe('CurrentBuildService', () => {
  let combinedParamsChanges: BehaviorSubject<Record<string, unknown>>;
  let getCombinedParams: jasmine.Spy;
  let setBuildIdentityForUrl: jasmine.Spy;
  let publishBuildIdentity: jasmine.Spy;
  let refreshLiveEditUrl: jasmine.Spy;
  let service: CurrentBuildService;

  beforeEach(() => {
    combinedParamsChanges = new BehaviorSubject<Record<string, unknown>>({ Weapon: 'Sword' });
    getCombinedParams = jasmine.createSpy('getCombinedParams').and.returnValue({ Weapon: 'Sword' });
    setBuildIdentityForUrl = jasmine.createSpy('setBuildIdentityForUrl');
    publishBuildIdentity = jasmine.createSpy('publishBuildIdentity');
    refreshLiveEditUrl = jasmine.createSpy('refreshLiveEditUrl');

    TestBed.configureTestingModule({
      providers: [
        {
          provide: QueryParamsService,
          useValue: { combinedParamsChanges, getCombinedParams, setBuildIdentityForUrl, publishBuildIdentity, refreshLiveEditUrl }
        }
      ]
    });

    service = TestBed.inject(CurrentBuildService);
  });

  // markLoaded's canonicalParams is required (see current-build.service.ts) -
  // most tests below don't care what it is, just that a load happened.
  function loadBuild(params: { shortId: string; name: string; savedBuildId?: string | null }): void {
    service.markLoaded({ ...params, canonicalParams: { Weapon: 'Sword' } });
  }

  it('starts in a clean, unsaved state', () => {
    expect(service.value).toEqual({
      savedBuildId: null,
      shortId: null,
      name: null,
      isDirty: false,
      isOwnedByCurrentUser: false
    });
  });

  it('becomes dirty when combinedParams changes after a load', () => {
    loadBuild({ shortId: 'abc123', name: 'My Build' });
    expect(service.value.isDirty).toBeFalse();

    combinedParamsChanges.next({ Weapon: 'Axe' });

    expect(service.value.isDirty).toBeTrue();
  });

  it('is not marked dirty by a change that round-trips back to the same params', () => {
    loadBuild({ shortId: 'abc123', name: 'My Build' });

    combinedParamsChanges.next({ Weapon: 'Axe' });
    expect(service.value.isDirty).toBeTrue();

    combinedParamsChanges.next({ Weapon: 'Sword' });
    expect(service.value.isDirty).toBeFalse();
  });

  it('ignores key insertion order when comparing params (stable stringify)', () => {
    loadBuild({ shortId: 'abc123', name: 'My Build' });

    // Same logical params, different key order - must not appear dirty.
    combinedParamsChanges.next({ Armor: 'Plate', Weapon: 'Sword' });
    getCombinedParams.and.returnValue({ Weapon: 'Sword', Armor: 'Plate' });

    // markLoaded re-snapshots via getCombinedParams(), which now also has
    // both keys in the opposite order - the dirty check right after should
    // treat this as clean since only key order differs.
    loadBuild({ shortId: 'abc123', name: 'My Build' });
    combinedParamsChanges.next({ Weapon: 'Sword', Armor: 'Plate' });

    expect(service.value.isDirty).toBeFalse();
  });

  it('marks a build not owned by the caller on load unless a savedBuildId is given', () => {
    loadBuild({ shortId: 'abc123', name: 'Someone Else\'s Build' });

    expect(service.value.isOwnedByCurrentUser).toBeFalse();
    expect(service.value.savedBuildId).toBeNull();
  });

  it('marks a build owned on load when a savedBuildId is already known', () => {
    loadBuild({ shortId: 'abc123', name: 'My Build', savedBuildId: 'build-1' });

    expect(service.value.isOwnedByCurrentUser).toBeTrue();
    expect(service.value.savedBuildId).toBe('build-1');
  });

  it('tells QueryParamsService what identity to tag onto future live-edit URLs on load', () => {
    loadBuild({ shortId: 'abc123', name: 'My Build', savedBuildId: 'build-1' });

    expect(setBuildIdentityForUrl).toHaveBeenCalledWith({ shortId: 'abc123', name: 'My Build', savedBuildId: 'build-1' });
    expect(publishBuildIdentity).toHaveBeenCalledWith({ shortId: 'abc123', name: 'My Build', savedBuildId: 'build-1' });
  });

  it('caches the given canonicalParams under the loaded shortId', () => {
    service.markLoaded({ shortId: 'abc123', name: 'My Build', canonicalParams: { Weapon: 'Sword' } });

    expect(service.getCanonicalParamsCache('abc123')).toEqual({ Weapon: 'Sword' });
    expect(service.getCanonicalParamsCache('xyz789')).toBeNull();
  });

  it('upgrades to owned via confirmOwnership if the shortId still matches', () => {
    loadBuild({ shortId: 'abc123', name: 'My Build' });

    service.confirmOwnership('abc123', 'build-1');

    expect(service.value.isOwnedByCurrentUser).toBeTrue();
    expect(service.value.savedBuildId).toBe('build-1');
    expect(setBuildIdentityForUrl).toHaveBeenCalledWith({ shortId: 'abc123', name: 'My Build', savedBuildId: 'build-1' });
    expect(publishBuildIdentity).toHaveBeenCalledWith({ shortId: 'abc123', name: 'My Build', savedBuildId: 'build-1' });
  });

  describe('restoreIdentity', () => {
    it('updates identity fields without resetting the dirty-tracking baseline', () => {
      loadBuild({ shortId: 'abc123', name: 'My Build', savedBuildId: 'build-1' });
      combinedParamsChanges.next({ Weapon: 'Axe' });
      expect(service.value.isDirty).toBeTrue();

      service.restoreIdentity({ shortId: 'abc123', name: 'My Build', savedBuildId: 'build-1' });

      // Still dirty relative to the ORIGINAL baseline - restoreIdentity must
      // not reset it the way markLoaded does, or browser back/forward
      // through an edit session would make every restored point look
      // artificially "clean".
      expect(service.value.isDirty).toBeTrue();
      combinedParamsChanges.next({ Weapon: 'Sword' });
      expect(service.value.isDirty).toBeFalse();
    });

    it('sets ownership from the restored savedBuildId', () => {
      loadBuild({ shortId: 'abc123', name: 'My Build' });
      publishBuildIdentity.calls.reset();

      service.restoreIdentity({ shortId: 'abc123', name: 'My Build', savedBuildId: 'build-1' });

      expect(service.value.isOwnedByCurrentUser).toBeTrue();
      expect(service.value.savedBuildId).toBe('build-1');
      expect(setBuildIdentityForUrl).toHaveBeenCalledWith({ shortId: 'abc123', name: 'My Build', savedBuildId: 'build-1' });
    });

    it('never publishes an identity - it only ever reacts to one already on the stream, and re-publishing would recurse into that same subscriber', () => {
      loadBuild({ shortId: 'abc123', name: 'My Build' });
      publishBuildIdentity.calls.reset();

      service.restoreIdentity({ shortId: 'abc123', name: 'My Build', savedBuildId: 'build-1' });

      expect(publishBuildIdentity).not.toHaveBeenCalled();
    });

    it('does not touch the canonicalParamsCache', () => {
      service.markLoaded({ shortId: 'abc123', name: 'My Build', canonicalParams: { Weapon: 'Sword' } });

      service.restoreIdentity({ shortId: 'abc123', name: 'Renamed Mid-Edit', savedBuildId: 'build-1' });

      expect(service.getCanonicalParamsCache('abc123')).toEqual({ Weapon: 'Sword' });
    });
  });

  describe('setName', () => {
    it('updates the name without requiring a savedBuildId or resetting the dirty baseline', () => {
      combinedParamsChanges.next({ Weapon: 'Axe' });
      expect(service.value.isDirty).toBeTrue();

      service.setName('My New Build');

      expect(service.value.name).toBe('My New Build');
      expect(service.value.savedBuildId).toBeNull();
      expect(service.value.shortId).toBeNull();
      // Still dirty relative to the ORIGINAL baseline - setName must not
      // reset it, or naming would incorrectly clear the dirty indicator.
      expect(service.value.isDirty).toBeTrue();
      combinedParamsChanges.next({ Weapon: 'Sword' });
      expect(service.value.isDirty).toBeFalse();
    });

    it('tells QueryParamsService the new identity and forces an immediate URL refresh', () => {
      service.setName('My New Build');

      expect(setBuildIdentityForUrl).toHaveBeenCalledWith({ shortId: null, name: 'My New Build', savedBuildId: null });
      expect(publishBuildIdentity).toHaveBeenCalledWith({ shortId: null, name: 'My New Build', savedBuildId: null });
      expect(refreshLiveEditUrl).toHaveBeenCalled();
    });

    it('preserves an existing shortId/savedBuildId when renaming', () => {
      loadBuild({ shortId: 'abc123', name: 'My Build', savedBuildId: 'build-1' });

      service.setName('Renamed');

      expect(setBuildIdentityForUrl).toHaveBeenCalledWith({ shortId: 'abc123', name: 'Renamed', savedBuildId: 'build-1' });
    });
  });

  describe('canonicalParamsCache', () => {
    it('returns null when nothing is cached for the given shortId', () => {
      expect(service.getCanonicalParamsCache('abc123')).toBeNull();
    });

    it('is cleared on reset', () => {
      service.markLoaded({ shortId: 'abc123', name: 'My Build', canonicalParams: { Weapon: 'Sword' } });

      service.reset();

      expect(service.getCanonicalParamsCache('abc123')).toBeNull();
    });
  });

  it('ignores confirmOwnership if a different build has since loaded', () => {
    loadBuild({ shortId: 'abc123', name: 'My Build' });
    loadBuild({ shortId: 'xyz789', name: 'A Different Build' });

    service.confirmOwnership('abc123', 'build-1');

    expect(service.value.isOwnedByCurrentUser).toBeFalse();
    expect(service.value.shortId).toBe('xyz789');
  });

  it('resets the dirty baseline on markSaved', () => {
    loadBuild({ shortId: 'abc123', name: 'My Build' });
    combinedParamsChanges.next({ Weapon: 'Axe' });
    expect(service.value.isDirty).toBeTrue();

    getCombinedParams.and.returnValue({ Weapon: 'Axe' });
    service.markSaved({ savedBuildId: 'build-1', shortId: 'abc123', name: 'My Build', canonicalParams: { Weapon: 'Axe' } });

    expect(service.value.isDirty).toBeFalse();
    expect(service.value.isOwnedByCurrentUser).toBeTrue();
    expect(setBuildIdentityForUrl).toHaveBeenCalledWith({ shortId: 'abc123', name: 'My Build', savedBuildId: 'build-1' });
    expect(publishBuildIdentity).toHaveBeenCalledWith({ shortId: 'abc123', name: 'My Build', savedBuildId: 'build-1' });

    combinedParamsChanges.next({ Weapon: 'Axe' });
    expect(service.value.isDirty).toBeFalse();
  });

  describe('markSaved without canonicalParams (a name-only rename)', () => {
    it('leaves an existing cache entry untouched', () => {
      service.markLoaded({ shortId: 'abc123', name: 'My Build', canonicalParams: { Weapon: 'Sword' } });

      service.markSaved({ savedBuildId: 'build-1', shortId: 'abc123', name: 'Renamed Build' });

      expect(service.getCanonicalParamsCache('abc123')).toEqual({ Weapon: 'Sword' });
      expect(service.value.name).toBe('Renamed Build');
    });
  });

  it('returns to a clean unsaved state on reset', () => {
    loadBuild({ shortId: 'abc123', name: 'My Build', savedBuildId: 'build-1' });

    service.reset();

    expect(service.value).toEqual({
      savedBuildId: null,
      shortId: null,
      name: null,
      isDirty: false,
      isOwnedByCurrentUser: false
    });
    expect(setBuildIdentityForUrl).toHaveBeenCalledWith(null);
    expect(publishBuildIdentity).toHaveBeenCalledWith(null);
  });

  it('is a no-op on an already-reset state, rather than re-publishing null every call', () => {
    // Regression test: MainComponent's buildIdentityFromUrl$ subscriber
    // calls reset() precisely when it sees the null identity this method's
    // own publishBuildIdentity(null) call produces - without this guard,
    // every reset() re-triggers that subscriber, which calls reset() again,
    // forever (a real stack overflow this exact scenario hit).
    service.reset();
    setBuildIdentityForUrl.calls.reset();
    publishBuildIdentity.calls.reset();

    service.reset();

    expect(setBuildIdentityForUrl).not.toHaveBeenCalled();
    expect(publishBuildIdentity).not.toHaveBeenCalled();
  });
});
