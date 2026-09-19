import { ChangeDetectorRef } from '@angular/core';
import { of, Subject, throwError } from 'rxjs';

import { AnalyticsService } from '../analytics.service';
import { AuthService } from '../auth.service';
import { Clipboard } from '../clipboard';
import { CurrentBuildState } from '../current-build.service';
import { EquippedService } from '../equipped.service';
import { QueryParamsService } from '../query-params.service';
import { ShortLinksService } from '../short-links.service';
import { BuildShareMenuComponent } from './build-share-menu.component';

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

describe('BuildShareMenuComponent', () => {
  let shortLinks: jasmine.SpyObj<ShortLinksService>;
  let queryParams: jasmine.SpyObj<QueryParamsService>;
  let equipped: jasmine.SpyObj<EquippedService>;
  let analytics: jasmine.SpyObj<AnalyticsService>;
  let auth: jasmine.SpyObj<AuthService>;

  beforeEach(() => {
    shortLinks = jasmine.createSpyObj('ShortLinksService', ['create']);
    shortLinks.create.and.returnValue(of({ shortId: 'shrt1234' }));
    queryParams = jasmine.createSpyObj('QueryParamsService', ['encodeCurrentBuild']);
    queryParams.encodeCurrentBuild.and.returnValue('z1.encoded');
    equipped = jasmine.createSpyObj('EquippedService', ['getGearDescription', 'getEquippedItemCount']);
    equipped.getGearDescription.and.returnValue('Weapon: Sword');
    equipped.getEquippedItemCount.and.returnValue(0);
    analytics = jasmine.createSpyObj('AnalyticsService', ['track']);
    auth = jasmine.createSpyObj('AuthService', ['signIn']);
    spyOn(Clipboard, 'copy').and.returnValue(true);
  });

  /** Opens the menu: the component exists only while open, and resolves its link on init. */
  function open(isAuthenticated = false, state: Partial<CurrentBuildState> = {}): BuildShareMenuComponent {
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>('ChangeDetectorRef', ['markForCheck']);
    const component = new BuildShareMenuComponent(shortLinks, queryParams, equipped, analytics, auth, cdr);
    component.buildState = makeState(state);
    component.isAuthenticated = isAuthenticated;
    component.ngOnInit();
    return component;
  }

  it('resolves the link as soon as it opens, not on the first copy click', () => {
    // execCommand/navigator.clipboard.writeText both require the copy itself
    // to be synchronous, so any network round-trip has to happen before the
    // click, not during it. Signed out here, so it resolves synchronously.
    const component = open();

    expect(component.shareLink).toEqual({ status: 'ready', url: window.location.href, kind: 'long' });
  });

  it('copies the current long URL with no network call when signed out', () => {
    const component = open();

    component.copyLink();

    expect(shortLinks.create).not.toHaveBeenCalled();
    expect(Clipboard.copy).toHaveBeenCalledWith(window.location.href);
  });

  it('mints a short link and copies it when signed in with a dirty (unsaved) edit', () => {
    const component = open(true, { shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', isDirty: true, ownership: 'owned' });

    component.copyLink();

    expect(shortLinks.create).toHaveBeenCalledWith('z1.encoded', 'My Build');
    expect(Clipboard.copy).toHaveBeenCalledWith(`${window.location.origin}/build/shrt1234/my-build`);
  });

  it('mints a short link (does not use the canonical URL) for a build the viewer does not own', () => {
    const component = open(true, { shortId: 'abc123', name: 'Someone Else\'s Build', isDirty: false, ownership: 'other' });

    component.copyLink();

    expect(shortLinks.create).toHaveBeenCalled();
  });

  it('shares the build\'s own canonical URL, with no mint at all, for a clean owned saved build', () => {
    // Sharing a saved build used to always mint a NEW immutable snapshot,
    // pinning recipients to a stale copy the moment the build was edited
    // again. A clean, owned, already-saved build shares its own URL instead.
    const component = open(true, { shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', isDirty: false, ownership: 'owned' });
    expect(component.shareLink).toEqual({
      status: 'ready', url: `${window.location.origin}/build/abc123/my-build`, kind: 'canonical'
    });

    component.copyLink();

    expect(shortLinks.create).not.toHaveBeenCalled();
    expect(Clipboard.copy).toHaveBeenCalledWith(`${window.location.origin}/build/abc123/my-build`);
  });

  it('copies gear text plus the link for copyTextAndLink', () => {
    const component = open(true);

    component.copyTextAndLink();

    expect(Clipboard.copy).toHaveBeenCalledWith(`Weapon: Sword\n${window.location.origin}/build/shrt1234`);
  });

  it('copies just the gear text for copyTextOnly, with no network call', () => {
    const component = open();

    component.copyTextOnly();

    expect(shortLinks.create).not.toHaveBeenCalled();
    expect(Clipboard.copy).toHaveBeenCalledWith('Weapon: Sword');
  });

  it('does not copy anything for a link action clicked before the mint resolves - no async fallback', () => {
    const create$ = new Subject<{ shortId: string }>();
    shortLinks.create.and.returnValue(create$);

    const component = open(true);
    expect(component.shareLink).toEqual({ status: 'pending' });

    component.copyLink();
    expect(Clipboard.copy).not.toHaveBeenCalled();

    create$.next({ shortId: 'shrt1234' });
    // Resolves the link, but the earlier click is not retroactively
    // honored - the menu shows it's ready now, and a fresh click copies it.
    expect(component.shareLink).toEqual({ status: 'ready', url: `${window.location.origin}/build/shrt1234`, kind: 'short' });
    component.copyLink();
    expect(Clipboard.copy).toHaveBeenCalledWith(`${window.location.origin}/build/shrt1234`);
  });

  it('surfaces an error and disables the link items if minting the share link fails', () => {
    shortLinks.create.and.returnValue(throwError(new Error('network down')));

    const component = open(true);

    expect(component.shareLink).toEqual({ status: 'error', message: jasmine.any(String) });
    component.copyLink();
    expect(Clipboard.copy).not.toHaveBeenCalled();
  });

  it('surfaces an error, without a false "Copied!", when the clipboard write itself fails', () => {
    (Clipboard.copy as jasmine.Spy).and.returnValue(false);
    const component = open();

    component.copyTextOnly();

    expect(component.justCopied).toBeNull();
    expect(component.shareCopyError).toContain('Could not copy');
  });

  it('shows a transient "Copied!" confirmation that clears itself', (done) => {
    const component = open();

    component.copyTextOnly();

    expect(component.justCopied).toBe('text');
    setTimeout(() => {
      expect(component.justCopied).toBeNull();
      done();
    }, 1600);
  });

  it('tracks which copy action was used', () => {
    const component = open();

    component.copyTextOnly();

    expect(analytics.track).toHaveBeenCalledWith('copy_build', jasmine.objectContaining({ copy_kind: 'text', link_kind: 'none' }));
  });

  it('tracks the resolved link kind (short/canonical/long), not just signed-in-ness', () => {
    const component = open(true, { shortId: 'abc123', savedBuildId: 'build-1', name: 'My Build', isDirty: false, ownership: 'owned' });

    component.copyLink();

    expect(analytics.track).toHaveBeenCalledWith('copy_build', jasmine.objectContaining({ copy_kind: 'link', link_kind: 'canonical' }));
  });

  it('stops a pending mint when the menu closes', () => {
    const create$ = new Subject<{ shortId: string }>();
    shortLinks.create.and.returnValue(create$);
    const component = open(true);

    component.ngOnDestroy();

    expect(create$.observers.length).toBe(0);
  });
});
