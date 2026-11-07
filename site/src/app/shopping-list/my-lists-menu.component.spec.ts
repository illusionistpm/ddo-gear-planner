import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { CurrentBuildService } from '../build/current-build.service';
import { GroupSummary } from '../build/groups.service';
import { ListReturnService } from '../build/list-return.service';
import { MyListsService } from '../build/my-lists.service';
import { EquippedService } from '../planner/equipped.service';
import { MyListsMenuComponent } from './my-lists-menu.component';

const list = (shortId: string, name: string, overrides: Partial<GroupSummary> = {}): GroupSummary => ({
  shortId, name, inviteToken: `tok-${shortId}`, isHost: false, buildCount: 2, yourBuildIds: [], updatedAt: '', ...overrides
});

describe('MyListsMenuComponent', () => {
  let fixture: ComponentFixture<MyListsMenuComponent>;
  let lists: BehaviorSubject<readonly GroupSummary[]>;
  let refresh: ReturnType<typeof vi.fn>;
  let planner: { hasPlanner: boolean; listUrl: string };
  let buildEmpty: boolean;

  const el = () => fixture.nativeElement as HTMLElement;
  const button = () => el().querySelector<HTMLButtonElement>('.lists-menu-button');
  const items = () => Array.from(el().querySelectorAll<HTMLButtonElement>('.lists-menu-item'));
  const names = () => items().map(item => item.querySelector('.lists-menu-name')?.textContent);
  const checked = () => items().filter(item => item.getAttribute('aria-checked') === 'true')
    .map(item => item.querySelector('.lists-menu-name')?.textContent);

  beforeEach(async () => {
    lists = new BehaviorSubject<readonly GroupSummary[]>([]);
    refresh = vi.fn();
    planner = { hasPlanner: true, listUrl: '/build/s1?b=z1.x#shopping-list' };
    buildEmpty = false;
    await TestBed.configureTestingModule({
      declarations: [MyListsMenuComponent],
      providers: [
        provideRouter([]),
        { provide: MyListsService, useValue: { lists$: lists, refresh } },
        { provide: ListReturnService, useValue: planner },
        { provide: CurrentBuildService, useValue: { value: { name: 'Tank' } } },
        { provide: EquippedService, useValue: { isBuildEmpty: () => buildEmpty } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(MyListsMenuComponent);
  });

  /** On a list of several builds' page, as against your build's own list. */
  const onGroup = (shortId: string) => fixture.componentRef.setInput('currentShortId', shortId);

  const arrive = (next: GroupSummary[]) => {
    lists.next(next);
    fixture.detectChanges();
  };

  it('shows nothing on your build\'s list while you have no other lists', () => {
    fixture.detectChanges();
    expect(button()).toBeNull();
  });

  it('on your build\'s list, checks it above yours of several builds, each with its builds and whether you host it, reading them again as it opens', () => {
    fixture.detectChanges();
    arrive([list('a', 'Raid night', { isHost: true, buildCount: 3 }), list('b', 'Alts', { buildCount: 1 })]);
    expect(button()!.textContent).toContain('2');

    button()!.click();
    fixture.detectChanges();

    expect(refresh).toHaveBeenCalled();
    expect(items().map(item => [item.querySelector('.lists-menu-name')?.textContent, item.querySelector('.lists-menu-meta')?.textContent]))
      .toEqual([['Tank', 'this build'], ['Raid night', '3 builds · host'], ['Alts', '1 build']]);
    expect(checked()).toEqual(['Tank']);
  });

  it('goes to the list chosen, and closes', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture.detectChanges();
    arrive([list('a', 'Raid night')]);
    button()!.click();
    fixture.detectChanges();

    items()[1].click();
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith('/list/a#t=tok-a');
    expect(items().length).toBe(0);
  });

  it('on a list of several builds, checks it, and goes back to your build\'s list with it open', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    onGroup('a');
    fixture.detectChanges();
    arrive([list('a', 'Raid night'), list('b', 'Alts')]);
    expect(button()!.textContent).toContain('2');
    button()!.click();
    fixture.detectChanges();
    expect(names()).toEqual(['Tank', 'Raid night', 'Alts']);
    expect(checked()).toEqual(['Raid night']);

    items()[0].click();

    expect(navigate).toHaveBeenCalledWith('/build/s1?b=z1.x#shopping-list');
  });

  it('stays put when the list on screen is chosen', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    onGroup('a');
    fixture.detectChanges();
    arrive([list('a', 'Raid night')]);
    button()!.click();
    fixture.detectChanges();

    items()[1].click();
    fixture.detectChanges();

    expect(navigate).not.toHaveBeenCalled();
    expect(items().length).toBe(0);
  });

  it('offers no build of yours when the planner was never shown, or holds no gear', () => {
    planner.hasPlanner = false;
    onGroup('a');
    fixture.detectChanges();
    arrive([list('a', 'Raid night'), list('b', 'Alts')]);
    button()!.click();
    fixture.detectChanges();
    expect(names()).toEqual(['Raid night', 'Alts']);

    planner.hasPlanner = true;
    buildEmpty = true;
    arrive([list('a', 'Raid night'), list('b', 'Alts')]);
    expect(names()).toEqual(['Raid night', 'Alts']);
  });

  it('hides on a list of several builds when it is the only one, and there is no build of yours', () => {
    planner.hasPlanner = false;
    onGroup('a');
    fixture.detectChanges();
    arrive([list('a', 'Raid night')]);
    expect(button()).toBeNull();

    planner.hasPlanner = true;
    arrive([list('a', 'Raid night')]);
    expect(button()!.textContent).toContain('1');
  });
});
