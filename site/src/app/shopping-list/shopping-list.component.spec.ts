import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, RouterLink } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';

import { ShoppingListComponent } from './shopping-list.component';
import { ShoppingListService } from '../planner/shopping-list/shopping-list.service';
import type {
  ShoppingEntry, ShoppingListView, ShoppingProgress, ShoppingSource
} from '../planner/shopping-list/shopping-list-types';
import { buildShoppingListView, ShoppingListViewOptions } from '../planner/shopping-list/shopping-list-view-model';
import { TapTooltipComponent } from '../tap-tooltip/tap-tooltip.component';
import { UserItemLocationTooltipPipe } from '../shared/user-item-location-tooltip.pipe';
import { Clipboard } from '../shared/clipboard';
import { AnalyticsService } from '../shared/analytics.service';
import { AuthService } from '../shared/auth.service';
import { ShoppingListViewService } from '../planner/shopping-list/shopping-list-view.service';
import { FriendShoppingList } from '../planner/shopping-list/friend-shopping-list.service';
import { ShoppingProgressStore, ShoppingSyncState } from '../planner/shopping-list/shopping-progress-store';
import { ShoppingListShareMenuComponent } from './shopping-list-share-menu.component';
import { CurrentBuildService, CurrentBuildState } from '../build/current-build.service';
import { GroupsService } from '../build/groups.service';
import { GroupRunService, GroupRunView } from '../planner/shopping-list/group-run.service';
import { buildGroupListView, GroupMemberEntries } from '../planner/shopping-list/group-shopping-list';
import { Router } from '@angular/router';

function from(quest: string, pack: string | null = null, raid = false): ShoppingSource {
  return { quest, pack, raid, wikiUrl: `wiki/${quest}` };
}

function entry(init: Partial<ShoppingEntry> & { key: string }): ShoppingEntry {
  return {
    kind: 'gear', identity: init.key, label: init.key, system: null, ml: 0,
    sources: [], sourceInherited: false, rare: false, artifact: false,
    wikiUrl: null, troveName: null, parentKey: null, details: [],
    ...init,
  };
}

const sword = entry({ key: 'g|Weapon|Sword', identity: 'gear|Sword', label: 'Sword', ml: 32,
  sources: [from('The Raid', 'Raid Pack', true)], wikiUrl: 'http://ddowiki.com/page/Item:Sword',
  details: ['Strength +5 Enhancement'] });
const step = entry({ key: 's|Weapon|Sword|LP#0|Set', kind: 'step', identity: 'step|lp', label: 'Archons',
  system: 'Lost Purpose', sources: sword.sources, sourceInherited: true, parentKey: sword.key });
const ring1 = entry({ key: 'g|Ring1|Ring', identity: 'gear|Ring', label: 'Ring', sources: [from('The Snitch')],
  troveName: 'Ring', rare: true });
const ring2 = entry({ key: 'g|Ring2|Ring', identity: 'gear|Ring', label: 'Ring',
  sources: [from('The Snitch')], troveName: 'Ring', rare: true });
const augment = entry({ key: 'a|Weapon|Red#0|Ruby', kind: 'augment', identity: 'augment|Ruby',
  label: 'Ruby', parentKey: sword.key });
const entries = [sword, step, augment, ring1, ring2];

const trove = {
  locationsFor: (name: string) => name === 'Ring' ? [{ character: 'Khalarim', location: 'Inventory', tab: '6' }] : undefined,
};

