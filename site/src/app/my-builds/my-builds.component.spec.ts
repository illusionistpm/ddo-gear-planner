import type { MockedObject } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { Build } from '../build/build';
import { BuildsService } from '../build/builds.service';
import { CurrentBuildService } from '../build/current-build.service';
import { MyBuildsComponent } from './my-builds.component';

function makeBuild(overrides: Partial<Build> = {}): Build {
  return {
    id: 'build-1',
    shortId: 'abc123',
    name: 'My Build',
    blob: 'z1.xxx',
    ...overrides
  };
}

describe('MyBuildsComponent', () => {
  let buildsService: MockedObject<BuildsService>;
  let currentBuild: MockedObject<CurrentBuildService>;
  let router: MockedObject<Router>;
  let cdr: MockedObject<ChangeDetectorRef>;

  function create(builds: Build[] = [makeBuild()]): MyBuildsComponent {
    buildsService = {
      listMine: vi.fn().mockName('BuildsService.listMine'),
      delete: vi.fn().mockName('BuildsService.delete')
    } as unknown as MockedObject<BuildsService>;
    buildsService.listMine.mockReturnValue(of(builds));
    buildsService.delete.mockReturnValue(of(undefined));
    currentBuild = {
      reset: vi.fn().mockName('CurrentBuildService.reset'),
      value: { savedBuildId: null, shortId: null, name: null, isDirty: false, ownership: 'other' }
    } as unknown as MockedObject<CurrentBuildService>;
    router = {
      navigateByUrl: vi.fn().mockName('Router.navigateByUrl')
    } as unknown as MockedObject<Router>;
    cdr = {
      markForCheck: vi.fn().mockName('ChangeDetectorRef.markForCheck')
    } as unknown as MockedObject<ChangeDetectorRef>;

    TestBed.configureTestingModule({
      providers: [
        { provide: BuildsService, useValue: buildsService },
        { provide: CurrentBuildService, useValue: currentBuild },
        { provide: Router, useValue: router }
      ]
    });

    const component = TestBed.runInInjectionContext(() => new MyBuildsComponent(buildsService, currentBuild, router, cdr));
    component.ngOnInit();
    return component;
  }

  it('loads the list on init', () => {
    const component = create([makeBuild({ name: 'A' }), makeBuild({ id: 'build-2', name: 'B' })]);

    expect(component.builds?.length).toBe(2);
    expect(component.loadError).toBeNull();
  });

  it('exposes the per-account build limit for the header\'s X/100 indicator', () => {
    const component = create([makeBuild({ name: 'A' })]);

    expect(component.maxBuilds).toBe(100);
  });

  it('surfaces a load error without throwing', () => {
    buildsService = {
      listMine: vi.fn().mockName('BuildsService.listMine'),
      delete: vi.fn().mockName('BuildsService.delete')
    } as unknown as MockedObject<BuildsService>;
    buildsService.listMine.mockReturnValue(throwError(() => new Error('network down')));
    currentBuild = {
      reset: vi.fn().mockName('CurrentBuildService.reset'),
      value: { savedBuildId: null, shortId: null, name: null, isDirty: false, ownership: 'other' }
    } as unknown as MockedObject<CurrentBuildService>;
    router = {
      navigateByUrl: vi.fn().mockName('Router.navigateByUrl')
    } as unknown as MockedObject<Router>;
    cdr = {
      markForCheck: vi.fn().mockName('ChangeDetectorRef.markForCheck')
    } as unknown as MockedObject<ChangeDetectorRef>;
    const component = TestBed.runInInjectionContext(() => new MyBuildsComponent(buildsService, currentBuild, router, cdr));
    component.ngOnInit();

    expect(component.builds).toBeNull();
    expect(component.loadError).toContain('Could not load');
  });

  it('navigates to the build route with a slugified name and closes the panel', () => {
    const component = create();
    const closedSpy = vi.fn().mockName('closed');
    component.closed.subscribe(closedSpy);

    component.open(makeBuild({ shortId: 'abc123', name: 'Fire Wizard Build' }));

    expect(router.navigateByUrl).toHaveBeenCalledWith('/build/abc123/fire-wizard-build');
    expect(closedSpy).toHaveBeenCalled();
  });

  it('confirms before switching away from a dirty build (CanDeactivate does not fire for same-route param changes)', () => {
    const component = create();
    Object.defineProperty(currentBuild, 'value', {
      value: { savedBuildId: 'build-9', shortId: 'current', name: 'Current', isDirty: true, ownership: 'owned' }
    });
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    component.open(makeBuild({ shortId: 'abc123', name: 'Fire Wizard Build' }));

    expect(window.confirm).toHaveBeenCalled();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('proceeds if the user confirms leaving a dirty build', () => {
    const component = create();
    Object.defineProperty(currentBuild, 'value', {
      value: { savedBuildId: 'build-9', shortId: 'current', name: 'Current', isDirty: true, ownership: 'owned' }
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    component.open(makeBuild({ shortId: 'abc123', name: 'Fire Wizard Build' }));

    expect(router.navigateByUrl).toHaveBeenCalledWith('/build/abc123/fire-wizard-build');
  });

  it('resets the current build and navigates home for a clean build, closing the panel', () => {
    const component = create();
    const closedSpy = vi.fn().mockName('closed');
    component.closed.subscribe(closedSpy);

    component.newBuild();

    expect(currentBuild.reset).toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/');
    expect(closedSpy).toHaveBeenCalled();
  });

  it('confirms before clearing a dirty build', () => {
    const component = create();
    Object.defineProperty(currentBuild, 'value', {
      value: { savedBuildId: 'build-9', shortId: 'current', name: 'Current', isDirty: true, ownership: 'owned' }
    });
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    component.newBuild();

    expect(window.confirm).toHaveBeenCalled();
    expect(currentBuild.reset).not.toHaveBeenCalled();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('proceeds clearing a dirty build if the user confirms', () => {
    const component = create();
    Object.defineProperty(currentBuild, 'value', {
      value: { savedBuildId: 'build-9', shortId: 'current', name: 'Current', isDirty: true, ownership: 'owned' }
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    component.newBuild();

    expect(currentBuild.reset).toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('identifies the currently loaded build', () => {
    const component = create();
    Object.defineProperty(currentBuild, 'value', {
      value: { savedBuildId: 'build-1', shortId: 'abc123', name: 'My Build', isDirty: false, ownership: 'owned' }
    });

    expect(component.isCurrentBuild(makeBuild({ id: 'build-1' }))).toBe(true);
    expect(component.isCurrentBuild(makeBuild({ id: 'build-2' }))).toBe(false);
  });

  it('refuses to start a delete for the currently loaded build', () => {
    const component = create();
    Object.defineProperty(currentBuild, 'value', {
      value: { savedBuildId: 'build-1', shortId: 'abc123', name: 'My Build', isDirty: false, ownership: 'owned' }
    });
    const build = makeBuild({ id: 'build-1' });
    const event = {
      stopPropagation: vi.fn().mockName('Event.stopPropagation')
    };

    component.requestDelete(build, event as unknown as Event);

    expect(component.confirmingDeleteId).toBeNull();
    expect(buildsService.delete).not.toHaveBeenCalled();
  });

  it('requires a confirm step before deleting', () => {
    const component = create();
    const build = makeBuild();
    const event = {
      stopPropagation: vi.fn().mockName('Event.stopPropagation')
    };

    component.requestDelete(build, event as unknown as Event);
    expect(component.confirmingDeleteId).toBe(build.id);
    expect(buildsService.delete).not.toHaveBeenCalled();

    component.confirmDelete(build, event as unknown as Event);
    expect(buildsService.delete).toHaveBeenCalledWith(build.id);
  });

  it('removes the deleted build from the list', () => {
    const build = makeBuild();
    const component = create([build]);
    const event = {
      stopPropagation: vi.fn().mockName('Event.stopPropagation')
    };

    component.confirmDelete(build, event as unknown as Event);

    expect(component.builds).toEqual([]);
  });

  it('resets the current build and navigates home if the deleted build was the loaded one', () => {
    const build = makeBuild();
    const component = create([build]);
    Object.defineProperty(currentBuild, 'value', {
      value: { savedBuildId: build.id, shortId: build.shortId, name: build.name, isDirty: false, ownership: 'owned' }
    });
    const event = {
      stopPropagation: vi.fn().mockName('Event.stopPropagation')
    };

    component.confirmDelete(build, event as unknown as Event);

    expect(currentBuild.reset).toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('surfaces a delete error without removing the build', () => {
    buildsService = {
      listMine: vi.fn().mockName('BuildsService.listMine'),
      delete: vi.fn().mockName('BuildsService.delete')
    } as unknown as MockedObject<BuildsService>;
    const build = makeBuild();
    buildsService.listMine.mockReturnValue(of([build]));
    buildsService.delete.mockReturnValue(throwError(() => new Error('nope')));
    currentBuild = {
      reset: vi.fn().mockName('CurrentBuildService.reset'),
      value: { savedBuildId: null, shortId: null, name: null, isDirty: false, ownership: 'other' }
    } as unknown as MockedObject<CurrentBuildService>;
    router = {
      navigateByUrl: vi.fn().mockName('Router.navigateByUrl')
    } as unknown as MockedObject<Router>;
    cdr = {
      markForCheck: vi.fn().mockName('ChangeDetectorRef.markForCheck')
    } as unknown as MockedObject<ChangeDetectorRef>;
    const component = TestBed.runInInjectionContext(() => new MyBuildsComponent(buildsService, currentBuild, router, cdr));
    component.ngOnInit();
    const event = {
      stopPropagation: vi.fn().mockName('Event.stopPropagation')
    };

    component.confirmDelete(build, event as unknown as Event);

    expect(component.deleteError).toContain('Could not delete');
    expect(component.builds).toEqual([build]);
  });
});
