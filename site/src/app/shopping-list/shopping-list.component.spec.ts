import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';

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

function from(quest: string, pack: string | null = null, raid = false): ShoppingSource {
  return { quest, pack, raid, wikiUrl: `wiki/${quest}` };
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
    setFilter: ReturnType<typeof vi.fn>; pickSources: ReturnType<typeof vi.fn>; stillNeededText: () => string };

  const show = (progress: ShoppingProgress, filter: 'all' | 'needed' = 'all', list = entries) => {
    views.next(buildShoppingListView(list, progress, trove, { filter }));
    fixture.detectChanges();
  };
  const el = () => fixture.nativeElement as HTMLElement;
  const rowByName = (name: string) => Array.from(el().querySelectorAll<HTMLElement>('.shopping-row'))
    .find(row => row.querySelector('.shopping-row-name')?.textContent?.trim() === name)!;

  beforeEach(async () => {
    views = new BehaviorSubject(buildShoppingListView(entries, {}, trove, { filter: 'all' }));
    service = { view$: views, toggle: vi.fn(), setFilter: vi.fn(), pickSources: vi.fn(),
      stillNeededText: () => 'Still needed for my build (5):' };
    await TestBed.configureTestingModule({
      declarations: [ShoppingListComponent, TapTooltipComponent, UserItemLocationTooltipPipe],
      providers: [{ provide: ShoppingListService, useValue: service }]
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

  it('says where else something comes from', () => {
    const anywhere = entry({ key: 'g|Neck|Amulet', slot: 'Neck', identity: 'gear|Amulet', label: 'Amulet',
      sources: [from('The Snitch'), from('The Raid'), from('Vendor')] });
    show({}, 'all', [anywhere, entry({ ...ring1, sources: [from('The Snitch'), from('Vendor')] })]);
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
    const amulet = entry({ key: 'g|Neck|Amulet', slot: 'Neck', identity: 'gear|Amulet', label: 'Amulet',
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
      (choice.querySelector('input') as HTMLInputElement).disabled,
    ]);
    const check = (quest: string) => (Array.from(el().querySelectorAll('.shopping-source-choice'))
      .find(choice => choice.querySelector('.shopping-source-quest')?.textContent?.trim() === quest)!
      .querySelector('input') as HTMLInputElement).click();

    it('opens under the row with every quest it comes from, in heading order, and what else is there', () => {
      showWith();
      expect(el().querySelector('.shopping-sources')).toBeNull();

      open();
      expect(rowByName('Amulet').querySelector('.shopping-row-sources-toggle')?.getAttribute('aria-expanded')).toBe('true');
      // The list sent it to the quest in a pack; that one can't be unticked, as it's the only one.
      expect(choices()).toEqual([
        ['The Raid', 'Raid Pack · nothing else there', true, true],
        ['The Snitch', 'Other sources · 1 other thing there', false, false],
        ['Vendor', 'Other sources · nothing else there', false, false],
      ]);
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

    it('offers to let the list choose again once the user has picked', () => {
      showWith({ picks: { [amulet.identity]: ['Vendor', 'The Snitch'] } });
      open();

      expect(choices().map(([quest, , checked, disabled]) => [quest, checked, disabled]))
        .toEqual([['The Raid', false, false], ['The Snitch', true, false], ['Vendor', true, false]]);
      check('Vendor');
      expect(service.pickSources).toHaveBeenCalledWith(expect.anything(), ['The Snitch']);

      (el().querySelector('.shopping-sources-reset') as HTMLButtonElement).click();
      expect(service.pickSources).toHaveBeenCalledWith(expect.anything(), null);
    });

    it('says which quests the pack filter hides', () => {
      showWith({ hiddenPacks: new Set(['Raid Pack']) });
      open();

      expect(choices()[0].slice(0, 3)).toEqual(['The Raid', 'Raid Pack · hidden by your pack filter', false]);
      expect(el().querySelector('.shopping-source-hidden .shopping-source-quest')?.textContent?.trim()).toBe('The Raid');
    });
  });

  it('links each quest card to the wiki, in a new tab', () => {
    const anywhere = entry({ key: 'g|Neck|Amulet', slot: 'Neck', identity: 'gear|Amulet', label: 'Amulet',
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
      show({}, 'all', []);

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
