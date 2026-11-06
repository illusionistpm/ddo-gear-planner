import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';

import { CurrentBuildService, CurrentBuildState } from '../build/current-build.service';
import { GroupsService } from '../build/groups.service';
import { ShoppingListService } from '../planner/shopping-list/shopping-list.service';
import { AnalyticsService } from '../shared/analytics.service';
import { AuthService } from '../shared/auth.service';
import { Clipboard } from '../shared/clipboard';
import { OwnListActionsComponent } from './own-list-actions.component';
import { ShoppingListShareMenuComponent } from './shopping-list-share-menu.component';

describe('OwnListActionsComponent', () => {
  let fixture: ComponentFixture<OwnListActionsComponent>;
  let signedIn: BehaviorSubject<boolean>;
  let createGroup: ReturnType<typeof vi.fn>;
  let signIn: ReturnType<typeof vi.fn>;
  let build: CurrentBuildState;

  const el = () => fixture.nativeElement as HTMLElement;
  const shareButton = () => Array.from(el().querySelectorAll<HTMLButtonElement>('.list-action'))
    .find(button => button.textContent?.trim() === 'Share') ?? null;
  const addButton = () => el().querySelector<HTMLButtonElement>('.list-action-add')!;
  const needs = () => el().querySelector('.add-builds-needs');
  const menu = () => el().querySelector('app-shopping-list-share-menu');

  beforeEach(async () => {
    signedIn = new BehaviorSubject(false);
    createGroup = vi.fn(() => of({ shortId: 'grp1', name: '', inviteToken: 'tok' }));
    signIn = vi.fn();
    build = { savedBuildId: null, shortId: null, name: null, isDirty: false, ownership: 'other' };
    await TestBed.configureTestingModule({
      declarations: [OwnListActionsComponent, ShoppingListShareMenuComponent],
      providers: [
        provideRouter([]),
        { provide: ShoppingListService, useValue: { stillNeededText: () => 'Still needed for my build (5):', stillNeededKeys: () => ['k1', 'k2', 'k3', 'k4'] } },
        { provide: GroupsService, useValue: { create: createGroup } },
        { provide: AuthService, useValue: { isAuthenticated$: signedIn, signIn } }
      ]
    }).compileComponents();
    const currentBuild = TestBed.inject(CurrentBuildService);
    Object.defineProperty(currentBuild, 'value', { configurable: true, get: () => build });
    fixture = TestBed.createComponent(OwnListActionsComponent);
    fixture.componentRef.setInput('hasItems', true);
    fixture.detectChanges();
  });

  const click = (button: HTMLButtonElement) => {
    button.click();
    fixture.detectChanges();
  };

  describe('sharing the list', () => {
    // An unsaved build's menu has only this; the menu's own spec covers the links.
    const copyListItem = () => Array.from(el().querySelectorAll<HTMLButtonElement>('.share-menu-item'))
      .find(item => ['Copy list', 'Copied!'].includes(item.textContent?.trim() ?? ''))!;

    it('opens a Share menu, closed again by clicking away or Escape', () => {
      click(shareButton()!);
      expect(menu()).toBeTruthy();
      expect(shareButton()!.getAttribute('aria-expanded')).toBe('true');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();
      expect(menu()).toBeNull();

      click(shareButton()!);
      click(el().querySelector<HTMLButtonElement>('.share-menu-backdrop')!);
      expect(menu()).toBeNull();
    });

    it('copies the list as text from the menu, within the click, and says so', () => {
      const copy = vi.spyOn(Clipboard, 'copy').mockReturnValue(true);
      const track = vi.spyOn(TestBed.inject(AnalyticsService), 'track').mockReturnValue(undefined);
      click(shareButton()!);

      click(copyListItem());

      expect(copy).toHaveBeenCalledWith('Still needed for my build (5):');
      expect(copyListItem().textContent?.trim()).toBe('Copied!');
      expect(track).toHaveBeenCalledWith('copy_shopping_list', { copy_kind: 'text', needed_count: 4 });
    });

    it('says when the clipboard refused', () => {
      vi.spyOn(Clipboard, 'copy').mockReturnValue(false);
      click(shareButton()!);

      click(copyListItem());

      expect(el().querySelector('.share-menu-error')?.textContent).toContain('Could not copy');
      expect(copyListItem().textContent?.trim()).toBe('Copy list');
    });

    it('is not offered with nothing to get', () => {
      fixture.componentRef.setInput('hasItems', false);
      fixture.detectChanges();

      expect(shareButton()).toBeNull();
      expect(addButton()).toBeTruthy();
    });
  });

  describe('adding builds', () => {
    it('asks you to sign in first, signed out', () => {
      click(addButton());

      expect(needs()?.textContent).toContain('Sign in to add your other saved builds');
      click(Array.from(needs()!.querySelectorAll<HTMLButtonElement>('.share-menu-item')).find(item => item.textContent?.trim() === 'Sign in')!);
      expect(signIn).toHaveBeenCalled();
      expect(createGroup).not.toHaveBeenCalled();
    });

    it('asks you to save the build first, as it is, sending you back to the planner to', () => {
      signedIn.next(true);
      const toPlanner = vi.fn();
      fixture.componentInstance.toPlanner.subscribe(toPlanner);

      click(addButton());
      expect(needs()?.textContent).toContain('Save this build first');

      build = { savedBuildId: 'b1', shortId: 's1', name: 'Tank', isDirty: false, ownership: 'other' };
      click(el().querySelector<HTMLButtonElement>('.share-menu-backdrop')!);
      click(addButton());
      expect(needs()?.textContent).toContain('Save a copy of it first');

      build = { savedBuildId: 'b1', shortId: 's1', name: 'Tank', isDirty: true, ownership: 'owned' };
      click(el().querySelector<HTMLButtonElement>('.share-menu-backdrop')!);
      click(addButton());
      expect(needs()?.textContent).toContain('Save your changes first');

      click(needs()!.querySelector<HTMLButtonElement>('.share-menu-item')!);
      expect(toPlanner).toHaveBeenCalled();
      expect(needs()).toBeNull();
      expect(createGroup).not.toHaveBeenCalled();
    });

    it('starts a list with this build in it, as a character named after it, and opens it at Add builds', async () => {
      signedIn.next(true);
      build = { savedBuildId: 'b1', shortId: 's1', name: 'A Very Long Build Name Indeed', isDirty: false, ownership: 'owned' };
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

      click(addButton());
      await fixture.whenStable();

      expect(needs()).toBeNull();
      expect(createGroup).toHaveBeenCalledWith('', [{ buildId: 'b1', characterName: 'A Very Long Build Na' }]);
      expect(navigate).toHaveBeenCalledWith('/list/grp1#t=tok&add');
    });
  });
});
