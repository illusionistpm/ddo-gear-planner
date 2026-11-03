import { ApplicationRef, Component } from '@angular/core';
import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { QueryParamsService } from '../../build/query-params.service';
import { ShoppingListViewService } from './shopping-list-view.service';

@Component({ template: '' })
class StubComponent { }

describe('ShoppingListViewService', () => {
  const settle = () => TestBed.inject(ApplicationRef).whenStable();
  const path = () => TestBed.inject(Location).path(true);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', component: StubComponent }]), provideLocationMocks()]
    });
  });

  it('opens when the URL says so, as on a reload', async () => {
    await TestBed.inject(Router).navigateByUrl('/build/abc123/my-build#shopping-list');

    const view = TestBed.inject(ShoppingListViewService);

    expect(view.isOpen).toBe(true);
    expect(view.openedFrom).toBe('url');
  });

  it('stays closed for a URL without the fragment, or with another one', async () => {
    await TestBed.inject(Router).navigateByUrl('/build/abc123/my-build#somewhere-else');

    expect(TestBed.inject(ShoppingListViewService).isOpen).toBe(false);
  });

  it('puts itself in the URL\'s fragment on open, keeping the path and query, and takes it out on close', async () => {
    await TestBed.inject(Router).navigateByUrl('/build/abc123/my-build?b=z1.test');
    const view = TestBed.inject(ShoppingListViewService);
    const queryParams = TestBed.inject(QueryParamsService);

    view.open('toolbar');
    expect(view.isOpen).toBe(true);
    // An app write: AppComponent mustn't reapply the URL's params for it.
    expect(queryParams.consumeAppUrlWrite()).toBe(true);
    await settle();
    expect(path()).toBe('/build/abc123/my-build?b=z1.test#shopping-list');
    expect(view.isOpen).toBe(true);
    expect(view.openedFrom).toBe('toolbar');

    view.close();
    expect(view.isOpen).toBe(false);
    await settle();
    expect(path()).toBe('/build/abc123/my-build?b=z1.test');
  });

  it('closes when a navigation takes the fragment away', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/#shopping-list');
    const view = TestBed.inject(ShoppingListViewService);
    const states: boolean[] = [];
    view.isOpen$.subscribe(open => states.push(open));

    await router.navigateByUrl('/build/abc123/other-build');

    expect(states).toEqual([true, false]);
  });
});
