import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';

import { CurrentBuildService, CurrentBuildState } from '../build/current-build.service';
import { ShoppingListService } from '../planner/shopping-list/shopping-list.service';
import { AnalyticsService } from '../shared/analytics.service';
import { AuthService } from '../shared/auth.service';
import { Clipboard } from '../shared/clipboard';
import { ShoppingListShareMenuComponent } from './shopping-list-share-menu.component';
import { MenuBackdropComponent } from '../menu-backdrop/menu-backdrop.component';

describe('ShoppingListShareMenuComponent', () => {
  let fixture: ComponentFixture<ShoppingListShareMenuComponent>;
  let copy: ReturnType<typeof vi.spyOn>;
  let build: CurrentBuildState;
  let signedIn: BehaviorSubject<boolean>;
  let signIn: ReturnType<typeof vi.fn>;

  const el = () => fixture.nativeElement as HTMLElement;
  const items = () => Array.from(el().querySelectorAll<HTMLButtonElement>('.share-menu-item'));
  const labels = () => items().map(item => item.textContent?.trim());
  const note = () => el().querySelector('.share-menu-note')?.textContent?.trim() ?? null;
  const click = (label: string) => {
    items().find(item => item.textContent?.trim() === label)!.click();
    fixture.detectChanges();
  };
  const render = (state: Partial<CurrentBuildState>) => {
    build = { savedBuildId: null, shortId: null, name: null, isDirty: false, ownership: 'other', ...state };
    fixture = TestBed.createComponent(ShoppingListShareMenuComponent);
    fixture.detectChanges();
  };
  const yours = { savedBuildId: 'b1', shortId: 's1', name: 'Mine', ownership: 'owned' as const };

  beforeEach(async () => {
    copy = vi.spyOn(Clipboard, 'copy').mockReturnValue(true);
    signedIn = new BehaviorSubject(true);
    signIn = vi.fn();
    await TestBed.configureTestingModule({
      imports: [MenuBackdropComponent],
      declarations: [ShoppingListShareMenuComponent],
      providers: [
        { provide: ShoppingListService, useValue: { stillNeededText: () => 'Still needed (2):', stillNeededKeys: () => ['a', 'b'] } },
        { provide: CurrentBuildService, useValue: { get value() { return build; } } },
        { provide: AuthService, useValue: { isAuthenticated$: signedIn, signIn } }
      ]
    }).compileComponents();
  });

  it('links a saved build of yours to the live list, which follows your ticks', () => {
    render(yours);
    expect(labels()).toEqual(['Copy link', 'Copy list + link', 'Copy list']);
    expect(note()).toBeNull();

    click('Copy link');

    expect(copy).toHaveBeenCalledWith(`${window.location.origin}/still-needed/s1/mine`);
    expect(labels()[0]).toBe('Copied!');
  });

  it('copies the list with the link under it, or the list alone', () => {
    render(yours);

    click('Copy list + link');
    expect(copy).toHaveBeenLastCalledWith(`Still needed (2):\n${window.location.origin}/still-needed/s1/mine`);

    click('Copy list');
    expect(copy).toHaveBeenLastCalledWith('Still needed (2):');
  });

  it('holds the link back while there are changes on screen, saying to save them', () => {
    render({ ...yours, isDirty: true });

    expect(labels()).toEqual(['Copy link', 'Copy list + link', 'Copy list']);
    expect(items().map(item => item.disabled)).toEqual([true, true, false]);
    expect(note()).toBe('Save your changes to share a live list. Friends see the build as last saved.');
    click('Copy link');
    expect(copy).not.toHaveBeenCalled();
  });

  for (const [what, state, hint] of [
    ['a build never saved', {}, 'Save this build to share a live list with friends.'],
    ['someone else\'s build', { shortId: 'x9', name: 'Theirs' }, 'Save a copy of this build to share a live list of your own.'],
  ] as const) {
    it(`offers only the list as text for ${what}, saying how to share it live`, () => {
      render(state);

      expect(labels()).toEqual(['Copy list']);
      expect(note()).toBe(hint);
      click('Copy list');
      expect(copy).toHaveBeenCalledWith('Still needed (2):');
    });
  }

  it('says to sign in, with a way to, when signed out', () => {
    signedIn.next(false);
    render({});

    expect(labels()).toEqual(['Copy list']);
    expect(note()).toBe('Sign in and save this build to share a live list with friends.');
    (el().querySelector('.share-menu-hint') as HTMLButtonElement).click();
    expect(signIn).toHaveBeenCalled();
  });

  it('tracks each copy', () => {
    const track = vi.spyOn(TestBed.inject(AnalyticsService), 'track').mockReturnValue(undefined);
    render(yours);

    click('Copy link');
    click('Copy list + link');
    click('Copy list');

    expect(track.mock.calls).toEqual([
      ['copy_shopping_list', { copy_kind: 'link', needed_count: 2 }],
      ['copy_shopping_list', { copy_kind: 'text_and_link', needed_count: 2 }],
      ['copy_shopping_list', { copy_kind: 'text', needed_count: 2 }],
    ]);
  });

  it('says when the clipboard refused, without saying it copied', () => {
    copy.mockReturnValue(false);
    render(yours);

    click('Copy link');

    expect(el().querySelector('.share-menu-error')?.textContent).toContain('Could not copy');
    expect(labels()[0]).toBe('Copy link');
  });

  it('closes when clicked away from', () => {
    render(yours);
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);

    (el().querySelector('.menu-backdrop') as HTMLButtonElement).click();

    expect(closed).toHaveBeenCalled();
  });
});
