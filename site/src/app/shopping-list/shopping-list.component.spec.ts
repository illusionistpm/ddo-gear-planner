import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';

import { ShoppingListComponent } from './shopping-list.component';
import { ShoppingListService } from '../planner/shopping-list/shopping-list.service';
import type {
  ShoppingEntry, ShoppingListView, ShoppingProgress, ShoppingSource
} from '../planner/shopping-list/shopping-list-types';
import { buildShoppingListView } from '../planner/shopping-list/shopping-list-view-model';
import { TapTooltipComponent } from '../tap-tooltip/tap-tooltip.component';
import { UserItemLocationTooltipPipe } from '../shared/user-item-location-tooltip.pipe';
import { Clipboard } from '../shared/clipboard';
import { AnalyticsService } from '../shared/analytics.service';

function from(quest: string, pack: string | null = null, raid = false): ShoppingSource {
  return { quest, pack, raid };
}

function entry(init: Partial<ShoppingEntry> & { key: string }): ShoppingEntry {
  return {
    kind: 'gear', slot: 'Ring1', identity: init.key, label: init.key, system: null, itemName: init.key, ml: 0,
    sources: [], sourceInherited: false, raid: false, rare: false, artifact: false,
    wikiUrl: null, troveName: null, parentKey: null, details: [],
    ...init,
  };
}

const sword = entry({ key: 'g|Weapon|Sword', slot: 'Weapon', identity: 'gear|Sword', label: 'Sword', ml: 32,
  sources: [from('The Raid', 'Raid Pack', true)], raid: true, wikiUrl: 'http://ddowiki.com/page/Item:Sword',
  details: ['Strength +5 Enhancement'] });
const step = entry({ key: 's|Weapon|Sword|LP#0|Set', kind: 'step', slot: 'Weapon', identity: 'step|lp', label: 'Archons',
  system: 'Lost Purpose', sources: sword.sources, sourceInherited: true, parentKey: sword.key });
const ring1 = entry({ key: 'g|Ring1|Ring', identity: 'gear|Ring', label: 'Ring', sources: [from('The Snitch')],
  troveName: 'Ring', rare: true });
const ring2 = entry({ key: 'g|Ring2|Ring', slot: 'Ring2', identity: 'gear|Ring', label: 'Ring',
  sources: [from('The Snitch')], troveName: 'Ring', rare: true });
const augment = entry({ key: 'a|Weapon|Red#0|Ruby', kind: 'augment', slot: 'Weapon', identity: 'augment|Ruby',
  label: 'Ruby', parentKey: sword.key });
const entries = [sword, step, augment, ring1, ring2];

const trove = {
  locationsFor: (name: string) => name === 'Ring' ? [{ character: 'Khalarim', location: 'Inventory', tab: '6' }] : undefined,
};

