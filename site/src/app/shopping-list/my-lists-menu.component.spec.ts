import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { GroupSummary } from '../build/groups.service';
import { MyListsService } from '../build/my-lists.service';
import { MyListsMenuComponent } from './my-lists-menu.component';

const list = (shortId: string, name: string, overrides: Partial<GroupSummary> = {}): GroupSummary => ({
  shortId, name, inviteToken: `tok-${shortId}`, isHost: false, buildCount: 2, yourBuildIds: [], updatedAt: '', ...overrides
});

describe('MyListsMenuComponent', () => {
  let fixture: ComponentFixture<MyListsMenuComponent>;
  let lists: BehaviorSubject<readonly GroupSummary[]>;
  let refresh: ReturnType<typeof vi.fn>;

  const el = () => fixture.nativeElement as HTMLElement;
  const button = () => el().querySelector<HTMLButtonElement>('.lists-menu-button');
  const items = () => Array.from(el().querySelectorAll<HTMLButtonElement>('.lists-menu-item'));

  beforeEach(async () => {
    lists = new BehaviorSubject<readonly GroupSummary[]>([]);
    refresh = vi.fn();
    await TestBed.configureTestingModule({
      declarations: [MyListsMenuComponent],
      providers: [
        provideRouter([]),
        { provide: MyListsService, useValue: { lists$: lists, refresh } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(MyListsMenuComponent);
    fixture.detectChanges();
  });

  const arrive = (next: GroupSummary[]) => {
    lists.next(next);
    fixture.detectChanges();
  };

  it('shows nothing while you have no lists', () => {
    expect(button()).toBeNull();
  });

  it('lists yours, each with its builds and whether you host it, reading them again as it opens', () => {
    arrive([list('a', 'Raid night', { isHost: true, buildCount: 3 }), list('b', 'Alts', { buildCount: 1 })]);
    expect(button()!.textContent).toContain('2');

    button()!.click();
    fixture.detectChanges();

    expect(refresh).toHaveBeenCalled();
    expect(items().map(item => [item.querySelector('.lists-menu-name')?.textContent, item.querySelector('.lists-menu-meta')?.textContent]))
      .toEqual([['Raid night', '3 builds · host'], ['Alts', '1 build']]);
  });

  it('goes to the list chosen, and closes', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    arrive([list('a', 'Raid night')]);
    button()!.click();
    fixture.detectChanges();

    items()[0].click();
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith('/list/a#t=tok-a');
    expect(items().length).toBe(0);
  });

  it('leaves out the list on screen, and hides when it is the only one', () => {
    fixture.componentRef.setInput('currentShortId', 'a');
    arrive([list('a', 'Raid night'), list('b', 'Alts')]);
    button()!.click();
    fixture.detectChanges();
    expect(items().map(item => item.querySelector('.lists-menu-name')?.textContent)).toEqual(['Alts']);

    arrive([list('a', 'Raid night')]);
    expect(button()).toBeNull();
  });
});