describe('ShoppingListComponent', () => {
  let fixture: ComponentFixture<ShoppingListComponent>;
  let views: BehaviorSubject<ShoppingListView>;
  let service: { view$: BehaviorSubject<ShoppingListView>; toggle: ReturnType<typeof vi.fn>;
    setFilter: ReturnType<typeof vi.fn>; pickSources: ReturnType<typeof vi.fn>; resetRoute: ReturnType<typeof vi.fn>;
    resetOrder: ReturnType<typeof vi.fn>; arrangePacks: ReturnType<typeof vi.fn>; arrangeQuests: ReturnType<typeof vi.fn>;
    stillNeededText: () => string; stillNeededKeys: () => string[]; };

  const show = (progress: ShoppingProgress, filter: 'all' | 'needed' = 'all', list = entries) => {
    views.next(buildShoppingListView(list, progress, trove, { filter }));
    fixture.detectChanges();
  };
  const el = () => fixture.nativeElement as HTMLElement;
  const rowByName = (name: string) => Array.from(el().querySelectorAll<HTMLElement>('.shopping-row'))
    .find(row => row.querySelector('.shopping-row-name')?.textContent?.trim() === name)!;

  let syncStates: BehaviorSubject<ShoppingSyncState>;
  let createGroup: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    views = new BehaviorSubject(buildShoppingListView(entries, {}, trove, { filter: 'all' }));
    service = { view$: views, toggle: vi.fn(), setFilter: vi.fn(), pickSources: vi.fn(), resetRoute: vi.fn(),
      resetOrder: vi.fn(), arrangePacks: vi.fn(), arrangeQuests: vi.fn(),
      stillNeededText: () => 'Still needed for my build (5):', stillNeededKeys: () => ['k1', 'k2', 'k3', 'k4'] };
    syncStates = new BehaviorSubject<ShoppingSyncState>('off');
    createGroup = vi.fn(() => of({ shortId: 'grp1', name: 'Group run', inviteToken: 'tok' }));
    await TestBed.configureTestingModule({
      declarations: [ShoppingListComponent, ShoppingListShareMenuComponent, TapTooltipComponent, UserItemLocationTooltipPipe],
      imports: [RouterLink],
      providers: [
        provideRouter([]),
        { provide: ShoppingListService, useValue: service },
        { provide: ShoppingListViewService, useValue: { openedFrom: null } },
        { provide: ShoppingProgressStore, useValue: { syncState$: syncStates } },
        { provide: GroupsService, useValue: { create: createGroup } },
        // The share menu asks; signed out, it offers the list as text alone.
        { provide: AuthService, useValue: { isAuthenticated$: of(false), signIn: vi.fn() } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(ShoppingListComponent);
    fixture.detectChanges();
  });

  it('shows each thing with its wiki link and roll, and crafting done where the item drops beneath it', () => {
    const swordRow = rowByName('Sword');
    expect(swordRow.querySelector('a.shopping-row-name')?.getAttribute('href')).toBe('http://ddowiki.com/page/Item:Sword');
    // No ML or slot, to keep the row to one line on desktop.
    expect(swordRow.querySelector('.shopping-row-meta')?.textContent).not.toContain('ML');
    expect(swordRow.querySelector('.shopping-row-meta')?.textContent).not.toContain('Weapon');
    expect(swordRow.querySelector('.shopping-row-details')?.textContent?.trim()).toBe('Roll: Strength +5 Enhancement');

    const nested = swordRow.closest('.shopping-row-item')!.querySelectorAll('.shopping-rows-nested .shopping-row-label');
    expect(Array.from(nested, label => label.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['Lost Purpose: Archons']);
    // Its name says what it is, without an "Augment" label.
    expect(rowByName('Ruby').querySelector('.shopping-row-meta')?.textContent).not.toContain('Augment');
  });

  it('says how many the build needs, and where the trove has it', () => {
    const ringRow = rowByName('Ring');

    // The trove's one ring covers one of the two ring slots.
    expect(ringRow.querySelector('.shopping-row-quantity')?.textContent?.trim()).toBe('1/2');
    expect(ringRow.querySelector('.rare-loot-badge')).toBeTruthy();
    expect(ringRow.querySelector('.owned-badge')?.textContent?.trim()).toBe('Owned');
    expect(ringRow.querySelector('.tap-tooltip-trigger')?.getAttribute('title')).toBe('Khalarim: Inventory (Tab: 6)');
  });

  it('shows the progress so far', () => {
    // The sword ticked, and the trove's one ring covering the first ring slot.
    show({ [sword.key]: 1 });

    expect(el().querySelector('.shopping-list-progress-text')?.textContent?.trim()).toBe('2/5 acquired');
    expect((el().querySelector('.shopping-list-progress-fill') as HTMLElement).style.width).toBe('40%');
  });

  it('ticks a row off through the service, showing checked, part-done and unchecked rows', () => {
    show({ [sword.key]: 1 });
    const box = (name: string) => rowByName(name).querySelector('.shopping-check') as HTMLButtonElement;

    expect(box('Sword').getAttribute('aria-checked')).toBe('true');
    expect(rowByName('Sword').classList).toContain('acquired');
    expect(box('Ring').getAttribute('aria-checked')).toBe('mixed');
    expect(rowByName('Ring').querySelector('.shopping-row-quantity')?.textContent?.trim()).toBe('1/2');
    expect(box('Ruby').getAttribute('aria-checked')).toBe('false');

    box('Ruby').click();
    expect(service.toggle).toHaveBeenCalledWith(expect.objectContaining({ entryKeys: [augment.key] }));
  });

  it('groups by quest under pack headings, without repeating the quest on each row', () => {
    const sections = Array.from(el().querySelectorAll('.shopping-section')).map(section => [
      section.querySelector('.shopping-section-name')?.textContent?.trim(),
      section.querySelector('.shopping-section-count')?.textContent?.trim(),
      Array.from(section.querySelectorAll('.shopping-group-title'), title =>
        title.querySelector('.shopping-group-name')?.textContent?.trim()),
    ]);
    expect(sections).toEqual([
      ['Raid Pack', '0/2', ['The Raid']],
      ['Other sources', '1/3', ['The Snitch', 'Unknown source']],
    ]);
    // A pack's heading and its cards share its colour; quests with no pack have none.
    expect(Array.from(el().querySelectorAll('.shopping-section, .shopping-group'), node =>
      Array.from(node.classList).find(name => name.startsWith('shopping-accent-'))))
      .toEqual(['shopping-accent-0', 'shopping-accent-0', 'shopping-accent-none', 'shopping-accent-none', 'shopping-accent-none']);
    // The pack is the heading, so the quest card doesn't repeat it.
    expect(el().querySelector('.shopping-group-title')?.textContent).not.toContain('Raid Pack');
    expect(rowByName('Sword').querySelector('.shopping-row-where')?.textContent?.trim()).toBe('');
    // A piece to collect; which item it goes in doesn't matter here.
    expect(rowByName('Ruby').querySelector('.shopping-row-where')?.textContent?.trim()).toBe('');
  });

  describe('the pack nav', () => {
    const links = () => Array.from(el().querySelectorAll<HTMLButtonElement>('.shopping-pack-nav-link'));

    it('lists the packs on the route in heading order, in their colours, striking off those got', () => {
      show({ [sword.key]: 1, [step.key]: 1 });

      expect(links().map(link => [
        link.querySelector('.shopping-pack-nav-name')?.textContent?.trim(),
        link.querySelector('.shopping-pack-nav-count')?.textContent?.trim(),
        Array.from(link.classList).find(name => name.startsWith('shopping-accent-')),
        link.classList.contains('done'),
      ])).toEqual([
        ['Raid Pack', '2/2', 'shopping-accent-0', true],
        ['Other sources', '1/3', 'shopping-accent-none', false],
      ]);
    });

    it('is not shown with nothing listed', () => {
      show({}, 'all', []);

      expect(el().querySelector('.shopping-pack-nav')).toBeNull();
    });

    describe('marking the packs on screen', () => {
      // jsdom has no IntersectionObserver: this one is driven by hand.
      let observers: FakeIntersectionObserver[];
      class FakeIntersectionObserver {
        readonly observed: Element[] = [];
        constructor(readonly callback: IntersectionObserverCallback, readonly options: IntersectionObserverInit) {
          observers.push(this);
        }
        observe(target: Element): void {
          this.observed.push(target);
        }
        disconnect(): void {
          this.observed.length = 0;
        }
        see(visible: Record<string, boolean>): void {
          const entries = this.observed
            .filter(target => (target as HTMLElement).dataset['sectionId']! in visible)
            .map(target => ({ target, isIntersecting: visible[(target as HTMLElement).dataset['sectionId']!] }));
          this.callback(entries as unknown as IntersectionObserverEntry[], this as unknown as IntersectionObserver);
          fixture.detectChanges();
        }
      }
      const latest = () => observers[observers.length - 1];
      const marked = () => links().filter(link => link.classList.contains('in-view'))
        .map(link => link.querySelector('.shopping-pack-nav-name')?.textContent?.trim());

      beforeEach(() => {
        observers = [];
        (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeIntersectionObserver;
        fixture.destroy();
        fixture = TestBed.createComponent(ShoppingListComponent);
        fixture.detectChanges();
      });

      afterEach(() => {
        delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
      });

      it('watches each pack scroll through the list, below its header', () => {
        expect(latest().options.root).toBe(el());
        expect(latest().options.rootMargin).toMatch(/^-\d+px 0px 0px 0px$/);
        expect(latest().observed.length).toBe(2);
      });

      it('marks every pack with some part on screen, as they come and go', () => {
        latest().see({ 'pack:Raid Pack': true, 'pack:': true });
        expect(marked()).toEqual(['Raid Pack', 'Other sources']);

        latest().see({ 'pack:Raid Pack': false });
        expect(marked()).toEqual(['Other sources']);
      });

      it('marks none while no pack\'s cards are listed, as in Arrange mode', async () => {
        latest().see({ 'pack:Raid Pack': true });

        el().querySelector<HTMLButtonElement>('.shopping-list-arrange')!.click();
        fixture.detectChanges();
        await Promise.resolve();
        fixture.detectChanges();

        expect(links().length).toBe(2);
        expect(marked()).toEqual([]);
      });

      it('watches again when the packs listed change', () => {
        latest().see({ 'pack:Raid Pack': true });

        show({}, 'all', [sword]);
        // A new observer reports on everything it watches at once.
        latest().see({ 'pack:Raid Pack': false });

        expect(latest().observed.length).toBe(1);
        expect(marked()).toEqual([]);
      });
    });

    it('scrolls the pack heading up to just under the sticky header, and moves focus to it', () => {
      const track = vi.spyOn(TestBed.inject(AnalyticsService), 'track').mockReturnValue(undefined);
      const host = el();
      Object.defineProperty(host, 'scrollTop', { value: 50, writable: true });
      const header = el().querySelector<HTMLElement>('.shopping-list-header')!;
      const title = el().querySelectorAll<HTMLElement>('.shopping-section-title')[1];
      header.getBoundingClientRect = () => ({ bottom: 100 }) as DOMRect;
      title.getBoundingClientRect = () => ({ top: 600 }) as DOMRect;

      links()[1].click();

      expect(host.scrollTop).toBe(50 + 500 - 8);
      expect(document.activeElement).toBe(title);
      expect(track).toHaveBeenCalledWith('jump_to_shopping_pack', { pack_index: 1, pack_count: 2 });
    });
  });

  it('says where else something comes from', () => {
    const anywhere = entry({ key: 'g|Neck|Amulet', identity: 'gear|Amulet', label: 'Amulet',
      sources: [from('The Snitch'), from('The Raid'), from('Vendor')] });
    // The ring still wanted, though the trove has one, so the amulet comes from The Snitch with it.
    show({ [ring1.key]: 0 }, 'all', [anywhere, entry({ ...ring1, sources: [from('The Snitch'), from('Vendor')] })]);
    const snitch = Array.from(el().querySelectorAll('.shopping-group'))
      .find(group => group.querySelector('.shopping-group-name')?.textContent?.trim() === 'The Snitch')!;
    const toggle = (name: string) => Array.from(snitch.querySelectorAll<HTMLElement>('.shopping-row'))
      .find(row => row.querySelector('.shopping-row-name')?.textContent?.trim() === name)!
      .querySelector('.shopping-row-sources-toggle');
    expect(toggle('Amulet')?.textContent?.trim()).toBe('also from 2 other quests');
    expect(toggle('Ring')?.textContent?.trim()).toBe('also from Vendor');
    expect(toggle('Amulet')?.getAttribute('title')).toBe('Also from:\nThe Raid\nVendor');
    expect(toggle('Amulet')?.getAttribute('aria-expanded')).toBe('false');
  });

  describe('picking where to get something', () => {
    const amulet = entry({ key: 'g|Neck|Amulet', identity: 'gear|Amulet', label: 'Amulet',
      sources: [from('Vendor'), from('The Snitch'), from('The Raid', 'Raid Pack')] });
    const snitchRing = entry({ ...ring1, sources: [from('The Snitch')] });
    const showWith = (options: Partial<ShoppingListViewOptions> = {}) => {
      views.next(buildShoppingListView([amulet, snitchRing], {}, trove, { filter: 'all', ...options }));
      fixture.detectChanges();
    };
    const open = () => {
      (rowByName('Amulet').querySelector('.shopping-row-sources-toggle') as HTMLButtonElement).click();
      fixture.detectChanges();
    };
    const choices = () => Array.from(el().querySelectorAll('.shopping-source-choice'), choice => [
      choice.querySelector('.shopping-source-quest')?.textContent?.trim(),
      choice.querySelector('.shopping-source-note')?.textContent?.trim(),
      (choice.querySelector('input') as HTMLInputElement).checked,
    ]);
    const hint = () => el().querySelector('.shopping-source-warning')?.textContent?.trim();
    const check = (quest: string) => (Array.from(el().querySelectorAll('.shopping-source-choice'))
      .find(choice => choice.querySelector('.shopping-source-quest')?.textContent?.trim() === quest)!
      .querySelector('input') as HTMLInputElement).click();

    it('opens under the row with every quest it comes from, in heading order, and what else is there', () => {
      showWith();
      expect(el().querySelector('.shopping-sources')).toBeNull();

      open();
      expect(rowByName('Amulet').querySelector('.shopping-row-sources-toggle')?.getAttribute('aria-expanded')).toBe('true');
      // The list sent it to the quest in a pack.
      expect(choices()).toEqual([
        ['The Raid', 'Raid Pack · nothing else there', true],
        ['The Snitch', 'Other sources · 1 other thing there', false],
        ['Vendor', 'Other sources · nothing else there', false],
      ]);
      expect(hint()).toBeUndefined();
      expect(el().querySelector('.shopping-sources-reset')).toBeNull();

      open();
      expect(el().querySelector('.shopping-sources')).toBeNull();
    });

    it('lists it under each quest ticked, through the service', () => {
      showWith();
      open();

      check('The Snitch');
      expect(service.pickSources).toHaveBeenCalledWith(expect.objectContaining({ id: 'source:The Raid|gear|Amulet' }),
        ['The Raid', 'The Snitch']);
    });

    it('keeps the last quest ticked, and says why under it, in place of its note', () => {
      showWith();
      open();

      check('The Raid');
      fixture.detectChanges();
      expect(service.pickSources).not.toHaveBeenCalled();
      expect(choices()[0]).toEqual(['The Raid', undefined, true]);
      expect(hint()).toBe('It has to come from somewhere: tick another quest first.');

      check('Vendor');
      fixture.detectChanges();
      expect(service.pickSources).toHaveBeenCalledWith(expect.anything(), ['The Raid', 'Vendor']);
      expect(hint()).toBeUndefined();
    });

    it('offers to let the list choose again once the user has picked', () => {
      showWith({ picks: { [amulet.identity]: ['Vendor', 'The Snitch'] } });
      open();

      expect(choices().map(([quest, , checked]) => [quest, checked]))
        .toEqual([['The Raid', false], ['The Snitch', true], ['Vendor', true]]);
      check('Vendor');
      expect(service.pickSources).toHaveBeenCalledWith(expect.anything(), ['The Snitch']);

      (el().querySelector('.shopping-sources-reset') as HTMLButtonElement).click();
      expect(service.pickSources).toHaveBeenCalledWith(expect.anything(), null);
    });

    it('offers to reset the whole route once the user has picked anything, closing the open panel', () => {
      const resetRoute = () => el().querySelector<HTMLButtonElement>('.shopping-list-reset-route');
      showWith();
      expect(resetRoute()).toBeNull();

      showWith({ picks: { [amulet.identity]: ['Vendor'] } });
      open();
      expect(resetRoute()?.textContent?.trim()).toBe('Reset route');
      resetRoute()!.click();
      fixture.detectChanges();

      expect(service.resetRoute).toHaveBeenCalled();
      expect(el().querySelector('.shopping-sources')).toBeNull();
    });

    it('offers to reset the route when planning it again would list something elsewhere', () => {
      const resetRoute = () => el().querySelector<HTMLButtonElement>('.shopping-list-reset-route');
      const either = entry({ ...amulet, sources: [from('Abbot'), from('The Snitch')] });
      const ringWanted = { [snitchRing.key]: 0 } as const;
      const showPlanned = (routeSettled?: ReadonlySet<string>) => {
        views.next(buildShoppingListView([either, snitchRing], ringWanted, trove, { filter: 'all', routeSettled }));
        fixture.detectChanges();
      };

      showPlanned();
      expect(resetRoute()).toBeNull();
      // The ring wanted again, after the route was planned without it: the amulet could come from The Snitch with it.
      showPlanned(new Set([snitchRing.identity]));
      expect(resetRoute()?.textContent?.trim()).toBe('Reset route');
    });

    it('says which quests the pack filter hides', () => {
      showWith({ hiddenPacks: new Set(['Raid Pack']) });
      open();

      expect(choices()[0].slice(0, 3)).toEqual(['The Raid', 'Raid Pack · hidden by your pack filter', false]);
      expect(el().querySelector('.shopping-source-hidden .shopping-source-quest')?.textContent?.trim()).toBe('The Raid');
    });

    it('tracks ticks, the filter, picks and route resets', () => {
      const track = vi.spyOn(TestBed.inject(AnalyticsService), 'track').mockReturnValue(undefined);
      showWith({ picks: { [amulet.identity]: ['Vendor'] } });

      (rowByName('Amulet').querySelector('.shopping-check') as HTMLButtonElement).click();
      el().querySelectorAll<HTMLButtonElement>('.shopping-list-choice-option')[1].click();
      open();
      check('Vendor');
      check('The Snitch');
      (el().querySelector('.shopping-sources-reset') as HTMLButtonElement).click();
      (el().querySelector('.shopping-list-reset-route') as HTMLButtonElement).click();

      expect(track.mock.calls).toEqual([
        ['toggle_shopping_item', { item_kind: 'gear', checked: true }],
        ['set_shopping_filter', { filter: 'needed' }],
        ['pick_shopping_source', { action: 'blocked', item_kind: 'gear' }],
        ['pick_shopping_source', { action: 'add', item_kind: 'gear', quest_count: 2 }],
        ['pick_shopping_source', { action: 'reset', item_kind: 'gear' }],
        ['reset_shopping_route', { has_picks: true }],
      ]);
    });
  });

  it('tracks opening the list once, with which button opened it and how big the list is', () => {
    TestBed.inject(ShoppingListViewService).openedFrom = 'menu';
    const track = vi.spyOn(TestBed.inject(AnalyticsService), 'track').mockReturnValue(undefined);
    const opened = TestBed.createComponent(ShoppingListComponent);
    opened.detectChanges();
    show({ [sword.key]: 1 });
    opened.detectChanges();

    // The trove's ring covers one of the two ring slots.
    expect(track.mock.calls).toEqual([
      ['open_shopping_list', { entry_point: 'menu', item_count: 5, acquired_count: 1, has_picks: false }],
    ]);
  });

  it('links each quest card to the wiki, in a new tab', () => {
    const anywhere = entry({ key: 'g|Neck|Amulet', identity: 'gear|Amulet', label: 'Amulet',
      sources: [from('The Snitch'), from('Vendor')] });
    const link = (node: Element | null | undefined) => [node?.tagName, node?.getAttribute('href'), node?.getAttribute('target')];

    show({}, 'all', [sword, augment, anywhere]);
    const titles = Array.from(el().querySelectorAll('.shopping-group-name'), title => link(title));
    expect(titles).toEqual([['A', 'wiki/The Raid', '_blank'], ['A', 'wiki/The Snitch', '_blank'], ['SPAN', null, null]]);
  });

  it('switches the filter through the service', () => {
    const options = () => Array.from(el().querySelectorAll<HTMLButtonElement>('.shopping-list-choice-option'));

    // Always by quest: no choice of grouping.
    expect(options().map(button => button.textContent?.trim())).toEqual(['All', 'Still needed']);
    expect(options()[0].getAttribute('aria-pressed')).toBe('true');
    options()[1].click();

    expect(service.setFilter).toHaveBeenCalledWith('needed');
  });

  it('says when there is nothing to get, and when everything is ticked off', () => {
    show({}, 'all', []);
    expect(el().querySelector('.shopping-list-empty')?.textContent).toContain('Nothing to get yet');

    show(Object.fromEntries(entries.map(candidate => [candidate.key, 1 as const])), 'needed');
    expect(el().querySelector('.shopping-list-empty')?.textContent).toContain('Everything is ticked off');
  });

  describe('arranging the route', () => {
    const arrangeButton = () => el().querySelector<HTMLButtonElement>('.shopping-list-arrange');
    const outline = () => el().querySelector('app-shopping-list-arrange');
    const startArranging = async () => {
      arrangeButton()!.click();
      fixture.detectChanges();
      // The outline is loaded on first use.
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(outline()).toBeTruthy();
      });
    };

    it('shows the route as an outline in place of the cards, until Done', async () => {
      await startArranging();

      expect(el().querySelector('.shopping-section')).toBeNull();
      expect(Array.from(el().querySelectorAll('.shopping-arrange-pack-row .shopping-arrange-name'), name => name.textContent?.trim()))
        .toEqual(['Raid Pack', 'Other sources']);
      expect(el().querySelector('.shopping-list-choice')).toBeNull();
      expect(arrangeButton()).toBeNull();

      (el().querySelector('.shopping-list-arrange-done') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(outline()).toBeNull();
      expect(el().querySelector('.shopping-section')).toBeTruthy();
    });

    it('offers the default order back once arranged', async () => {
      await startArranging();
      expect(el().querySelector('.shopping-list-reset-route')).toBeNull();

      views.next({ ...views.value, arranged: true });
      fixture.detectChanges();
      (el().querySelector('.shopping-list-reset-route') as HTMLButtonElement).click();

      expect(service.resetOrder).toHaveBeenCalled();
    });

    it('is not offered with nothing listed', () => {
      show({}, 'all', []);

      expect(arrangeButton()).toBeNull();
    });
  });

  describe('sharing the list', () => {
    const shareButton = () => el().querySelector('.shopping-list-share') as HTMLButtonElement;
    const menu = () => el().querySelector('app-shopping-list-share-menu');
    // An unsaved build's menu has only this; the menu's own spec covers the links.
    const copyListItem = () => Array.from(el().querySelectorAll<HTMLButtonElement>('.share-menu-item'))
      .find(item => ['Copy list', 'Copied!'].includes(item.textContent?.trim() ?? ''))!;
    const openMenu = () => {
      shareButton().click();
      fixture.detectChanges();
    };

    it('opens a Share menu, closed again by clicking away or Escape', () => {
      openMenu();
      expect(menu()).toBeTruthy();
      expect(shareButton().getAttribute('aria-expanded')).toBe('true');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();
      expect(menu()).toBeNull();

      openMenu();
      (el().querySelector('.share-menu-backdrop') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(menu()).toBeNull();
    });

    it('copies the list as text from the menu, within the click, and says so', () => {
      const copy = vi.spyOn(Clipboard, 'copy').mockReturnValue(true);
      const track = vi.spyOn(TestBed.inject(AnalyticsService), 'track').mockReturnValue(undefined);
      openMenu();

      copyListItem().click();
      fixture.detectChanges();

      expect(copy).toHaveBeenCalledWith('Still needed for my build (5):');
      expect(copyListItem().textContent?.trim()).toBe('Copied!');
      // Five things, less the ring the trove covers.
      expect(track).toHaveBeenCalledWith('copy_shopping_list', { copy_kind: 'text', needed_count: 4 });
    });

    it('says when the clipboard refused', () => {
      vi.spyOn(Clipboard, 'copy').mockReturnValue(false);
      openMenu();

      copyListItem().click();
      fixture.detectChanges();

      expect(el().querySelector('.share-menu-error')?.textContent).toContain('Could not copy');
      expect(copyListItem().textContent?.trim()).toBe('Copy list');
    });

    it('is not offered with nothing to get', () => {
      show({}, 'all', []);

      expect(shareButton()).toBeNull();
    });
  });

  describe('where ticks are kept', () => {
    const sync = () => el().querySelector('.shopping-list-sync');

    it('says whether they\'re saved with the build or only on this device', () => {
      const said = (['saving', 'synced', 'offline', 'local'] as const).map(state => {
        syncStates.next(state);
        fixture.detectChanges();
        return [sync()?.textContent?.trim(), sync()?.classList.contains('local')];
      });

      expect(said).toEqual([['Saving…', false], ['Saved', false], ['Offline', true], ['Saved on this device', true]]);
    });

    it('says nothing when only this device could keep them anyway', () => {
      syncStates.next('off');
      fixture.detectChanges();

      expect(sync()).toBeNull();
    });
  });

  it('goes back to the planner', () => {
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);

    (el().querySelector('.shopping-list-back') as HTMLButtonElement).click();

    expect(closed).toHaveBeenCalled();
  });

  describe('on a friend\'s still-needed page', () => {
    // Everything got but the augment and one ring: what the friend service would make of an owner's list saying so.
    const stillNeeded = () => buildShoppingListView(entries, { [sword.key]: 1, [step.key]: 1, [ring1.key]: 1 }, null,
      { filter: 'needed' });
    const showFriend = (list: Partial<FriendShoppingList>) => {
      fixture.componentRef.setInput('friend', { view: stillNeeded(), needed: 2, notShared: false, connection: 'live', ...list });
      fixture.detectChanges();
    };

    beforeEach(() => {
      fixture.destroy();
      fixture = TestBed.createComponent(ShoppingListComponent);
      fixture.componentRef.setInput('friendBuild', { name: 'Their Build', plannerPath: '/build/s1/their-build' });
      fixture.detectChanges();
    });
    const text = () => el().textContent!.replace(/\s+/g, ' ');
    const liveStatus = () => el().querySelector<HTMLElement>('.shopping-list-live');

    it('shows only what\'s still needed and where to get it, with nothing to tick, pick or copy', () => {
      showFriend({});

      expect(el().querySelector('.shopping-list-title')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Still needed for Their Build');
      expect(el().querySelector('.shopping-list-progress-text')?.textContent?.trim()).toBe('2 things still needed');
      expect(Array.from(el().querySelectorAll('.shopping-row:not(.acquired) .shopping-row-name'), name => name.textContent))
        .toEqual(['Ring', 'Ruby']);
      syncStates.next('synced');
      fixture.detectChanges();
      for (const selector of ['.shopping-list-back', '.shopping-check', '.shopping-list-choice', '.shopping-list-share', '.shopping-list-sync',
        '.shopping-list-progress', '.shopping-list-reset-route', '.shopping-row-sources-toggle', '.owned-badge']) {
        expect(el().querySelector(selector), selector).toBeNull();
      }
    });

    it('counts what\'s still needed in each pack, not what\'s got', () => {
      showFriend({});

      // One ring of two, and the ruby; the sword's pack has nothing left, so isn't listed.
      expect(Array.from(el().querySelectorAll('.shopping-section-count'), count => count.textContent)).toEqual(['2']);
    });

    it('says where else something comes from as plain text', () => {
      const both = entry({ ...augment, sources: [from('Quest A'), from('Quest B')] });
      showFriend({ view: buildShoppingListView([both], {}, null, { filter: 'needed' }), needed: 1 });

      const listedUnder = el().querySelector('.shopping-group-name')?.textContent?.trim();
      const other = listedUnder === 'Quest A' ? 'Quest B' : 'Quest A';
      expect(el().querySelector('.shopping-row-also-from')?.textContent?.trim()).toBe(`also from ${other}`);
      expect(el().querySelector('button.shopping-row-also-from')).toBeNull();
    });

    it('opens the build in the planner only when asked, in a new tab, leaving the list where it was', () => {
      showFriend({});

      const open = el().querySelector<HTMLAnchorElement>('a.shopping-list-open-build');
      expect(open?.textContent?.trim()).toBe('Open in planner');
      expect(open?.getAttribute('href')).toBe('/build/s1/their-build');
      expect(open?.getAttribute('target')).toBe('_blank');
    });

    it('says whether the owner\'s changes are arriving as they\'re made, with nothing to refresh', () => {
      showFriend({});
      expect(liveStatus()?.textContent?.trim()).toBe('Live');
      expect(liveStatus()?.classList).toContain('live');
      expect(el().querySelector('.shopping-list-refresh')).toBeNull();

      showFriend({ connection: 'reconnecting' });
      expect(liveStatus()?.textContent?.trim()).toBe('Reconnecting…');
      expect(liveStatus()?.classList).not.toContain('live');
    });

    it('says when nothing has been shared, and when the connection is lost, keeping the list', () => {
      showFriend({ notShared: true });
      expect(text()).toContain('Nothing ticked off has been shared for this build yet');

      showFriend({ connection: 'offline' });
      expect(liveStatus()?.textContent?.trim()).toBe('Offline');
      expect(el().querySelector('.shopping-list-note[role="alert"]')?.textContent)
        .toContain('Lost the connection, so this is the list as it last arrived.');
      expect(Array.from(el().querySelectorAll('.shopping-row-name'), name => name.textContent)).toContain('Ruby');
    });

    it('says when there\'s nothing left to get', () => {
      showFriend({ view: buildShoppingListView(entries, Object.fromEntries(entries.map(e => [e.key, 1 as const])), null,
        { filter: 'needed' }), needed: 0 });

      expect(text()).toContain('Nothing left to get');
      expect(el().querySelector('.shopping-list-progress-text')?.textContent?.trim()).toBe('0 things still needed');
    });

    it('tracks opening it as a friend\'s link', () => {
      const track = vi.spyOn(TestBed.inject(AnalyticsService), 'track').mockReturnValue(undefined);

      showFriend({});

      expect(track).toHaveBeenCalledWith('open_shopping_list',
        { entry_point: 'friend_link', item_count: 5, acquired_count: 3, has_picks: false });
    });
  });

  describe('starting a group run', () => {
    const groupButton = () => el().querySelector<HTMLButtonElement>('.shopping-list-start-group');
    const own = (state: Partial<CurrentBuildState>) => {
      const currentBuild = TestBed.inject(CurrentBuildService);
      Object.defineProperty(currentBuild, 'value', {
        configurable: true, get: () => ({ savedBuildId: null, shortId: null, name: null, isDirty: false, ownership: 'other', ...state })
      });
      fixture.destroy();
      fixture = TestBed.createComponent(ShoppingListComponent);
      fixture.detectChanges();
    };

    it('is offered for a saved build of yours, not for one you haven\'t saved or that isn\'t yours', () => {
      own({});
      expect(groupButton()).toBeNull();
      own({ savedBuildId: 'b1', ownership: 'other' });
      expect(groupButton()).toBeNull();

      own({ savedBuildId: 'b1', shortId: 's1', name: 'A Very Long Build Name Indeed', ownership: 'owned' });
      expect(groupButton()?.textContent?.trim()).toBe('Group run');
    });

    it('starts one with this build in it, as a character named after it, and goes to its page', async () => {
      own({ savedBuildId: 'b1', shortId: 's1', name: 'A Very Long Build Name Indeed', ownership: 'owned' });
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

      groupButton()!.click();
      await fixture.whenStable();

      expect(createGroup).toHaveBeenCalledWith('', [{ buildId: 'b1', characterName: 'A Very Long Build Na' }]);
      expect(navigate).toHaveBeenCalledWith('/group/grp1#t=tok');
    });
  });

  describe('on a group run\'s page', () => {
    const kira: GroupMemberEntries = { buildId: 'b-kira', characterName: 'Kira', entries: [ring1, ring2, sword], needed: null };
    const vex: GroupMemberEntries = { buildId: 'b-vex', characterName: 'Vex', entries: [ring1], needed: [] };
    let groupRun: { toggleChip: ReturnType<typeof vi.fn>; toggleRow: ReturnType<typeof vi.fn>; setFilter: ReturnType<typeof vi.fn>;
      show: ReturnType<typeof vi.fn>; pickSources: ReturnType<typeof vi.fn>; arrangePacks: ReturnType<typeof vi.fn> };
    const text = () => el().textContent!.replace(/\s+/g, ' ');

    const showGroup = (run: Partial<GroupRunView> = {}) => {
      const view = buildGroupListView([kira, vex], { filter: 'all', picks: {}, order: null });
      fixture.componentRef.setInput('group', {
        name: 'Reaper night', view, connection: 'live', gone: false, isHost: false, yours: new Set(['b-kira']), showing: 'everyone',
        unsaved: [],
        characters: [
          { buildId: 'b-kira', characterName: 'Kira', accent: 0, mine: true, needed: 3, total: 3, buildName: 'Tank', unreadable: false },
          { buildId: 'b-vex', characterName: 'Vex', accent: 1, mine: false, needed: 0, total: 1, buildName: 'Archer', unreadable: false }
        ],
        ...run
      } satisfies GroupRunView);
      fixture.detectChanges();
    };

    beforeEach(() => {
      groupRun = { toggleChip: vi.fn(), toggleRow: vi.fn(), setFilter: vi.fn(), show: vi.fn(), pickSources: vi.fn(), arrangePacks: vi.fn() };
      fixture.destroy();
      fixture = TestBed.createComponent(ShoppingListComponent);
      fixture.componentRef.setInput('groupRun', groupRun as unknown as GroupRunService);
      fixture.detectChanges();
    });

    const chips = (name: string) => Array.from(rowByName(name).querySelectorAll<HTMLElement>('.shopping-member-chip'));

    it('names the group, and says how much everyone still needs, live', () => {
      showGroup();

      expect(el().querySelector('.shopping-list-title')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Reaper night group run');
      // Kira's two rings and sword; Vex's ring is got.
      expect(el().querySelector('.shopping-list-progress-text')?.textContent?.trim()).toBe('3 things still needed');
      expect(el().querySelector('.shopping-list-live')?.textContent?.trim()).toBe('Live');
      expect(el().querySelector('.shopping-list-back')).toBeNull();
    });

    it('makes each character\'s chip on a row their box: yours to tick, friends\' to read', () => {
      showGroup();

      const [kiraChip, vexChip] = chips('Ring');
      expect(kiraChip.tagName).toBe('BUTTON');
      expect(kiraChip.getAttribute('role')).toBe('checkbox');
      expect(kiraChip.getAttribute('aria-checked')).toBe('false');
      expect(kiraChip.querySelector('.shopping-member-count')?.textContent).toBe('×2');
      expect(vexChip.tagName).toBe('SPAN');
      expect(vexChip.getAttribute('role')).toBeNull();
      expect(vexChip.querySelector('.shopping-member-check')?.classList).toContain('fa-square-check');
      expect(vexChip.getAttribute('aria-label')).toBe('Ring for Vex: got');

      kiraChip.click();

      expect(groupRun.toggleChip).toHaveBeenCalledWith(expect.objectContaining({ id: expect.stringContaining('gear|Ring') }), 'b-kira');
    });

    it('shows a character part way through their copies as mixed', () => {
      const partWay: GroupMemberEntries = { ...kira, needed: [ring2.key, sword.key] };
      showGroup({ view: buildGroupListView([partWay, vex], { filter: 'all', picks: {}, order: null }) });

      const kiraChip = chips('Ring')[0];
      expect(kiraChip.getAttribute('aria-checked')).toBe('mixed');
      expect(kiraChip.querySelector('.shopping-member-count')?.textContent).toBe('1/2');
    });

    it('gives rows no box of their own once there are several characters', () => {
      showGroup({ yours: new Set(['b-kira', 'b-vex']) });

      expect(el().querySelector('.shopping-check')).toBeNull();
    });

    it('with one character, gives rows a plain box ticking all of theirs, and no chips', () => {
      showGroup({
        view: buildGroupListView([kira], { filter: 'all', picks: {}, order: null }),
        characters: [
          { buildId: 'b-kira', characterName: 'Kira', accent: 0, mine: true, needed: 3, total: 3, buildName: 'Tank', unreadable: false }
        ]
      });

      expect(el().querySelector('.shopping-member-chip:not(.shopping-character-filter)')).toBeNull();
      const box = rowByName('Ring').querySelector<HTMLButtonElement>('.shopping-check')!;
      expect(box.getAttribute('aria-checked')).toBe('false');
      expect(rowByName('Ring').querySelector('.shopping-row-quantity')?.textContent?.trim()).toBe('0/2');

      box.click();

      expect(groupRun.toggleRow).toHaveBeenCalled();
    });

    it('with one character who isn\'t yours, gives rows no box', () => {
      showGroup({
        view: buildGroupListView([vex], { filter: 'all', picks: {}, order: null }),
        characters: [
          { buildId: 'b-vex', characterName: 'Vex', accent: 1, mine: false, needed: 0, total: 1, buildName: 'Archer', unreadable: false }
        ]
      });

      expect(el().querySelector('.shopping-check')).toBeNull();
    });

    it('shows everyone\'s, yours, or one character\'s rows', () => {
      showGroup();

      const filters = Array.from(el().querySelectorAll<HTMLButtonElement>('.shopping-character-filter'));
      expect(filters.map(button => button.getAttribute('aria-label') ?? button.textContent?.trim()))
        .toEqual(['Everyone', 'Mine', 'Kira: 3 still needed', 'Vex: 0 still needed']);
      filters[3].click();

      expect(groupRun.show).toHaveBeenCalledWith('b-vex');
    });

    it('lets only the host arrange the route', () => {
      showGroup();
      expect(el().querySelector('.shopping-list-arrange')).toBeNull();

      showGroup({ isHost: true });
      expect(el().querySelector('.shopping-list-arrange')).toBeTruthy();
    });

    it('says whose ticks couldn\'t be saved, and when the connection is lost', () => {
      showGroup({ unsaved: ['Kira'], connection: 'offline' });

      expect(text()).toContain('Couldn\'t save the ticks for Kira.');
      expect(text()).toContain('Lost the connection');
    });

    it('says when there are no builds in it yet', () => {
      showGroup({ view: buildGroupListView([], { filter: 'all', picks: {}, order: null }), characters: [] });

      expect(text()).toContain('No builds in this group yet.');
    });
  });
});
