import { TestBed } from '@angular/core/testing';

import { CurrentBuildService } from './current-build.service';
import { EquippedService } from '../planner/equipped.service';
import { unsavedChangesGuard } from './unsaved-changes.guard';

describe('unsavedChangesGuard', () => {
  let currentBuild: {
    value: {
      isDirty: boolean;
    };
  };

  function run(nextUrl = '/some-other-page'): boolean {
    const nextState = { url: nextUrl } as any;
    return TestBed.runInInjectionContext(() => unsavedChangesGuard(null as any, null as any, null as any, nextState)) as boolean;
  }

  let buildEmpty: boolean;

  beforeEach(() => {
    currentBuild = { value: { isDirty: false } };
    buildEmpty = false;
    TestBed.configureTestingModule({
      providers: [
        { provide: CurrentBuildService, useValue: currentBuild },
        { provide: EquippedService, useValue: { isBuildEmpty: () => buildEmpty } }
      ]
    });
  });

  it('allows navigation away when there are no unsaved changes', () => {
    expect(run()).toBe(true);
  });

  it('confirms with the user when there are unsaved changes', () => {
    currentBuild.value.isDirty = true;
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    expect(run()).toBe(true);
    expect(window.confirm).toHaveBeenCalled();
  });

  it('does not confirm for a dirty build with no gear equipped - there is nothing to lose', () => {
    currentBuild.value.isDirty = true;
    buildEmpty = true;
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    expect(run()).toBe(true);
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('blocks navigation if the user cancels the confirmation', () => {
    currentBuild.value.isDirty = true;
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    expect(run()).toBe(false);
  });

  it('does not confirm when the destination is still the root build editor route', () => {
    // These all resolve to the same MainComponent - QueryParamsService
    // deliberately crosses between '' and build/:shortId(/:slug) as a build
    // goes dirty/clean (see navigateWithParams), which would otherwise
    // trigger a spurious confirm on every single edit.
    currentBuild.value.isDirty = true;
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    expect(run('/?b=z1.test')).toBe(true);
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('does not confirm when the destination is still a build/:shortId route', () => {
    currentBuild.value.isDirty = true;
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    expect(run('/build/abc123/my-build')).toBe(true);
    expect(window.confirm).not.toHaveBeenCalled();

    expect(run('/build/abc123')).toBe(true);
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('does not confirm for a build editor route with a fragment after its path or query', () => {
    currentBuild.value.isDirty = true;
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    expect(run('/build/abc123/my-build#shopping-list')).toBe(true);
    expect(run('/build/abc123#shopping-list')).toBe(true);
    expect(run('/?b=z1.test#shopping-list')).toBe(true);
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('confirms for the root route with a fragment and no query string, reading the fragment as part of the path', () => {
    // Pins today's behaviour: the path is everything before '?'. No such
    // URL is reachable with unsaved work yet - a dirty build always has b=.
    currentBuild.value.isDirty = true;
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    expect(run('/#shopping-list')).toBe(true);
    expect(window.confirm).toHaveBeenCalled();
  });

  it('still confirms when the destination is genuinely outside the build editor', () => {
    currentBuild.value.isDirty = true;
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    expect(run('/some-admin-page')).toBe(true);
    expect(window.confirm).toHaveBeenCalled();
  });
});
