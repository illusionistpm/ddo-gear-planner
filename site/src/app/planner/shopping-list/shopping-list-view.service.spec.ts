import { ApplicationRef, Component } from '@angular/core';
import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, provideRouter, Router } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';

import { CurrentBuildService } from '../../build/current-build.service';
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
    // Bootstrapping does this; without it Back (a popstate) never reaches the router.
    TestBed.inject(Router).setUpLocationChangeListener();
  });

  describe('Back', () => {
    // The router handles a popstate on a timer, which whenStable doesn't wait for.
    async function landing(go: () => void): Promise<void> {
      const landed = firstValueFrom(TestBed.inject(Router).events.pipe(filter(event => event instanceof NavigationEnd)));
      go();
      await landed;
      await settle();
    }

    async function openFrom(url: string): Promise<ShoppingListViewService> {
      await TestBed.inject(Router).navigateByUrl(url);
      const view = TestBed.inject(ShoppingListViewService);
      view.open('toolbar');
      await settle();
      return view;
    }

    it('closes the list opened from the planner, back to the planner\'s URL', async () => {
      const view = await openFrom('/?b=z1.test');

      await landing(() => TestBed.inject(Location).back());

      expect(view.isOpen).toBe(false);
      expect(path()).toBe('/?b=z1.test');
    });

    it('is what the list\'s own close does, so Forward opens it again', async () => {
      const view = await openFrom('/?b=z1.test');
      const location = TestBed.inject(Location);
      const back = vi.spyOn(location, 'back');

      await landing(() => view.close());
      expect(back).toHaveBeenCalled();
      expect(path()).toBe('/?b=z1.test');

      await landing(() => location.forward());
      expect(view.isOpen).toBe(true);
      expect(view.openedFrom).toBe('url');
    });

    it('isn\'t used to close once a save has moved the list to the saved build\'s URL', async () => {
      const view = await openFrom('/?b=z1.test');
      await TestBed.inject(Router).navigateByUrl('/build/abc123/my-build#shopping-list', { replaceUrl: true });
      const back = vi.spyOn(TestBed.inject(Location), 'back');

      view.close();
      await settle();

      expect(back).not.toHaveBeenCalled();
      expect(path()).toBe('/build/abc123/my-build');
    });

    it('isn\'t used to close a list the URL opened, which has no step to go back to', async () => {
      await TestBed.inject(Router).navigateByUrl('/?b=z1.test#shopping-list');
      const view = TestBed.inject(ShoppingListViewService);
      const back = vi.spyOn(TestBed.inject(Location), 'back');

      view.close();
      await settle();

      expect(back).not.toHaveBeenCalled();
      expect(path()).toBe('/?b=z1.test');
    });

    it('stays closed when closed straight after opening, before the open has landed', async () => {
      await TestBed.inject(Router).navigateByUrl('/?b=z1.test');
      const view = TestBed.inject(ShoppingListViewService);

      view.open('toolbar');
      view.close();
      await settle();

      expect(view.isOpen).toBe(false);
      expect(path()).toBe('/?b=z1.test');
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

  it('opens a friend\'s link as that friend\'s view', async () => {
    await TestBed.inject(Router).navigateByUrl('/build/abc123/my-build#still-needed');
    const view = TestBed.inject(ShoppingListViewService);

    expect(view.link).toEqual({ kind: 'live' });
    expect(view.openedFrom).toBe('friend_link');
  });

  it('opens your own list instead of a friend\'s view of a build of yours', async () => {
    await TestBed.inject(Router).navigateByUrl('/build/abc123/my-build#still-needed');
    const view = TestBed.inject(ShoppingListViewService);

    TestBed.inject(CurrentBuildService).markSaved({ savedBuildId: 'b1', shortId: 'abc123', name: 'My Build' });
    expect(view.link).toEqual({ kind: 'own' });
    await settle();
    expect(path()).toBe('/build/abc123/my-build#shopping-list');
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
