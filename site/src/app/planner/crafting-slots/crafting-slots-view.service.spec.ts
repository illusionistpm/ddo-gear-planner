import { ApplicationRef, Component } from '@angular/core';
import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, provideRouter, Router } from '@angular/router';
import { filter, firstValueFrom, take } from 'rxjs';

import { EquippedService } from '../equipped.service';
import { ShoppingListViewService } from '../shopping-list/shopping-list-view.service';
import { CraftingSlotsViewService } from './crafting-slots-view.service';

@Component({ template: '' })
class StubComponent { }

describe('CraftingSlotsViewService', () => {
  const settle = () => TestBed.inject(ApplicationRef).whenStable();
  const path = () => TestBed.inject(Location).path(true);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', component: StubComponent }]), provideLocationMocks()]
    });
    TestBed.inject(Router).setUpLocationChangeListener();
  });

  // The router handles a popstate on a timer, which whenStable doesn't wait for.
  async function landing(go: () => void): Promise<void> {
    const landed = firstValueFrom(TestBed.inject(Router).events.pipe(filter(event => event instanceof NavigationEnd)));
    go();
    await landed;
    await settle();
  }

  async function openFrom(url: string): Promise<CraftingSlotsViewService> {
    await TestBed.inject(Router).navigateByUrl(url);
    const view = TestBed.inject(CraftingSlotsViewService);
    view.open('switch');
    await settle();
    return view;
  }

  it('says so in the fragment, keeping the build', async () => {
    const view = await openFrom('/?b=z1.test');

    expect(view.isOpen).toBe(true);
    expect(path()).toBe('/?b=z1.test#crafting');
  });

  it('closes on Back, back to the gear', async () => {
    const view = await openFrom('/?b=z1.test');

    await landing(() => TestBed.inject(Location).back());

    expect(view.isOpen).toBe(false);
    expect(path()).toBe('/?b=z1.test');
  });

  it('opens from a URL that says so, with nothing to go back to on close', async () => {
    await TestBed.inject(Router).navigateByUrl('/?b=z1.test#crafting');
    const view = TestBed.inject(CraftingSlotsViewService);
    expect(view.isOpen).toBe(true);
    expect(view.openedFrom).toBe('url');
    const back = vi.spyOn(TestBed.inject(Location), 'back');

    view.close();
    await settle();

    expect(back).not.toHaveBeenCalled();
    expect(path()).toBe('/?b=z1.test');
  });

  it('switches to the Equipment tab, whose view it is', async () => {
    const equipped = TestBed.inject(EquippedService);
    equipped.setActiveMainTab('affixes');

    await openFrom('/?b=z1.test');

    expect(await firstValueFrom(equipped.getActiveMainTab().pipe(take(1)))).toBe('equipment');
  });

  it('switches to the Equipment tab when a URL opens it, too', async () => {
    const equipped = TestBed.inject(EquippedService);
    equipped.setActiveMainTab('affixes');

    await TestBed.inject(Router).navigateByUrl('/?b=z1.test#crafting');
    TestBed.inject(CraftingSlotsViewService);

    expect(await firstValueFrom(equipped.getActiveMainTab().pipe(take(1)))).toBe('equipment');
  });

  it('gives way to the shopping list, and comes back when the list is closed', async () => {
    const view = await openFrom('/?b=z1.test');
    const list = TestBed.inject(ShoppingListViewService);

    list.open('toolbar');
    await settle();
    expect(list.isOpen).toBe(true);
    expect(view.isOpen).toBe(false);

    await landing(() => list.close());
    expect(list.isOpen).toBe(false);
    expect(view.isOpen).toBe(true);
  });
});
