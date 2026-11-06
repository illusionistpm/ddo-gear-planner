import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';

import { AuthService } from '../shared/auth.service';
import { CurrentBuildService, CurrentBuildState } from './current-build.service';
import { GroupsService, GroupSummary } from './groups.service';
import { MyListsService } from './my-lists.service';

function list(shortId: string, yourBuildIds: string[], updatedAt: string): GroupSummary {
  return { shortId, name: `List ${shortId}`, inviteToken: 'tok', isHost: true, buildCount: 2, yourBuildIds, updatedAt };
}

describe('MyListsService', () => {
  let signedIn: BehaviorSubject<boolean>;
  let listMine: ReturnType<typeof vi.fn>;
  let build: BehaviorSubject<CurrentBuildState>;
  let rejoin: GroupSummary | null;

  beforeEach(() => {
    signedIn = new BehaviorSubject(true);
    listMine = vi.fn(() => of([
      list('old', ['b1'], '2026-11-01T00:00:00.000Z'),
      list('new', ['b1', 'b2'], '2026-11-05T00:00:00.000Z'),
      list('other', ['b3'], '2026-11-06T00:00:00.000Z')
    ]));
    build = new BehaviorSubject<CurrentBuildState>({ savedBuildId: 'b1', shortId: 's1', name: 'Tank', isDirty: false, ownership: 'owned' });
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { isAuthenticated$: signedIn } },
        { provide: GroupsService, useValue: { listMine } },
        { provide: CurrentBuildService, useValue: { state$: build, get value() { return build.value; } } }
      ]
    });
    TestBed.inject(MyListsService).rejoin$.subscribe(found => rejoin = found);
  });

  it('offers the most recently active list the build on screen is on', () => {
    expect(rejoin?.shortId).toBe('new');
    expect(TestBed.inject(MyListsService).listFor('b3')?.shortId).toBe('other');
    expect(TestBed.inject(MyListsService).listFor('b9')).toBeNull();
  });

  it('offers none for a build that isn\'t a saved build of yours, or once signed out', () => {
    build.next({ ...build.value, ownership: 'other' });
    expect(rejoin).toBeNull();

    build.next({ ...build.value, ownership: 'owned' });
    expect(rejoin?.shortId).toBe('new');
    signedIn.next(false);
    expect(rejoin).toBeNull();
  });

  it('finds none on lists from a Worker that doesn\'t say which builds are yours', () => {
    const old: Partial<GroupSummary> = list('old', [], '2026-11-01T00:00:00.000Z');
    delete old.yourBuildIds;
    listMine.mockReturnValue(of([old]));

    TestBed.inject(MyListsService).refresh();

    expect(rejoin).toBeNull();
    expect(TestBed.inject(MyListsService).listFor('b1')).toBeNull();
  });

  it('reads the lists again when asked, only while signed in', () => {
    const service = TestBed.inject(MyListsService);
    listMine.mockReturnValue(of([]));

    service.refresh();
    expect(rejoin).toBeNull();

    signedIn.next(false);
    service.refresh();
    expect(listMine).toHaveBeenCalledTimes(2);
  });
});
