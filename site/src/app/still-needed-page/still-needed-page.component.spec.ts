import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter, Router, RouterLink } from '@angular/router';
import { BehaviorSubject, of, Subject } from 'rxjs';

import { BuildsService } from '../build/builds.service';
import { FriendBuild, FriendShoppingList, FriendShoppingListService, FriendView } from '../planner/shopping-list/friend-shopping-list.service';
import { CreditsComponent } from '../credits/credits.component';
import { PageChromeComponent } from '../page-chrome/page-chrome.component';
import { AuthService } from '../shared/auth.service';
import { ThemeService } from '../shared/theme.service';
import { SupportLinkComponent } from '../support-link/support-link.component';
import { StillNeededPageComponent } from './still-needed-page.component';

describe('StillNeededPageComponent', () => {
  let fixture: ComponentFixture<StillNeededPageComponent>;
  let views: Subject<FriendView>;
  let watchFor: ReturnType<typeof vi.fn>;
  let signedIn: BehaviorSubject<boolean>;
  let listMine: ReturnType<typeof vi.fn>;
  const list = { view: {}, needed: 0, notShared: false, connection: 'live' } as unknown as FriendShoppingList;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent!.replace(/\s+/g, ' ');
  const listElement = () => el().querySelector('app-shopping-list');

  beforeEach(async () => {
    views = new Subject<FriendView>();
    watchFor = vi.fn(() => views);
    signedIn = new BehaviorSubject(false);
    listMine = vi.fn(() => of([]));
    await TestBed.configureTestingModule({
      declarations: [StillNeededPageComponent, PageChromeComponent, SupportLinkComponent, CreditsComponent],
      imports: [RouterLink],
      // app-shopping-list is ShoppingListComponent's to test.
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ shortId: 's1', slug: 'their-build' })) } },
        { provide: FriendShoppingListService, useValue: { watch: watchFor } },
        { provide: BuildsService, useValue: { listMine } },
        { provide: AuthService, useValue: { isAuthenticated$: signedIn } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(StillNeededPageComponent);
    fixture.detectChanges();
  });

  const arrive = (build: FriendBuild) => {
    views.next({ build, list: build.status === 'ready' ? list : null });
    fixture.detectChanges();
  };

  it('lists what the build the link names still needs, under its name, with a way into the planner', () => {
    expect(watchFor).toHaveBeenCalledWith('s1');
    expect(text()).toContain('Loading the build');

    arrive({ status: 'ready', name: 'Their Build', entries: [] });

    const component = fixture.componentInstance;
    expect(component.heading).toEqual({ name: 'Their Build', plannerPath: '/build/s1/their-build' });
    expect(component.list).toBe(list);
    expect(listElement()).toBeTruthy();
    expect(TestBed.inject(Title).getTitle()).toBe('Still needed for Their Build - DDO Gear Planner');
  });

  it('has the site\'s header, leading to a build of your own, and nothing of the planner\'s', () => {
    arrive({ status: 'ready', name: 'Their Build', entries: [] });

    expect(el().querySelector('.page-chrome-back')?.getAttribute('href')).toBe('/');
    expect(el().querySelector('.page-chrome app-support-link')).toBeTruthy();
    expect(el().querySelector('.page-chrome app-credits')).toBeTruthy();
    expect(el().querySelector('app-build-actions')).toBeNull();
    expect(el().querySelector('app-planner-toolbar')).toBeNull();
  });

  it('has the planner\'s day/night button', () => {
    const theme = TestBed.inject(ThemeService);
    const wasDark = theme.isDarkTheme();
    const toggle = () => el().querySelector<HTMLButtonElement>('.page-chrome .theme-toggle')!;

    toggle().click();
    fixture.detectChanges();

    expect(theme.isDarkTheme()).toBe(!wasDark);
    expect(toggle().getAttribute('aria-pressed')).toBe(String(!wasDark));
    theme.toggleTheme();
  });

  it('says when there\'s no such build, or it\'s too old to read', () => {
    arrive({ status: 'error', error: 'not-found' });
    expect(text()).toContain('No build found');
    expect(listElement()).toBeNull();

    arrive({ status: 'error', error: 'invalid-link' });
    expect(text()).toContain('This build is from an older version');
    expect(el().querySelector('.still-needed-retry')).toBeNull();
  });

  it('offers to try again when the build couldn\'t be fetched', () => {
    arrive({ status: 'error', error: 'network' });
    expect(text()).toContain('Couldn\'t load this build');

    (el().querySelector('.still-needed-retry') as HTMLButtonElement).click();

    expect(watchFor).toHaveBeenCalledTimes(2);
  });

  it('follows the build as its owner saves it, renamed or not', () => {
    arrive({ status: 'ready', name: 'Their Build', entries: [] });
    const heading = fixture.componentInstance.heading;
    arrive({ status: 'ready', name: 'Their Build', entries: [] });
    expect(fixture.componentInstance.heading).toBe(heading);

    arrive({ status: 'ready', name: 'Renamed', entries: [] });

    expect(fixture.componentInstance.heading).toEqual({ name: 'Renamed', plannerPath: '/build/s1/renamed' });
    expect(TestBed.inject(Title).getTitle()).toBe('Still needed for Renamed - DDO Gear Planner');
  });

  it('says the build is gone when its owner deletes it while you watch', () => {
    arrive({ status: 'ready', name: 'Their Build', entries: [] });

    arrive({ status: 'error', error: 'not-found' });

    expect(text()).toContain('No build found');
    expect(listElement()).toBeNull();
  });

  it('asks whether the build is yours only once, not on every change', () => {
    signedIn.next(true);
    arrive({ status: 'ready', name: 'Their Build', entries: [] });
    arrive({ status: 'ready', name: 'Their Build', entries: [] });

    expect(listMine).toHaveBeenCalledTimes(1);
  });

  it('sends the build\'s owner to their own list, which they can tick off', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    signedIn.next(true);
    listMine.mockReturnValue(of([{ shortId: 'other' }, { shortId: 's1' }]));

    arrive({ status: 'ready', name: 'Their Build', entries: [] });

    expect(navigate).toHaveBeenCalledWith('/build/s1/their-build#shopping-list', { replaceUrl: true });
  });

  it('stays for anyone else, signed in or not', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    arrive({ status: 'ready', name: 'Their Build', entries: [] });
    expect(listMine).not.toHaveBeenCalled();

    signedIn.next(true);
    listMine.mockReturnValue(of([{ shortId: 'other' }]));
    fixture.componentInstance.retry();
    arrive({ status: 'ready', name: 'Their Build', entries: [] });

    expect(listMine).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
