import { TestBed } from '@angular/core/testing';

import { CurrentBuildService } from './current-build.service';
import { unsavedChangesGuard } from './unsaved-changes.guard';

describe('unsavedChangesGuard', () => {
  let currentBuild: { value: { isDirty: boolean } };

  function run(nextUrl = '/some-other-page'): boolean {
    const nextState = { url: nextUrl } as any;
    return TestBed.runInInjectionContext(() => unsavedChangesGuard(null as any, null as any, null as any, nextState)) as boolean;
  }

  beforeEach(() => {
    currentBuild = { value: { isDirty: false } };
    TestBed.configureTestingModule({
      providers: [{ provide: CurrentBuildService, useValue: currentBuild }]
    });
  });

  it('allows navigation away when there are no unsaved changes', () => {
    expect(run()).toBeTrue();
  });

  it('confirms with the user when there are unsaved changes', () => {
    currentBuild.value.isDirty = true;
    spyOn(window, 'confirm').and.returnValue(true);

    expect(run()).toBeTrue();
    expect(window.confirm).toHaveBeenCalled();
  });

  it('blocks navigation if the user cancels the confirmation', () => {
    currentBuild.value.isDirty = true;
    spyOn(window, 'confirm').and.returnValue(false);

    expect(run()).toBeFalse();
  });

  it('does not confirm when the destination is still the root build editor route', () => {
    // These all resolve to the same MainComponent - QueryParamsService
    // deliberately crosses between '' and build/:shortId(/:slug) as a build
    // goes dirty/clean (see navigateWithParams), which would otherwise
    // trigger a spurious confirm on every single edit.
    currentBuild.value.isDirty = true;
    spyOn(window, 'confirm');

    expect(run('/?b=z1.test')).toBeTrue();
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('does not confirm when the destination is still a build/:shortId route', () => {
    currentBuild.value.isDirty = true;
    spyOn(window, 'confirm');

    expect(run('/build/abc123/my-build')).toBeTrue();
    expect(window.confirm).not.toHaveBeenCalled();

    expect(run('/build/abc123')).toBeTrue();
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('still confirms when the destination is genuinely outside the build editor', () => {
    currentBuild.value.isDirty = true;
    spyOn(window, 'confirm').and.returnValue(true);

    expect(run('/some-admin-page')).toBeTrue();
    expect(window.confirm).toHaveBeenCalled();
  });
});
