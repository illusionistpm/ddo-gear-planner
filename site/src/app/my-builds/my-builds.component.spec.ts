import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { Build } from '../build';
import { BuildsService } from '../builds.service';
import { CurrentBuildService } from '../current-build.service';
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
  let buildsService: jasmine.SpyObj<BuildsService>;
  let currentBuild: jasmine.SpyObj<CurrentBuildService>;
  let router: jasmine.SpyObj<Router>;
  let cdr: jasmine.SpyObj<ChangeDetectorRef>;

  function create(builds: Build[] = [makeBuild()]): MyBuildsComponent {
    buildsService = jasmine.createSpyObj('BuildsService', ['listMine', 'delete']);
    buildsService.listMine.and.returnValue(of(builds));
    buildsService.delete.and.returnValue(of(undefined));
    currentBuild = jasmine.createSpyObj('CurrentBuildService', ['reset'], {
      value: { savedBuildId: null, shortId: null, name: null, isDirty: false, ownership: 'other' }
    });
    router = jasmine.createSpyObj('Router', ['navigateByUrl']);
    cdr = jasmine.createSpyObj('ChangeDetectorRef', ['markForCheck']);

    TestBed.configureTestingModule({
      providers: [
        { provide: BuildsService, useValue: buildsService },
        { provide: CurrentBuildService, useValue: currentBuild },
        { provide: Router, useValue: router }
      ]
    });

    return TestBed.runInInjectionContext(() => new MyBuildsComponent(buildsService, currentBuild, router, cdr));
  }

  it('loads the list on construction', () => {
    const component = create([makeBuild({ name: 'A' }), makeBuild({ id: 'build-2', name: 'B' })]);

    expect(component.builds?.length).toBe(2);
    expect(component.loadError).toBeNull();
  });

  it('exposes the per-account build limit for the header\'s X/100 indicator', () => {
    const component = create([makeBuild({ name: 'A' })]);

    expect(component.maxBuilds).toBe(100);
  });

  it('surfaces a load error without throwing', () => {
    buildsService = jasmine.createSpyObj('BuildsService', ['listMine', 'delete']);
    buildsService.listMine.and.returnValue(throwError(() => new Error('network down')));
    currentBuild = jasmine.createSpyObj('CurrentBuildService', ['reset'], {
      value: { savedBuildId: null, shortId: null, name: null, isDirty: false, ownership: 'other' }
    });
    router = jasmine.createSpyObj('Router', ['navigateByUrl']);
    cdr = jasmine.createSpyObj('ChangeDetectorRef', ['markForCheck']);
    const component = TestBed.runInInjectionContext(() => new MyBuildsComponent(buildsService, currentBuild, router, cdr));

    expect(component.builds).toBeNull();
    expect(component.loadError).toContain('Could not load');
  });

  it('navigates to the build route with a slugified name and closes the panel', () => {
    const component = create();
    const closedSpy = jasmine.createSpy('closed');
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
    spyOn(window, 'confirm').and.returnValue(false);

    component.open(makeBuild({ shortId: 'abc123', name: 'Fire Wizard Build' }));

    expect(window.confirm).toHaveBeenCalled();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('proceeds if the user confirms leaving a dirty build', () => {
    const component = create();
    Object.defineProperty(currentBuild, 'value', {
      value: { savedBuildId: 'build-9', shortId: 'current', name: 'Current', isDirty: true, ownership: 'owned' }
    });
    spyOn(window, 'confirm').and.returnValue(true);

    component.open(makeBuild({ shortId: 'abc123', name: 'Fire Wizard Build' }));

    expect(router.navigateByUrl).toHaveBeenCalledWith('/build/abc123/fire-wizard-build');
  });

  it('resets the current build and navigates home for a clean build, closing the panel', () => {
    const component = create();
    const closedSpy = jasmine.createSpy('closed');
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
    spyOn(window, 'confirm').and.returnValue(false);

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
    spyOn(window, 'confirm').and.returnValue(true);

    component.newBuild();

    expect(currentBuild.reset).toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('identifies the currently loaded build', () => {
    const component = create();
    Object.defineProperty(currentBuild, 'value', {
      value: { savedBuildId: 'build-1', shortId: 'abc123', name: 'My Build', isDirty: false, ownership: 'owned' }
    });

    expect(component.isCurrentBuild(makeBuild({ id: 'build-1' }))).toBeTrue();
    expect(component.isCurrentBuild(makeBuild({ id: 'build-2' }))).toBeFalse();
  });

  it('refuses to start a delete for the currently loaded build', () => {
    const component = create();
    Object.defineProperty(currentBuild, 'value', {
      value: { savedBuildId: 'build-1', shortId: 'abc123', name: 'My Build', isDirty: false, ownership: 'owned' }
    });
    const build = makeBuild({ id: 'build-1' });
    const event = jasmine.createSpyObj('Event', ['stopPropagation']);

    component.requestDelete(build, event);

    expect(component.confirmingDeleteId).toBeNull();
    expect(buildsService.delete).not.toHaveBeenCalled();
  });

  it('requires a confirm step before deleting', () => {
    const component = create();
    const build = makeBuild();
    const event = jasmine.createSpyObj('Event', ['stopPropagation']);

    component.requestDelete(build, event);
    expect(component.confirmingDeleteId).toBe(build.id);
    expect(buildsService.delete).not.toHaveBeenCalled();

    component.confirmDelete(build, event);
    expect(buildsService.delete).toHaveBeenCalledWith(build.id);
  });

  it('removes the deleted build from the list', () => {
    const build = makeBuild();
    const component = create([build]);
    const event = jasmine.createSpyObj('Event', ['stopPropagation']);

    component.confirmDelete(build, event);

    expect(component.builds).toEqual([]);
  });

  it('resets the current build and navigates home if the deleted build was the loaded one', () => {
    const build = makeBuild();
    const component = create([build]);
    Object.defineProperty(currentBuild, 'value', {
      value: { savedBuildId: build.id, shortId: build.shortId, name: build.name, isDirty: false, ownership: 'owned' }
    });
    const event = jasmine.createSpyObj('Event', ['stopPropagation']);

    component.confirmDelete(build, event);

    expect(currentBuild.reset).toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('surfaces a delete error without removing the build', () => {
    buildsService = jasmine.createSpyObj('BuildsService', ['listMine', 'delete']);
    const build = makeBuild();
    buildsService.listMine.and.returnValue(of([build]));
    buildsService.delete.and.returnValue(throwError(() => new Error('nope')));
    currentBuild = jasmine.createSpyObj('CurrentBuildService', ['reset'], {
      value: { savedBuildId: null, shortId: null, name: null, isDirty: false, ownership: 'other' }
    });
    router = jasmine.createSpyObj('Router', ['navigateByUrl']);
    cdr = jasmine.createSpyObj('ChangeDetectorRef', ['markForCheck']);
    const component = TestBed.runInInjectionContext(() => new MyBuildsComponent(buildsService, currentBuild, router, cdr));
    const event = jasmine.createSpyObj('Event', ['stopPropagation']);

    component.confirmDelete(build, event);

    expect(component.deleteError).toContain('Could not delete');
    expect(component.builds).toEqual([build]);
  });
});
