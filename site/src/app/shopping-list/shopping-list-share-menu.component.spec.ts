import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';

import { CurrentBuildService } from '../build/current-build.service';
import { ShareLinkResolverService, ShareLinkState } from '../build/share-link-resolver.service';
import { hashNeededKey } from '../build/shopping-list-link';
import { ShoppingListService } from '../planner/shopping-list/shopping-list.service';
import { AnalyticsService } from '../shared/analytics.service';
import { AuthService } from '../shared/auth.service';
import { Clipboard } from '../shared/clipboard';
import { ShoppingListShareMenuComponent } from './shopping-list-share-menu.component';

describe('ShoppingListShareMenuComponent', () => {
  let fixture: ComponentFixture<ShoppingListShareMenuComponent>;
  let shareLink: BehaviorSubject<ShareLinkState>;
  let resolve: ReturnType<typeof vi.fn>;
  let copy: ReturnType<typeof vi.spyOn>;
  let neededKeys: string[];

  const el = () => fixture.nativeElement as HTMLElement;
  const items = () => Array.from(el().querySelectorAll<HTMLButtonElement>('.share-menu-item'));
  const click = (index: number) => {
    items()[index].click();
    fixture.detectChanges();
  };
  const ready = (url: string, kind: 'canonical' | 'short' | 'long') => {
    shareLink.next({ status: 'ready', url, kind });
    fixture.detectChanges();
  };

  beforeEach(async () => {
    shareLink = new BehaviorSubject<ShareLinkState>({ status: 'pending' });
    resolve = vi.fn(() => shareLink);
    neededKeys = ['a|Ring1|Red#0|Ruby', 'g|Feet|Boots'];
    copy = vi.spyOn(Clipboard, 'copy').mockReturnValue(true);
    await TestBed.configureTestingModule({
      declarations: [ShoppingListShareMenuComponent],
      providers: [
        { provide: ShareLinkResolverService, useValue: { resolve } },
        { provide: ShoppingListService, useValue: { stillNeededText: () => 'Still needed (2):', stillNeededKeys: () => neededKeys } },
        { provide: CurrentBuildService, useValue: { value: { shortId: 's1', ownership: 'owned' } } },
        { provide: AuthService, useValue: { isAuthenticated$: of(true) } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(ShoppingListShareMenuComponent);
    fixture.detectChanges();
  });

  it('resolves the build\'s share link as it opens, for the build on screen and who\'s signed in', () => {
    expect(resolve).toHaveBeenCalledWith({ shortId: 's1', ownership: 'owned' }, true);
  });

  it('offers the links once ready, and the list as text at once', () => {
    expect(items().map(item => [item.textContent?.trim(), item.disabled]))
      .toEqual([['Preparing link…', true], ['Preparing link…', true], ['Copy list', false]]);

    ready('https://site/build/s1/mine', 'canonical');

    expect(items().map(item => [item.textContent?.trim(), item.disabled]))
      .toEqual([['Copy link', false], ['Copy list + link', false], ['Copy list', false]]);
  });

  it('links a saved build of yours to the live list, which follows your ticks', () => {
    ready('https://site/build/s1/mine', 'canonical');

    click(0);

    expect(copy).toHaveBeenCalledWith('https://site/build/s1/mine#still-needed');
    expect(items()[0].textContent?.trim()).toBe('Copied!');
  });

  it('links a short link to a snapshot of what\'s still needed when copied', () => {
    ready('https://site/build/x9', 'short');
    neededKeys = ['g|Feet|Boots'];

    click(0);

    expect(copy).toHaveBeenCalledWith(`https://site/build/x9#still-needed:1.${hashNeededKey('g|Feet|Boots')}`);
  });

  it('puts the snapshot in place of a long link\'s own fragment', () => {
    ready('https://site/?b=z1.test#shopping-list', 'long');

    click(0);

    const hashes = neededKeys.map(hashNeededKey).sort().join('.');
    expect(copy).toHaveBeenCalledWith(`https://site/?b=z1.test#still-needed:1.${hashes}`);
  });

  it('copies the list with the link under it, or the list alone', () => {
    ready('https://site/build/s1/mine', 'canonical');

    click(1);
    expect(copy).toHaveBeenLastCalledWith('Still needed (2):\nhttps://site/build/s1/mine#still-needed');

    click(2);
    expect(copy).toHaveBeenLastCalledWith('Still needed (2):');
  });

  it('tracks each copy, with the kind of link', () => {
    const track = vi.spyOn(TestBed.inject(AnalyticsService), 'track').mockReturnValue(undefined);
    ready('https://site/build/x9', 'short');

    click(0);
    click(1);
    click(2);

    expect(track.mock.calls).toEqual([
      ['copy_shopping_list', { copy_kind: 'link', link_kind: 'short', needed_count: 2 }],
      ['copy_shopping_list', { copy_kind: 'text_and_link', link_kind: 'short', needed_count: 2 }],
      ['copy_shopping_list', { copy_kind: 'text', needed_count: 2 }],
    ]);
  });

  it('says when the link couldn\'t be made, still offering the list as text', () => {
    shareLink.next({ status: 'error', message: 'Could not create a share link. Please try again.' });
    fixture.detectChanges();

    expect(el().querySelector('.share-menu-error')?.textContent).toContain('Could not create a share link');
    click(0);
    expect(copy).not.toHaveBeenCalled();
    click(2);
    expect(copy).toHaveBeenCalledWith('Still needed (2):');
  });

  it('says when the clipboard refused, without saying it copied', () => {
    copy.mockReturnValue(false);
    ready('https://site/build/s1/mine', 'canonical');

    click(0);

    expect(el().querySelector('.share-menu-error')?.textContent).toContain('Could not copy');
    expect(items()[0].textContent?.trim()).toBe('Copy link');
  });

  it('closes when clicked away from', () => {
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);

    (el().querySelector('.share-menu-backdrop') as HTMLButtonElement).click();

    expect(closed).toHaveBeenCalled();
  });
});
