import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { ListReturnService } from './list-return.service';

@Component({ template: '', standalone: true })
class BlankComponent { }

describe('ListReturnService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([
        { path: '', component: BlankComponent },
        { path: 'build/:shortId', component: BlankComponent },
        { path: 'list/:shortId', component: BlankComponent },
        { path: 'still-needed/:shortId', component: BlankComponent }
      ])]
    });
  });

  it('goes to a new build when the planner was never shown', () => {
    expect(TestBed.inject(ListReturnService).url).toBe('/');
  });

  it('remembers the planner as it last was, without its open list, through list pages', async () => {
    const service = TestBed.inject(ListReturnService);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/build/s1?b=z1.x#shopping-list');
    await router.navigateByUrl('/list/grp1#t=tok&add');
    await router.navigateByUrl('/still-needed/s2');

    expect(service.url).toBe('/build/s1?b=z1.x');
  });
});
