import { HttpErrorResponse } from '@angular/common/http';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter, RouterLink } from '@angular/router';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';

import { BuildsService } from '../build/builds.service';
import { GroupsService } from '../build/groups.service';
import type { LiveGroupList } from '../build/live-group-list.service';
import { GroupRunService, GroupRunView } from '../planner/shopping-list/group-run.service';
import { ListReturnService } from '../build/list-return.service';
import { GroupSummary } from '../build/groups.service';
import { MyListsService } from '../build/my-lists.service';
import { EquippedService } from '../planner/equipped.service';
import { MyListsMenuComponent } from '../shopping-list/my-lists-menu.component';
import { ShoppingProgressStore } from '../planner/shopping-list/shopping-progress-store';
import { AuthService } from '../shared/auth.service';
import { GroupRunPageComponent } from './group-run-page.component';
import { MenuBackdropComponent } from '../menu-backdrop/menu-backdrop.component';
import { Clipboard } from '../shared/clipboard';
import { BuildChoicesComponent, RENAME_DELAY_MS } from '../shopping-list/build-choices.component';
import { ListDialogComponent } from '../shopping-list/list-dialog.component';

describe('GroupRunPageComponent', () => {
  let fixture: ComponentFixture<GroupRunPageComponent>;
  let views: Subject<GroupRunView>;
  let groupRun: { open: ReturnType<typeof vi.fn>; flush: ReturnType<typeof vi.fn>; view$: Subject<GroupRunView>; group: LiveGroupList | null; refreshViewer: ReturnType<typeof vi.fn> };
  let groups: Record<string, ReturnType<typeof vi.fn>>;
  let signedIn: BehaviorSubject<boolean>;
  let signIn: ReturnType<typeof vi.fn>;
  let catchUp: ReturnType<typeof vi.fn>;
  let refreshLists: ReturnType<typeof vi.fn>;
  let lists: BehaviorSubject<readonly GroupSummary[]>;
  let signedInAtCreate = true;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent!.replace(/\s+/g, ' ');
  const button = (label: string) => Array.from(el().querySelectorAll<HTMLButtonElement>('button'))
    .find(candidate => candidate.textContent?.replace(/\s+/g, ' ').trim() === label);

  const manage = () => el().querySelector<HTMLButtonElement>('button[aria-label="Manage this list"]');
  const run = (overrides: Partial<GroupRunView> = {}): GroupRunView => ({
    name: 'Reaper night', view: null, connection: 'live', gone: false, isHost: false, yours: new Set(), showing: 'everyone', unsaved: [],
    characters: [
      { buildId: 'b-kira', characterName: 'Kira', accent: 0, mine: true, needed: 2, total: 2, buildName: 'Tank build', unreadable: false }
    ],
    ...overrides
  });

  afterEach(() => signedInAtCreate = true);

  async function create(fragment: string | null): Promise<void> {
    views = new Subject<GroupRunView>();
    groupRun = {
      open: vi.fn(), flush: vi.fn(() => Promise.resolve()), view$: views, refreshViewer: vi.fn(),
      group: { name: 'Reaper night', picks: {}, order: null, version: 'v', members: [
        { buildId: 'b-kira', characterName: 'Kira', list: { name: 'Tank build', blob: 'z1', needed: null, route: {}, order: null, version: 'v' } }
      ] }
    };
    groups = {
      addBuild: vi.fn(() => of({})), renameBuild: vi.fn(() => of({})), removeBuild: vi.fn(() => of(undefined)),
      rotateInvite: vi.fn(() => of({ inviteToken: 'new' })), end: vi.fn(() => of(undefined)), rename: vi.fn(() => of({ name: 'Saturday raid' }))
    };
    signedIn = new BehaviorSubject(signedInAtCreate);
    signIn = vi.fn();
    catchUp = vi.fn();
    refreshLists = vi.fn();
    lists = new BehaviorSubject<readonly GroupSummary[]>([]);
    await TestBed.configureTestingModule({
      declarations: [GroupRunPageComponent, MyListsMenuComponent],
      imports: [MenuBackdropComponent, RouterLink, ListDialogComponent, BuildChoicesComponent],
      // app-shopping-list is ShoppingListComponent's to test.
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ shortId: 'grp1' }), fragment } } },
        { provide: GroupsService, useValue: groups },
        { provide: BuildsService, useValue: { listMine: () => of([
          { id: 'b-kira', shortId: 's1', name: 'Tank build', createdAt: '', updatedAt: '' },
          { id: 'b-alt', shortId: 's2', name: 'My alt with a long name', createdAt: '', updatedAt: '' }
        ]) } },
        { provide: AuthService, useValue: { isAuthenticated$: signedIn, signIn } },
        { provide: ListReturnService, useValue: { url: '/build/s1/tank-build', hasPlanner: false, listUrl: '' } },
        { provide: EquippedService, useValue: { isBuildEmpty: () => true } },
        { provide: ShoppingProgressStore, useValue: { catchUp } },
        { provide: MyListsService, useValue: { refresh: refreshLists, lists$: lists } }
      ]
    }).overrideComponent(GroupRunPageComponent, {
      set: { providers: [{ provide: GroupRunService, useValue: groupRun }] }
    }).compileComponents();
    fixture = TestBed.createComponent(GroupRunPageComponent);
    fixture.detectChanges();
  }

  const arrive = (overrides: Partial<GroupRunView> = {}) => {
    views.next(run(overrides));
    fixture.detectChanges();
  };

  it('watches the group the link names, with the invite token from its fragment, and titles the page after it', async () => {
    await create('t=secret');

    arrive();

    expect(groupRun.open).toHaveBeenCalledWith('grp1', 'secret');
    expect(el().querySelector('app-shopping-list')).toBeTruthy();
    expect(TestBed.inject(Title).getTitle()).toBe('Reaper night - shopping list - DDO Gear Planner');
  });

  it('says when the link is missing its invite, without watching anything', async () => {
    await create(null);

    expect(text()).toContain('This link is missing its invite');
    expect(groupRun.open).not.toHaveBeenCalled();
  });

  it('says when the list is over', async () => {
    await create('t=secret');

    arrive({ gone: true });

    expect(text()).toContain('This shopping list is over');
    expect(el().querySelector('app-shopping-list')).toBeNull();
  });

  it('asks you to sign in to join when you aren\'t', async () => {
    await create('t=secret');
    signedIn.next(false);
    arrive();

    button('Sign in to join')!.click();

    expect(signIn).toHaveBeenCalled();
    expect(button('Manage builds')).toBeUndefined();
  });

  const choiceRows = () => Array.from(el().querySelectorAll<HTMLElement>('.build-choice'));
  const tickRow = async (row: HTMLElement, checked: boolean) => {
    const box = row.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    if (box.checked !== checked) {
      box.click();
    }
    await fixture.whenStable();
    fixture.detectChanges();
  };

  it('lists your builds, ticking the ones on it, and adds one as the character you name when you tick it', async () => {
    await create('t=secret');
    arrive();

    button('Manage builds')!.click();
    fixture.detectChanges();

    const rows = choiceRows();
    expect(rows.map(row => row.querySelector('.build-choice-build')?.textContent)).toEqual(['Tank build', 'My alt with a long name']);
    expect(rows.map(row => row.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked)).toEqual([true, false]);
    const altName = rows[1].querySelector<HTMLInputElement>('.build-choice-input')!;
    // Named after the build, as much of it as fits.
    expect(altName.value).toBe('My alt with a long n');

    altName.value = 'Thane';
    altName.dispatchEvent(new Event('input'));
    await tickRow(rows[1], true);

    expect(groups['addBuild']).toHaveBeenCalledWith('grp1', 'secret', { buildId: 'b-alt', characterName: 'Thane' });
    expect(groupRun.refreshViewer).toHaveBeenCalled();
  });

  it('takes your build off when you untick it, and renames its character once you stop typing', async () => {
    await create('t=secret');
    arrive();
    button('Manage builds')!.click();
    fixture.detectChanges();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const name = choiceRows()[0].querySelector<HTMLInputElement>('.build-choice-input')!;
      name.value = 'Kira the Bold';
      name.dispatchEvent(new Event('input'));
      expect(groups['renameBuild']).not.toHaveBeenCalled();
      vi.advanceTimersByTime(RENAME_DELAY_MS);
    } finally {
      vi.useRealTimers();
    }
    expect(groups['renameBuild']).toHaveBeenCalledWith('grp1', 'b-kira', 'Kira the Bold');

    await tickRow(choiceRows()[0], false);

    expect(groups['removeBuild']).toHaveBeenCalledWith('grp1', 'b-kira');
  });

  it('says when the character name is taken, and unticks the build again', async () => {
    await create('t=secret');
    groups['addBuild'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { nameTaken: true } })));
    arrive();
    button('Manage builds')!.click();
    fixture.detectChanges();

    await tickRow(choiceRows()[1], true);

    expect(text()).toContain('A character on this list already has that name.');
    expect(choiceRows()[1].querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false);
  });

  const vex = { buildId: 'b-vex', characterName: 'Vex', accent: 1, mine: false, needed: 1, total: 1, buildName: 'Archer build', unreadable: false };

  it('puts its buttons in your own list\'s order: builds, inviting friends, then the lists', async () => {
    await create('t=secret');
    lists.next([{ shortId: 'other', name: 'Alts', inviteToken: 't', isHost: true, buildCount: 1, yourBuildIds: ['b-x'], characterNames: ['X'], updatedAt: '' }]);
    arrive({ isHost: true });

    const labels = Array.from(el().querySelectorAll<HTMLButtonElement>('.group-run-actions button'),
      candidate => candidate.getAttribute('aria-label') ?? candidate.textContent?.replace(/\s+/g, ' ').trim());
    expect(labels).toEqual(['Manage builds', 'Invite friends', 'Lists1', 'Manage this list']);
  });

  it('gives the host, and only the host, a menu at the end of the Lists pill to replace the link and end the list', async () => {
    await create('t=secret');
    arrive();
    expect(manage()).toBeNull();

    // With no other list to go to, there's no Lists half: the host's end stands alone.
    arrive({ isHost: true });
    expect(el().querySelector('.lists-menu-button')).toBeNull();
    manage()!.click();
    fixture.detectChanges();
    expect(button('Kira')).toBeUndefined();

    button('End the list')!.click();
    fixture.detectChanges();
    expect(groups['end']).not.toHaveBeenCalled();
    button('Yes, end it for everyone')!.click();
    expect(groups['end']).toHaveBeenCalledWith('grp1');
  });

  it('lets the host take other people\'s builds off in Manage builds, once confirmed', async () => {
    await create('t=secret');
    arrive({ isHost: true, characters: [...run().characters, vex] });
    button('Manage builds')!.click();
    fixture.detectChanges();

    const others = () => Array.from(el().querySelectorAll<HTMLElement>('.group-run-other'));
    expect(text()).toContain('Other people\'s builds');
    expect(others().map(row => [row.querySelector('.group-run-other-build')?.textContent, row.querySelector('.group-run-other-character')?.textContent]))
      .toEqual([['Archer build', 'Vex']]);
    others()[0].querySelector<HTMLButtonElement>('[aria-label="Take Vex off the list"]')!.click();
    fixture.detectChanges();
    expect(groups['removeBuild']).not.toHaveBeenCalled();

    button('Yes, take off')!.click();
    await fixture.whenStable();

    expect(groups['removeBuild']).toHaveBeenCalledWith('grp1', 'b-vex');
  });

  it('shows someone who isn\'t the host only their own builds', async () => {
    await create('t=secret');
    arrive({ characters: [...run().characters, vex] });
    button('Manage builds')!.click();
    fixture.detectChanges();

    expect(text()).not.toContain('Other people\'s builds');
    expect(el().querySelector('.group-run-other')).toBeNull();
  });

  it('invites friends with a link that brings them to adding their builds', async () => {
    await create('t=secret');
    arrive();
    const copy = vi.spyOn(Clipboard, 'copy').mockReturnValue(true);

    button('Invite friends')!.click();
    fixture.detectChanges();

    expect(copy).toHaveBeenCalledWith(`${window.location.origin}/list/grp1#t=secret&add`);
    expect(button('Invite link copied')).toBeTruthy();
  });

  it('lets the host rename the list from Manage', async () => {
    await create('t=secret');
    arrive({ isHost: true });
    manage()!.click();
    fixture.detectChanges();

    button('Rename the list')!.click();
    fixture.detectChanges();
    const input = el().querySelector<HTMLInputElement>('#groupRunName')!;
    expect(input.value).toBe('Reaper night');
    input.value = '  Saturday raid ';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    button('Save')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(groups['rename']).toHaveBeenCalledWith('grp1', 'Saturday raid');
    expect(el().querySelector('.group-run-menu')).toBeNull();
  });

  it('closes the host menu on Escape', async () => {
    await create('t=secret');
    arrive({ isHost: true });
    manage()!.click();
    fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(el().querySelector('.group-run-menu')).toBeNull();
  });

  it('closes the host menu on a click anywhere else', async () => {
    await create('t=secret');
    arrive({ isHost: true });
    manage()!.click();
    fixture.detectChanges();
    expect(el().querySelector('.group-run-menu')).toBeTruthy();

    el().querySelector<HTMLButtonElement>('.menu-backdrop')!.click();
    fixture.detectChanges();

    expect(el().querySelector('.group-run-menu')).toBeNull();
  });

  it('goes back to the planner as it was before this page', async () => {
    await create('t=secret');

    expect(fixture.componentInstance.plannerLink).toEqual(expect.objectContaining({ label: 'Planner', url: '/build/s1/tank-build' }));
  });

  it('opens at Add builds when its link asks, once you\'re signed in', async () => {
    signedInAtCreate = false;
    await create('t=secret&add');
    arrive();
    expect(el().querySelector('dialog')).toBeNull();

    signedIn.next(true);
    fixture.detectChanges();

    expect(el().querySelector('dialog')).toBeTruthy();
    expect(Array.from(el().querySelectorAll('.build-choice-build'), name => name.textContent)).toEqual(['Tank build', 'My alt with a long name']);
  });

  it('adds builds in a dialog over the list, closed by clicking away or Escape', async () => {
    await create('t=secret');
    arrive();
    const dialog = () => el().querySelector<HTMLElement>('dialog[aria-label="Manage builds"]');

    button('Manage builds')!.click();
    fixture.detectChanges();
    expect(dialog()).toBeTruthy();
    // Inside the panel stays open; outside it, on the dimmed rest of the page, closes.
    dialog()!.querySelector<HTMLElement>('.list-dialog')!.click();
    fixture.detectChanges();
    expect(dialog()).toBeTruthy();
    dialog()!.click();
    fixture.detectChanges();
    expect(dialog()).toBeNull();

    button('Manage builds')!.click();
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(dialog()).toBeNull();
  });

  it('has the planner catch up with ticks made here, once they\'ve been sent, and with your lists, once you leave', async () => {
    await create('t=secret');
    let sent!: () => void;
    groupRun.flush.mockReturnValue(new Promise<void>(resolve => sent = resolve));

    fixture.destroy();

    expect(groupRun.flush).toHaveBeenCalled();
    expect(refreshLists).toHaveBeenCalled();
    // Reading the build's ticks back before the group's writes land would miss them.
    expect(catchUp).not.toHaveBeenCalled();
    sent();
    await Promise.resolve();
    await Promise.resolve();
    expect(catchUp).toHaveBeenCalled();
  });
});
