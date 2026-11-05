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
import { AuthService } from '../shared/auth.service';
import { GroupRunPageComponent } from './group-run-page.component';

describe('GroupRunPageComponent', () => {
  let fixture: ComponentFixture<GroupRunPageComponent>;
  let views: Subject<GroupRunView>;
  let groupRun: { open: ReturnType<typeof vi.fn>; view$: Subject<GroupRunView>; group: LiveGroupList | null; refreshViewer: ReturnType<typeof vi.fn> };
  let groups: Record<string, ReturnType<typeof vi.fn>>;
  let signedIn: BehaviorSubject<boolean>;
  let signIn: ReturnType<typeof vi.fn>;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent!.replace(/\s+/g, ' ');
  const button = (label: string) => Array.from(el().querySelectorAll<HTMLButtonElement>('button'))
    .find(candidate => candidate.textContent?.replace(/\s+/g, ' ').trim() === label);

  const run = (overrides: Partial<GroupRunView> = {}): GroupRunView => ({
    name: 'Reaper night', view: null, connection: 'live', gone: false, isHost: false, yours: new Set(), showing: 'everyone', unsaved: [],
    characters: [
      { buildId: 'b-kira', characterName: 'Kira', accent: 0, mine: true, needed: 2, total: 2, buildName: 'Tank build', unreadable: false }
    ],
    ...overrides
  });

  async function create(fragment: string | null): Promise<void> {
    views = new Subject<GroupRunView>();
    groupRun = {
      open: vi.fn(), view$: views, refreshViewer: vi.fn(),
      group: { name: 'Reaper night', picks: {}, order: null, version: 'v', members: [
        { buildId: 'b-kira', characterName: 'Kira', list: { name: 'Tank build', blob: 'z1', needed: null, route: {}, order: null, version: 'v' } }
      ] }
    };
    groups = {
      addBuild: vi.fn(() => of({})), renameBuild: vi.fn(() => of({})), removeBuild: vi.fn(() => of(undefined)),
      rotateInvite: vi.fn(() => of({ inviteToken: 'new' })), end: vi.fn(() => of(undefined))
    };
    signedIn = new BehaviorSubject(true);
    signIn = vi.fn();
    await TestBed.configureTestingModule({
      declarations: [GroupRunPageComponent],
      imports: [RouterLink],
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
        { provide: AuthService, useValue: { isAuthenticated$: signedIn, signIn } }
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
    expect(TestBed.inject(Title).getTitle()).toBe('Reaper night - group run - DDO Gear Planner');
  });

  it('says when the link is missing its invite, without watching anything', async () => {
    await create(null);

    expect(text()).toContain('This link is missing its invite');
    expect(groupRun.open).not.toHaveBeenCalled();
  });

  it('says when the group run is over', async () => {
    await create('t=secret');

    arrive({ gone: true });

    expect(text()).toContain('This group run is over');
    expect(el().querySelector('app-shopping-list')).toBeNull();
  });

  it('asks you to sign in to join when you aren\'t', async () => {
    await create('t=secret');
    signedIn.next(false);
    arrive();

    button('Sign in to join')!.click();

    expect(signIn).toHaveBeenCalled();
    expect(button('Your builds')).toBeUndefined();
  });

  it('lists your builds, adding one as the character you name, and marking the ones in it', async () => {
    await create('t=secret');
    arrive();

    button('Your builds')!.click();
    fixture.detectChanges();

    const rows = Array.from(el().querySelectorAll<HTMLElement>('.group-run-build'));
    expect(rows.map(row => row.querySelector('.group-run-build-name')?.textContent)).toEqual(['Tank build', 'My alt with a long name']);
    expect(rows[0].classList).toContain('in-group');
    const altName = rows[1].querySelector<HTMLInputElement>('input')!;
    // Named after the build, as much of it as fits.
    expect(altName.value).toBe('My alt with a long n');

    altName.value = 'Thane';
    altName.dispatchEvent(new Event('input'));
    rows[1].querySelector<HTMLButtonElement>('.group-run-button.primary')!.click();
    await fixture.whenStable();

    expect(groups['addBuild']).toHaveBeenCalledWith('grp1', 'secret', { buildId: 'b-alt', characterName: 'Thane' });
    expect(groupRun.refreshViewer).toHaveBeenCalled();
  });

  it('says when the character name is taken', async () => {
    await create('t=secret');
    groups['addBuild'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { nameTaken: true } })));
    arrive();
    button('Your builds')!.click();
    fixture.detectChanges();

    el().querySelectorAll<HTMLElement>('.group-run-build')[1].querySelector<HTMLButtonElement>('.group-run-button.primary')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text()).toContain('A character in this group already has that name.');
  });

  it('gives the host a way to take a build out, replace the link, and end the group', async () => {
    await create('t=secret');
    arrive();
    expect(el().querySelector('[aria-label="Host options"]')).toBeNull();

    arrive({ isHost: true });
    el().querySelector<HTMLButtonElement>('[aria-label="Host options"]')!.click();
    fixture.detectChanges();
    button('Kira')!.click();
    await fixture.whenStable();
    expect(groups['removeBuild']).toHaveBeenCalledWith('grp1', 'b-kira');

    fixture.detectChanges();
    button('End the group run')!.click();
    fixture.detectChanges();
    expect(groups['end']).not.toHaveBeenCalled();
    button('Yes, end it for everyone')!.click();
    expect(groups['end']).toHaveBeenCalledWith('grp1');
  });
});