describe('ShoppingListComponent', () => {
  let fixture: ComponentFixture<ShoppingListComponent>;
  let views: BehaviorSubject<ShoppingListView>;
  let service: { view$: BehaviorSubject<ShoppingListView>; toggle: ReturnType<typeof vi.fn>;
    setGroupMode: ReturnType<typeof vi.fn>; setFilter: ReturnType<typeof vi.fn>; stillNeededText: () => string };

  const show = (progress: ShoppingProgress, groupMode: 'slot' | 'source' = 'slot', filter: 'all' | 'needed' = 'all',
    list = entries) => {
    views.next(buildShoppingListView(list, progress, trove, { groupMode, filter }));
    fixture.detectChanges();
  };
  const el = () => fixture.nativeElement as HTMLElement;
  const rowByName = (name: string) => Array.from(el().querySelectorAll<HTMLElement>('.shopping-row'))
    .find(row => row.querySelector('.shopping-row-name')?.textContent?.trim() === name)!;
  const groupTitles = () => Array.from(el().querySelectorAll('.shopping-group-name')).map(title => title.textContent?.trim());

  beforeEach(async () => {
    views = new BehaviorSubject(buildShoppingListView(entries, {}, trove, { groupMode: 'slot', filter: 'all' }));
    service = { view$: views, toggle: vi.fn(), setGroupMode: vi.fn(), setFilter: vi.fn(),
      stillNeededText: () => 'Still needed for my build (5):' };
    await TestBed.configureTestingModule({
      declarations: [ShoppingListComponent, TapTooltipComponent, UserItemLocationTooltipPipe],
      providers: [{ provide: ShoppingListService, useValue: service }]
    }).compileComponents();
    fixture = TestBed.createComponent(ShoppingListComponent);
    fixture.detectChanges();
  });

  it('lists each slot\'s item with its source, badges and crafting beneath', () => {
    expect(groupTitles()).toEqual(['Weapon', 'Ring 1', 'Ring 2']);

    const swordRow = rowByName('Sword');
    expect(swordRow.querySelector('a.shopping-row-name')?.getAttribute('href')).toBe('http://ddowiki.com/page/Item:Sword');
    expect(swordRow.querySelector('.shopping-row-meta')?.textContent).toContain('ML 32');
    expect(swordRow.querySelector('.shopping-row-source')?.textContent?.trim()).toBe('The Raid');
    expect(swordRow.querySelector('.raid-loot-badge')).toBeTruthy();
    expect(swordRow.querySelector('.shopping-row-details')?.textContent?.trim()).toBe('Roll: Strength +5 Enhancement');

    // The step lives where the item does, so it doesn't repeat the source.
    const nested = swordRow.parentElement!.querySelectorAll('.shopping-rows-nested .shopping-row');
    expect(Array.from(nested).map(row => row.querySelector('.shopping-row-label')?.textContent?.replace(/\s+/g, ' ').trim()))
      .toEqual(['Lost Purpose: Archons', 'Ruby']);
    expect(rowByName('Archons').querySelector('.shopping-row-source')).toBeNull();
    expect(rowByName('Ruby').querySelector('.shopping-row-source')?.textContent?.trim()).toBe('Source unknown');
    expect(rowByName('Ruby').querySelector('.shopping-row-meta')?.textContent).toContain('Augment');
  });

  it('says how many the build needs, and where the trove has it', () => {
    const ringRow = el().querySelectorAll('.shopping-group')[1].querySelector('.shopping-row') as HTMLElement;

    expect(ringRow.querySelector('.shopping-row-quantity')?.textContent?.trim()).toBe('×2');
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
    // The trove's one ring covers one of the two ring slots.
    show({ [sword.key]: 1 }, 'source');
    const box = (name: string) => rowByName(name).querySelector('.shopping-check') as HTMLButtonElement;

    expect(box('Sword').getAttribute('aria-checked')).toBe('true');
    expect(rowByName('Sword').classList).toContain('acquired');
    expect(box('Ring').getAttribute('aria-checked')).toBe('mixed');
    expect(rowByName('Ring').querySelector('.shopping-row-quantity')?.textContent?.trim()).toBe('1/2');
    expect(box('Ruby').getAttribute('aria-checked')).toBe('false');

    box('Ruby').click();
    expect(service.toggle).toHaveBeenCalledWith(expect.objectContaining({ entryKeys: [augment.key] }));
  });

  it('groups by quest without repeating the quest on each row', () => {
    show({}, 'source');

    expect(groupTitles()).toEqual(['The Raid', 'The Snitch', 'Unknown source']);
    expect(rowByName('Sword').querySelector('.shopping-row-source')).toBeNull();
    expect(rowByName('Ruby').querySelector('.shopping-row-meta')?.textContent).toContain('for Sword (Weapon)');
  });

  it('names an item\'s first source and offers the rest, or in quest view where else it comes from', () => {
    const anywhere = entry({ key: 'g|Neck|Amulet', slot: 'Neck', identity: 'gear|Amulet', label: 'Amulet',
      sources: [from('The Snitch'), from('The Raid'), from('Vendor')] });
    show({}, 'slot', 'all', [anywhere]);

    const meta = () => rowByName('Amulet').querySelector('.shopping-row-meta')!;
    expect(meta().querySelector('.shopping-row-source')?.textContent?.trim()).toBe('The Snitch');
    expect(meta().querySelector('.shopping-row-more')?.textContent?.trim()).toBe('+2 more');
    expect(meta().querySelector('.tap-tooltip-trigger')?.getAttribute('title')).toBe('Also from:\nThe Raid\nVendor');

    show({}, 'source', 'all', [anywhere, entry({ ...ring1, sources: [from('The Snitch'), from('Vendor')] })]);
    const snitch = Array.from(el().querySelectorAll('.shopping-group'))
      .find(group => group.querySelector('.shopping-group-name')?.textContent?.trim() === 'The Snitch')!;
    const alsoFrom = (name: string) => Array.from(snitch.querySelectorAll<HTMLElement>('.shopping-row'))
      .find(row => row.querySelector('.shopping-row-name')?.textContent?.trim() === name)!
      .querySelector('.shopping-row-also, .shopping-row-more')?.textContent?.trim();
    expect(alsoFrom('Amulet')).toBe('also from 2 other quests');
    expect(alsoFrom('Ring')).toBe('also from Vendor');
  });

  it('switches grouping and filter through the service', () => {
    const option = (label: string) => Array.from(el().querySelectorAll<HTMLButtonElement>('.shopping-list-choice-option'))
      .find(button => button.textContent?.trim() === label)!;

    expect(option('Slot').getAttribute('aria-pressed')).toBe('true');
    option('Quest').click();
    option('Still needed').click();

    expect(service.setGroupMode).toHaveBeenCalledWith('source');
    expect(service.setFilter).toHaveBeenCalledWith('needed');
  });

  it('says when there is nothing to get, and when everything is ticked off', () => {
    show({}, 'slot', 'all', []);
    expect(el().querySelector('.shopping-list-empty')?.textContent).toContain('Nothing to get yet');

    show(Object.fromEntries(entries.map(candidate => [candidate.key, 1 as const])), 'slot', 'needed');
    expect(el().querySelector('.shopping-list-empty')?.textContent).toContain('Everything is ticked off');
  });

  describe('copying the still-needed list', () => {
    const copyButton = () => el().querySelector('.shopping-list-copy') as HTMLButtonElement;

    it('copies the text within the click, and says so', () => {
      const copy = vi.spyOn(Clipboard, 'copy').mockReturnValue(true);
      const track = vi.spyOn(TestBed.inject(AnalyticsService), 'track').mockReturnValue(undefined);

      copyButton().click();
      fixture.detectChanges();

      expect(copy).toHaveBeenCalledWith('Still needed for my build (5):');
      expect(copyButton().textContent?.trim()).toBe('Copied!');
      // Five things, less the ring the trove covers.
      expect(track).toHaveBeenCalledWith('copy_shopping_list', { copy_kind: 'text', needed_count: 4 });
    });

    it('says when the clipboard refused', () => {
      vi.spyOn(Clipboard, 'copy').mockReturnValue(false);

      copyButton().click();
      fixture.detectChanges();

      expect(el().querySelector('.shopping-list-copy-error')?.textContent).toContain('Could not copy');
      expect(copyButton().textContent?.trim()).toBe('Copy list');
    });

    it('is not offered with nothing to get', () => {
      show({}, 'slot', 'all', []);

      expect(copyButton()).toBeNull();
    });
  });

  it('goes back to the planner', () => {
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);

    (el().querySelector('.shopping-list-back') as HTMLButtonElement).click();

    expect(closed).toHaveBeenCalled();
  });
});
