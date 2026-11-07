import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { BuildsService } from '../build/builds.service';
import { CurrentBuildService, CurrentBuildState } from '../build/current-build.service';
import { GroupsService, GroupSummary } from '../build/groups.service';
import { MyListsService } from '../build/my-lists.service';
import { ShoppingListService } from '../planner/shopping-list/shopping-list.service';
import { AnalyticsService } from '../shared/analytics.service';
import { AuthService } from '../shared/auth.service';
import { Clipboard } from '../shared/clipboard';
import { BuildChoicesComponent } from './build-choices.component';
import { ListDialogComponent } from './list-dialog.component';
import { MyListsMenuComponent } from './my-lists-menu.component';
import { MenuBackdropComponent } from '../menu-backdrop/menu-backdrop.component';
import { OwnListActionsComponent } from './own-list-actions.component';
import { ShoppingListShareMenuComponent } from './shopping-list-share-menu.component';

describe('OwnListActionsComponent', () => {
  let fixture: ComponentFixture<OwnListActionsComponent>;
  let signedIn: BehaviorSubject<boolean>;
  let createGroup: ReturnType<typeof vi.fn>;
  let addBuild: ReturnType<typeof vi.fn>;
  let removeBuild: ReturnType<typeof vi.fn>;
  let added: ReturnType<typeof vi.fn>;
  let signIn: ReturnType<typeof vi.fn>;
  let build: CurrentBuildState;
  let onList: GroupSummary | null;

  const el = () => fixture.nativeElement as HTMLElement;
  const shareButton = () => Array.from(el().querySelectorAll<HTMLButtonElement>('.list-action'))
    .find(button => button.textContent?.trim() === 'Share') ?? null;
  const addButton = () => el().querySelector<HTMLButtonElement>('.list-action-add')!;
  const needs = () => el().querySelector('.add-builds-needs');
  const menu = () => el().querySelector('app-shopping-list-share-menu');
  const list = (overrides: Partial<GroupSummary> = {}): GroupSummary => ({
    shortId: 'grp9', name: 'Saturday run', inviteToken: 'tok9', isHost: false, buildCount: 3, yourBuildIds: ['b1'],
    characterNames: ['Tank', 'Vex', 'Kira'], updatedAt: '', ...overrides
  });

  beforeEach(async () => {
    signedIn = new BehaviorSubject(false);
    createGroup = vi.fn((name: string) => of({ shortId: 'grp1', name, inviteToken: 'tok' }));
    addBuild = vi.fn(() => of({}));
    removeBuild = vi.fn(() => of(undefined));
    added = vi.fn();
    signIn = vi.fn();
    build = { savedBuildId: null, shortId: null, name: null, isDirty: false, ownership: 'other' };
    onList = null;
    await TestBed.configureTestingModule({
      imports: [MenuBackdropComponent, ListDialogComponent, BuildChoicesComponent],
      declarations: [OwnListActionsComponent, ShoppingListShareMenuComponent, MyListsMenuComponent],
      providers: [
        provideRouter([]),
        { provide: ShoppingListService, useValue: { stillNeededText: () => 'Still needed for my build (5):', stillNeededKeys: () => ['k1', 'k2', 'k3', 'k4'] } },
        { provide: GroupsService, useValue: { create: createGroup, addBuild, removeBuild } },
        { provide: BuildsService, useValue: { listMine: () => of([
          { id: 'b1', shortId: 's1', name: 'Tank' },
          { id: 'b2', shortId: 's2', name: 'Healer build' },
          { id: 'b3', shortId: 's3', name: 'A Very Long Build Name Indeed' }
        ]) } },
        { provide: AuthService, useValue: { isAuthenticated$: signedIn, signIn } },
        { provide: MyListsService, useValue: {
          listFor: (buildId: string) => buildId === 'b1' ? onList : null, lists$: of([list({ shortId: 'other', name: 'Tank' })]), added, refresh: vi.fn()
        } }
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
      click(el().querySelector<HTMLButtonElement>('.menu-backdrop')!);
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

  describe('adding builds and inviting friends', () => {
    const inviteButton = () => el().querySelector<HTMLButtonElement>('.list-action-invite')!;
    const dialog = () => el().querySelector<HTMLElement>('dialog');
    const button = (label: string) => Array.from(el().querySelectorAll<HTMLButtonElement>('button'))
      .find(candidate => candidate.textContent?.replace(/\s+/g, ' ').trim() === label);
    const rows = () => Array.from(el().querySelectorAll<HTMLElement>('.build-choice'));
    const listName = () => el().querySelector<HTMLInputElement>('.own-list-name');
    const type = (input: HTMLInputElement, value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const box = (row: HTMLElement) => row.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    const tick = async (row: HTMLElement, checked = true) => {
      if (box(row).checked !== checked) {
        box(row).click();
      }
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const openAdd = async () => {
      click(addButton());
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const ready = () => {
      signedIn.next(true);
      build = { savedBuildId: 'b1', shortId: 's1', name: 'Tank', isDirty: false, ownership: 'owned' };
    };
    const submit = async (label: string) => {
      button(label)!.click();
      await fixture.whenStable();
      fixture.detectChanges();
    };

    it('asks you to sign in first, signed out, under whichever you chose', () => {
      click(addButton());

      expect(needs()?.textContent).toContain('Sign in to put this build on a list');
      expect(addButton().closest('.list-action-wrap')!.querySelector('.add-builds-needs')).toBeTruthy();
      click(Array.from(needs()!.querySelectorAll<HTMLButtonElement>('.share-menu-item')).find(item => item.textContent?.trim() === 'Sign in')!);
      expect(signIn).toHaveBeenCalled();

      click(el().querySelector<HTMLButtonElement>('.menu-backdrop')!);
      click(inviteButton());
      expect(inviteButton().closest('.list-action-wrap')!.querySelector('.add-builds-needs')).toBeTruthy();
      expect(dialog()).toBeNull();
      expect(createGroup).not.toHaveBeenCalled();
    });

    it('asks you to save the build first, as it is, sending you back to the planner to', () => {
      signedIn.next(true);
      const toPlanner = vi.fn();
      fixture.componentInstance.toPlanner.subscribe(toPlanner);

      click(addButton());
      expect(needs()?.textContent).toContain('Save this build first');

      build = { savedBuildId: 'b1', shortId: 's1', name: 'Tank', isDirty: false, ownership: 'other' };
      click(el().querySelector<HTMLButtonElement>('.menu-backdrop')!);
      click(addButton());
      expect(needs()?.textContent).toContain('Save a copy of it first');

      build = { savedBuildId: 'b1', shortId: 's1', name: 'Tank', isDirty: true, ownership: 'owned' };
      click(el().querySelector<HTMLButtonElement>('.menu-backdrop')!);
      click(inviteButton());
      expect(needs()?.textContent).toContain('Save your changes first');

      click(needs()!.querySelector<HTMLButtonElement>('.share-menu-item')!);
      expect(toPlanner).toHaveBeenCalled();
      expect(needs()).toBeNull();
      expect(createGroup).not.toHaveBeenCalled();
    });

    it('starts nothing until you say so: opening Add builds and closing it leaves no list behind, however often', async () => {
      ready();

      for (let i = 0; i < 2; i++) {
        click(addButton());
        await fixture.whenStable();
        expect(dialog()).toBeTruthy();
        click(el().querySelector<HTMLButtonElement>('.list-dialog-close')!);
        expect(dialog()).toBeNull();
        click(inviteButton());
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        fixture.detectChanges();
        expect(dialog()).toBeNull();
      }

      expect(createGroup).not.toHaveBeenCalled();
      expect(addBuild).not.toHaveBeenCalled();
    });

    it('lists your builds, this one first and ticked, and starts a list of the ones ticked, named after their characters unless you name it', async () => {
      ready();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

      await openAdd();

      expect(rows().map(row => row.querySelector('.build-choice-build')?.textContent))
        .toEqual(['Tank', 'Healer build', 'A Very Long Build Name Indeed']);
      expect(rows().map(row => box(row).checked)).toEqual([true, false, false]);
      expect(rows()[0].querySelector('.build-choice-this')).toBeTruthy();
      // "Tank" is one of your lists' names already.
      expect(listName()!.value).toBe('Tank (2)');

      await tick(rows()[1]);
      expect(listName()!.value).toBe('Tank & Healer build');
      // Typing a character's name picks its build.
      type(rows()[2].querySelector<HTMLInputElement>('.build-choice-input')!, 'Thane');
      expect(listName()!.value).toBe('Tank & Healer build & Thane');

      type(listName()!, 'Alts');
      await submit('Start the list');

      const members = [
        { buildId: 'b1', characterName: 'Tank' }, { buildId: 'b2', characterName: 'Healer build' }, { buildId: 'b3', characterName: 'Thane' }
      ];
      expect(createGroup).toHaveBeenCalledWith('Alts', members);
      expect(added).toHaveBeenCalledWith({ shortId: 'grp1', name: 'Alts', inviteToken: 'tok' }, members);
      expect(navigate).toHaveBeenCalledWith('/list/grp1#t=tok');
    });

    it('starts a list without this build, if you untick it, and with none ticked offers nothing to start', async () => {
      ready();
      vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      await openAdd();

      await tick(rows()[0], false);
      expect(button('Start the list')!.disabled).toBe(true);

      await tick(rows()[1]);
      await submit('Start the list');

      expect(createGroup).toHaveBeenCalledWith('Healer build', [{ buildId: 'b2', characterName: 'Healer build' }]);
    });

    it('says which characters need a different name, rather than starting a list the Worker refuses', async () => {
      ready();
      await openAdd();

      type(rows()[1].querySelector<HTMLInputElement>('.build-choice-input')!, 'tank');
      await submit('Start the list');

      expect(rows()[1].textContent).toContain('Each character needs a different name.');
      expect(createGroup).not.toHaveBeenCalled();
    });

    it('on the most recently active list the build is on, puts builds on it and takes them off as you tick them', async () => {
      ready();
      onList = list({ yourBuildIds: ['b1', 'b2'] });
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

      await openAdd();

      expect(dialog()!.textContent).toContain('This build is on Saturday run');
      expect(listName()).toBeNull();
      expect(rows().map(row => box(row).checked)).toEqual([true, true, false]);

      await tick(rows()[2]);
      expect(addBuild).toHaveBeenCalledWith('grp9', 'tok9', { buildId: 'b3', characterName: 'A Very Long Build Na' });
      await tick(rows()[1], false);
      expect(removeBuild).toHaveBeenCalledWith('grp9', 'b2');
      expect(createGroup).not.toHaveBeenCalled();

      await submit('Go to the list');
      expect(navigate).toHaveBeenCalledWith('/list/grp9#t=tok9');
    });

    it('says why a build couldn\'t be put on the list, and unticks it again', async () => {
      ready();
      onList = list();
      addBuild.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { nameTaken: true } })));
      await openAdd();

      await tick(rows()[1]);

      expect(rows()[1].textContent).toContain('A character on this list already has that name.');
      expect(box(rows()[1]).checked).toBe(false);
    });

    it('starts a new list rather than changing the one the build is on, when asked', async () => {
      ready();
      onList = list({ yourBuildIds: ['b1', 'b2'] });
      vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      await openAdd();

      click(button('Start a new list instead')!);
      expect(rows().map(row => box(row).checked)).toEqual([true, false, false]);
      await tick(rows()[1]);
      await submit('Start the list');

      expect(createGroup).toHaveBeenCalledWith('Tank & Healer build', [
        { buildId: 'b1', characterName: 'Tank' }, { buildId: 'b2', characterName: 'Healer build' }
      ]);
      expect(addBuild).not.toHaveBeenCalled();
    });

    it('invites friends to a new list once you\'ve named it, showing its link to copy', async () => {
      ready();
      const copy = vi.spyOn(Clipboard, 'copy').mockReturnValue(true);
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

      click(inviteButton());
      expect(listName()!.value).toMatch(/^Group run, [A-Z][a-z]{2} \d{1,2}$/);
      expect(createGroup).not.toHaveBeenCalled();

      type(listName()!, 'Reaper night');
      await submit('Start the list');

      expect(createGroup).toHaveBeenCalledWith('Reaper night', [{ buildId: 'b1', characterName: 'Tank' }]);
      const url = `${window.location.origin}/list/grp1#t=tok&add`;
      expect(el().querySelector<HTMLInputElement>('.own-list-invite-url')!.value).toBe(url);

      click(button('Copy invite link')!);
      expect(copy).toHaveBeenCalledWith(url);
      expect(button('Copied')).toBeTruthy();

      await submit('Go to the list');
      expect(navigate).toHaveBeenCalledWith('/list/grp1#t=tok');
    });

    it('invites friends to the list the build is on, without starting another', () => {
      ready();
      onList = list();

      click(inviteButton());

      expect(dialog()!.textContent).toContain('add their saved builds to Saturday run');
      expect(el().querySelector<HTMLInputElement>('.own-list-invite-url')!.value).toBe(`${window.location.origin}/list/grp9#t=tok9&add`);
      expect(createGroup).not.toHaveBeenCalled();
    });

    it('says why a list couldn\'t be started', async () => {
      ready();
      createGroup.mockReturnValue(throwError(() => new HttpErrorResponse({
        status: 409, error: { error: 'You\'re hosting 10 group runs already. End one to start another.' }
      })));

      click(inviteButton());
      await submit('Start the list');

      expect(dialog()!.textContent).toContain('You\'re hosting 10 group runs already.');
    });
  });
});
