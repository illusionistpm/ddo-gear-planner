import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { NewBuildService } from '../start/new-build.service';
import { startRedirectGuard } from './start-redirect.guard';

@Component({ template: '', standalone: true })
class PageStubComponent { }

describe('startRedirectGuard', () => {
  let prefersPlanner: boolean;

  beforeEach(() => {
    prefersPlanner = false;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: PageStubComponent, canActivate: [startRedirectGuard] },
          { path: 'start', component: PageStubComponent }
        ]),
        { provide: NewBuildService, useValue: { prefersPlanner: () => prefersPlanner } }
      ]
    });
  });

  const land = async (url: string) => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    return router.url;
  };

  it('sends a visit to the bare site to the start page', async () => {
    expect(await land('/')).toBe('/start');
  });

  it('lets a build link or a sign-in callback through', async () => {
    expect(await land('/?b=z1.abc')).toBe('/?b=z1.abc');
  });

  it('lets a reload of a planner view through', async () => {
    expect(await land('/#shopping-list')).toBe('/#shopping-list');
  });

  it('lets the app\'s own navigation to the planner through', async () => {
    await land('/start');

    expect(await land('/')).toBe('/');
  });

  it('opens the planner for a viewer who asked for it', async () => {
    prefersPlanner = true;

    expect(await land('/')).toBe('/');
  });
});
