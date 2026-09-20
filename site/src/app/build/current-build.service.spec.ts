import type { Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';

import { CurrentBuildService } from './current-build.service';
import { QueryParamsService } from './query-params.service';

describe('CurrentBuildService', () => {
  let combinedParamsChanges: BehaviorSubject<Record<string, unknown>>;
  let getCombinedParams: Mock;
  let setBuildIdentityForUrl: Mock;
  let publishBuildIdentity: Mock;
  let refreshLiveEditUrl: Mock;
  let service: CurrentBuildService;

  beforeEach(() => {
    combinedParamsChanges = new BehaviorSubject<Record<string, unknown>>({ Weapon: 'Sword' });
    getCombinedParams = vi.fn().mockName('getCombinedParams').mockReturnValue({ Weapon: 'Sword' });
    setBuildIdentityForUrl = vi.fn().mockName('setBuildIdentityForUrl');
    publishBuildIdentity = vi.fn().mockName('publishBuildIdentity');
    refreshLiveEditUrl = vi.fn().mockName('refreshLiveEditUrl');

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
  function loadBuild(params: {
    shortId: string;
    name: string;
    savedBuildId?: string | null;
  }): void {
    service.markLoaded({ ...params, canonicalParams: { Weapon: 'Sword' } });
  }

  it('starts in a clean, unsaved state', () => {
    expect(service.value).toEqual({
      savedBuildId: null,
      shortId: null,
      name: null,
      isDirty: false,
      ownership: 'other'
    });
  });

  it('becomes dirty when combinedParams changes after a load', () => {
    loadBuild({ shortId: 'abc123', name: 'My Build' });
    expect(service.value.isDirty).toBe(false);

    combinedParamsChanges.next({ Weapon: 'Axe' });

    expect(service.value.isDirty).toBe(true);
  });

  it('is not marked dirty by a change that round-trips back to the same params', () => {
    loadBuild({ shortId: 'abc123', name: 'My Build' });

    combinedParamsChanges.next({ Weapon: 'Axe' });
    expect(service.value.isDirty).toBe(true);

    combinedParamsChanges.next({ Weapon: 'Sword' });
    expect(service.value.isDirty).toBe(false);
  });

  it('ignores key insertion order when comparing params (stable stringify)', () => {
    loadBuild({ shortId: 'abc123', name: 'My Build' });

    // Same logical params, different key order - must not appear dirty.
    combinedParamsChanges.next({ Armor: 'Plate', Weapon: 'Sword' });
    getCombinedParams.mockReturnValue({ Weapon: 'Sword', Armor: 'Plate' });

    // markLoaded re-snapshots via getCombinedParams(), which now also has
    // both keys in the opposite order - the dirty check right after should
    // treat this as clean since only key order differs.
    loadBuild({ shortId: 'abc123', name: 'My Build' });
    combinedParamsChanges.next({ Weapon: 'Sword', Armor: 'Plate' });

    expect(service.value.isDirty).toBe(false);
  });

  it('leaves ownership unknown on load unless a savedBuildId is already given - it is never assumed', () => {
    loadBuild({ shortId: 'abc123', name: 'Someone Else\'s Build' });

    // Not 'other' - that would be just as wrong an assumption as 'owned'.
    // The caller (MainComponent) is expected to resolve this via
    // confirmOwnership() once it's actually checked listMine().
    expect(service.value.ownership).toBe('unknown');
    expect(service.value.savedBuildId).toBeNull();
  });

  it('marks a build owned on load when a savedBuildId is already known', () => {
    loadBuild({ shortId: 'abc123', name: 'My Build', savedBuildId: 'build-1' });

    expect(service.value.ownership).toBe('owned');
    expect(service.value.savedBuildId).toBe('build-1');
  });

  it('tells QueryParamsService what identity to tag onto future live-edit URLs on load - shortId/name only, never savedBuildId', () => {
    loadBuild({ shortId: 'abc123', name: 'My Build', savedBuildId: 'build-1' });

    // savedBuildId is known internally (asserted elsewhere) but must never
    // reach the URL - see BuildUrlIdentity's comment: this is the address
    // bar, copying it is the most common way a build gets shared, so
    // anything here is effectively public.
    expect(setBuildIdentityForUrl).toHaveBeenCalledWith({ shortId: 'abc123', name: 'My Build' });
    expect(publishBuildIdentity).toHaveBeenCalledWith({ shortId: 'abc123', name: 'My Build' });
  });

  it('caches the given canonicalParams under the loaded shortId', () => {
    service.markLoaded({ shortId: 'abc123', name: 'My Build', canonicalParams: { Weapon: 'Sword' } });

    expect(service.getCanonicalParamsCache('abc123')).toEqual({ Weapon: 'Sword' });
    expect(service.getCanonicalParamsCache('xyz789')).toBeNull();
  });

  it('upgrades unknown to owned via confirmOwnership if the shortId still matches', () => {
    loadBuild({ shortId: 'abc123', name: 'My Build' });
    expect(service.value.ownership).toBe('unknown');

    service.confirmOwnership('abc123', 'build-1');

    expect(service.value.ownership).toBe('owned');
    expect(service.value.savedBuildId).toBe('build-1');
    expect(setBuildIdentityForUrl).toHaveBeenCalledWith({ shortId: 'abc123', name: 'My Build' });
    expect(publishBuildIdentity).toHaveBeenCalledWith({ shortId: 'abc123', name: 'My Build' });
  });

  it('resolves unknown to other via confirmOwnership(shortId, null) - a completed check that found no match', () => {
    loadBuild({ shortId: 'abc123', name: 'Someone Else\'s Build' });
    expect(service.value.ownership).toBe('unknown');

    service.confirmOwnership('abc123', null);

    // Must land on 'other', not stay at 'unknown' - a build that genuinely
    // isn't the viewer's would otherwise never resolve, leaving e.g. a save
    // control stuck disabled forever.
    expect(service.value.ownership).toBe('other');
    expect(service.value.savedBuildId).toBeNull();
  });

  describe('restoreIdentity', () => {
    it('updates identity fields without resetting the dirty-tracking baseline', () => {
      loadBuild({ shortId: 'abc123', name: 'My Build', savedBuildId: 'build-1' });
      combinedParamsChanges.next({ Weapon: 'Axe' });
      expect(service.value.isDirty).toBe(true);

      service.restoreIdentity({ shortId: 'abc123', name: 'My Build' });

      // Still dirty relative to the ORIGINAL baseline - restoreIdentity must
      // not reset it the way markLoaded does, or browser back/forward
      // through an edit session would make every restored point look
      // artificially "clean".
      expect(service.value.isDirty).toBe(true);
      combinedParamsChanges.next({ Weapon: 'Sword' });
      expect(service.value.isDirty).toBe(false);
    });

    // This is the actual bug the URL-embedded savedBuildId caused: anyone
    // who opened a copied live-edit link got treated as the owner, because
    // ownership was derived from whatever the URL happened to say. Now that
    // BuildUrlIdentity carries no ownership signal at all, restoring an
    // identity for a build that was never actually confirmed owned must
    // leave ownership exactly where it already was - never promote it.
    it('does not derive ownership from a restored identity - it is not carried by the URL at all', () => {
      loadBuild({ shortId: 'abc123', name: 'My Build' }); // ownership: 'unknown'

      service.restoreIdentity({ shortId: 'abc123', name: 'My Build' });

      expect(service.value.ownership).toBe('unknown');
      expect(service.value.savedBuildId).toBeNull();
    });

    it('carries forward already-confirmed ownership across a restore of the same build', () => {
      loadBuild({ shortId: 'abc123', name: 'My Build' });
      service.confirmOwnership('abc123', 'build-1');
      expect(service.value.ownership).toBe('owned');

      service.restoreIdentity({ shortId: 'abc123', name: 'Renamed Mid-Edit' });

      // Same build (shortId unchanged) - ownership didn't actually change,
      // so it isn't reset to 'unknown' on every single history step.
      expect(service.value.ownership).toBe('owned');
      expect(service.value.savedBuildId).toBe('build-1');
    });

    it('resets ownership to unknown when the restored identity is a different build', () => {
      loadBuild({ shortId: 'abc123', name: 'My Build' });
      service.confirmOwnership('abc123', 'build-1');
      expect(service.value.ownership).toBe('owned');

      service.restoreIdentity({ shortId: 'xyz789', name: 'A Different Build' });

      // A genuinely different shortId - the previous build's confirmed
      // ownership has no bearing on this one, so it must NOT carry forward.
      // MainComponent is expected to re-run confirmOwnership() for it.
      expect(service.value.ownership).toBe('unknown');
      expect(service.value.savedBuildId).toBeNull();
    });

    it('never publishes an identity - it only ever reacts to one already on the stream, and re-publishing would recurse into that same subscriber', () => {
      loadBuild({ shortId: 'abc123', name: 'My Build' });
      publishBuildIdentity.mockClear();

      service.restoreIdentity({ shortId: 'abc123', name: 'My Build' });

      expect(publishBuildIdentity).not.toHaveBeenCalled();
    });

    it('does not touch the canonicalParamsCache', () => {
      service.markLoaded({ shortId: 'abc123', name: 'My Build', canonicalParams: { Weapon: 'Sword' } });

      service.restoreIdentity({ shortId: 'abc123', name: 'Renamed Mid-Edit' });

      expect(service.getCanonicalParamsCache('abc123')).toEqual({ Weapon: 'Sword' });
    });
  });

  describe('setName', () => {
    it('updates the name without requiring a savedBuildId or resetting the dirty baseline', () => {
      combinedParamsChanges.next({ Weapon: 'Axe' });
      expect(service.value.isDirty).toBe(true);

      service.setName('My New Build');

      expect(service.value.name).toBe('My New Build');
      expect(service.value.savedBuildId).toBeNull();
      expect(service.value.shortId).toBeNull();
      // Still dirty relative to the ORIGINAL baseline - setName must not
      // reset it, or naming would incorrectly clear the dirty indicator.
      expect(service.value.isDirty).toBe(true);
      combinedParamsChanges.next({ Weapon: 'Sword' });
      expect(service.value.isDirty).toBe(false);
    });

    it('tells QueryParamsService the new identity and forces an immediate URL refresh', () => {
      service.setName('My New Build');

      expect(setBuildIdentityForUrl).toHaveBeenCalledWith({ shortId: null, name: 'My New Build' });
      expect(publishBuildIdentity).toHaveBeenCalledWith({ shortId: null, name: 'My New Build' });
      expect(refreshLiveEditUrl).toHaveBeenCalled();
    });

    it('preserves an existing shortId/savedBuildId/ownership when renaming, without leaking savedBuildId onto the URL', () => {
      loadBuild({ shortId: 'abc123', name: 'My Build', savedBuildId: 'build-1' });

      service.setName('Renamed');

      expect(setBuildIdentityForUrl).toHaveBeenCalledWith({ shortId: 'abc123', name: 'Renamed' });
      expect(service.value.savedBuildId).toBe('build-1');
      expect(service.value.ownership).toBe('owned');
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

    // Still 'unknown' (xyz789's own load never gave a savedBuildId) - not
    // 'owned' from the stale confirm for a build that's no longer loaded.
    expect(service.value.ownership).toBe('unknown');
    expect(service.value.shortId).toBe('xyz789');
  });

  it('resets the dirty baseline on markSaved', () => {
    loadBuild({ shortId: 'abc123', name: 'My Build' });
    combinedParamsChanges.next({ Weapon: 'Axe' });
    expect(service.value.isDirty).toBe(true);

    getCombinedParams.mockReturnValue({ Weapon: 'Axe' });
    service.markSaved({ savedBuildId: 'build-1', shortId: 'abc123', name: 'My Build', canonicalParams: { Weapon: 'Axe' } });

    expect(service.value.isDirty).toBe(false);
    expect(service.value.ownership).toBe('owned');
    expect(service.value.savedBuildId).toBe('build-1');
    expect(setBuildIdentityForUrl).toHaveBeenCalledWith({ shortId: 'abc123', name: 'My Build' });
    expect(publishBuildIdentity).toHaveBeenCalledWith({ shortId: 'abc123', name: 'My Build' });

    combinedParamsChanges.next({ Weapon: 'Axe' });
    expect(service.value.isDirty).toBe(false);
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
      ownership: 'other'
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
    setBuildIdentityForUrl.mockClear();
    publishBuildIdentity.mockClear();

    service.reset();

    expect(setBuildIdentityForUrl).not.toHaveBeenCalled();
    expect(publishBuildIdentity).not.toHaveBeenCalled();
  });
});
