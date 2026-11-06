import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { CurrentBuildService } from '../../build/current-build.service';
import { Craftable } from '../../gear/craftable';
import { CraftableOption } from '../../gear/craftable-option';
import { Item } from '../../gear/item';
import { QuestService } from '../../gear/quest.service';
import { EquippedService } from '../equipped.service';
import { UserGearService } from '../user-gear.service';
import { ShoppingListService } from './shopping-list.service';
import { SHOPPING_PROGRESS_STORAGE_KEY } from './shopping-progress-storage';
import { ShoppingProgressStore } from './shopping-progress-store';

function ring(augment: string, diamondFrom = ['Augment Vendor']): Item {
  const slot = new Craftable('Colorless Augment Slot', [
    new CraftableOption({ name: 'Diamond of Tests', quests: diamondFrom }),
    new CraftableOption({ name: 'Topaz of Tests' }),
  ]);
  slot.selectByParamDescription(augment);
  return new Item({ name: 'Ring of Tests', slot: 'Ring1', type: 'Jewelry', ml: 30, quests: ['The Snitch'], crafting: [slot] });
}

describe('ShoppingListService', () => {
  let service: ShoppingListService;
  let equipped: EquippedService;

  const view = () => firstValueFrom(service.view$);
  const groups = async () => (await view()).sections.flatMap(section => section.groups);
  const rowsOf = async () => (await groups()).flatMap(group => group.rows);
  const labels = async () => (await rowsOf())
    .flatMap(row => [`${row.entry.label}:${row.state}`, ...row.children.map(child => `${child.entry.label}:${child.state}`)]);

  beforeEach(async () => {
    localStorage.removeItem(SHOPPING_PROGRESS_STORAGE_KEY);
    TestBed.configureTestingModule({});
    service = TestBed.inject(ShoppingListService);
    equipped = TestBed.inject(EquippedService);
    equipped.set(ring('Diamond of Tests'));
    await TestBed.inject(ApplicationRef).whenStable();
  });

  afterEach(() => {
    TestBed.inject(UserGearService).clear();
    localStorage.removeItem(SHOPPING_PROGRESS_STORAGE_KEY);
  });

  it('lists the equipped gear and what goes into it, following crafting changes', async () => {
    expect(await labels()).toEqual(['Ring of Tests:unchecked', 'Diamond of Tests:unchecked']);

    equipped.set(ring('Topaz of Tests'));
    expect(await labels()).toEqual(['Ring of Tests:unchecked', 'Topaz of Tests:unchecked']);
  });

  it('ticks a row off without touching the build or its URL', async () => {
    const currentBuild = TestBed.inject(CurrentBuildService);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate');
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl');
    const dirtyBefore = currentBuild.value.isDirty;

    service.toggle((await rowsOf())[0]);
    await TestBed.inject(ApplicationRef).whenStable();

    expect(await labels()).toEqual(['Ring of Tests:checked', 'Diamond of Tests:unchecked']);
    expect(currentBuild.value.isDirty).toBe(dirtyBefore);
    expect(navigate).not.toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('starts owned things ticked from the trove import', async () => {
    TestBed.inject(UserGearService).importFromTroveCsv(
      ['SubscriptionHash,Character,Location,Tab,Name,Quantity,Binding', 'HASH,A,Bank,Main,Diamond of Tests,1,None']
        .join(String.fromCharCode(10)),
      new Set(), new Set(['diamond of tests']));

    expect(await labels()).toEqual(['Ring of Tests:unchecked', 'Diamond of Tests:checked']);
  });

  it('lists a thing under the quests picked for it, remembering the pick for the build', async () => {
    equipped.set(ring('Diamond of Tests', ['Augment Vendor', 'The Snitch']));
    const titles = async () => (await groups()).map(group => [group.label, group.rows.map(row => row.entry.label)]);
    // The ring drops in The Snitch, so the diamond is got there too.
    expect(await titles()).toEqual([['The Snitch', ['Ring of Tests', 'Diamond of Tests']]]);

    const diamond = (await rowsOf()).find(row => row.entry.label === 'Diamond of Tests')!;
    service.pickSources(diamond, ['Augment Vendor']);
    expect(await titles()).toEqual([['The Snitch', ['Ring of Tests']], ['Augment Vendor', ['Diamond of Tests']]]);
    expect(TestBed.inject(ShoppingProgressStore).picks).toEqual({ 'augment|Diamond of Tests': ['Augment Vendor'] });
    expect(service.stillNeededText()).toContain('Augment Vendor');

    service.pickSources(diamond, null);
    expect(await titles()).toEqual([['The Snitch', ['Ring of Tests', 'Diamond of Tests']]]);

    service.pickSources(diamond, ['Augment Vendor']);
    service.resetRoute();
    expect(await titles()).toEqual([['The Snitch', ['Ring of Tests', 'Diamond of Tests']]]);
    expect(TestBed.inject(ShoppingProgressStore).picks).toEqual({});
  });

  it('plans the route around what is still needed when the list opens, and keeps it while things are ticked', async () => {
    vi.spyOn(TestBed.inject(QuestService), 'getPack').mockReturnValue('Sharn');
    equipped.set(ring('Diamond of Tests', ['Augment Vendor', 'The Snitch']));
    const titles = async () => (await groups()).map(group => [group.label, group.rows.map(row => row.entry.label)]);
    const textQuests = () => service.stillNeededText().split(String.fromCharCode(10))
      .filter(line => ['The Snitch', 'Augment Vendor'].includes(line));
    const toggleRing = async () => service.toggle((await rowsOf()).find(row => row.entry.label === 'Ring of Tests')!);
    const together = [['The Snitch', ['Ring of Tests', 'Diamond of Tests']]];
    const apart = [['Augment Vendor', ['Diamond of Tests']], ['The Snitch', ['Ring of Tests']]];

    let open = service.view$.subscribe();
    expect(await titles()).toEqual(together);
    await toggleRing();
    // The diamond stays where you were going for the ring, and the text says so too.
    expect(await titles()).toEqual(together);
    expect(textQuests()).toEqual(['The Snitch']);
    open.unsubscribe();

    // Opened again, nothing sends you to The Snitch any more.
    open = service.view$.subscribe();
    expect(await titles()).toEqual(apart);
    expect(textQuests()).toEqual(['Augment Vendor']);
    await toggleRing();
    expect(await titles()).toEqual(apart);
    service.resetRoute();
    expect(await titles()).toEqual(together);
    open.unsubscribe();
  });

  it('keeps each pack\'s colour when a pick lists a new pack before it', async () => {
    vi.spyOn(TestBed.inject(QuestService), 'getPack').mockImplementation(quest =>
      ({ 'The Snitch': 'Sharn', 'Augment Vendor': 'Amber Pack' })[quest] ?? null);
    equipped.set(ring('Diamond of Tests', ['Augment Vendor', 'The Snitch']));
    const accents = async () => (await view()).sections.map(section => [section.label, section.accent]);
    expect(await accents()).toEqual([['Sharn', 0]]);

    const diamond = (await rowsOf()).find(row => row.entry.label === 'Diamond of Tests')!;
    service.pickSources(diamond, ['Augment Vendor']);
    expect(await accents()).toEqual([['Amber Pack', 1], ['Sharn', 0]]);
  });

  it('publishes what friends see while the build is as saved, routed as the list is', async () => {
    const publish = vi.spyOn(TestBed.inject(ShoppingProgressStore), 'publish');
    TestBed.inject(CurrentBuildService).acceptCurrentAsBaseline();

    service.toggle((await rowsOf())[0]);
    await view();

    expect(publish).toHaveBeenLastCalledWith({
      needed: ['a|Ring1|Colorless Augment Slot#0|Diamond of Tests'],
      route: { 'augment|Diamond of Tests': ['Augment Vendor'] }
    });
  });

  it('publishes nothing while the build has unsaved changes', async () => {
    const publish = vi.spyOn(TestBed.inject(ShoppingProgressStore), 'publish');
    const currentBuild = TestBed.inject(CurrentBuildService);
    const clean = currentBuild.value;
    Object.defineProperty(currentBuild, 'value', { get: () => ({ ...clean, isDirty: true }) });

    service.toggle((await rowsOf())[0]);
    await view();

    expect(publish).not.toHaveBeenCalled();
  });

  it('gives the keys of what\'s still needed', async () => {
    expect(service.stillNeededKeys()).toHaveLength(2);

    service.toggle((await rowsOf()).find(row => row.entry.label === 'Ring of Tests')!);

    expect(service.stillNeededKeys()).toEqual(['a|Ring1|Colorless Augment Slot#0|Diamond of Tests']);
  });

  it('lists packs and quests as arranged, remembering it for the build, and the text follows', async () => {
    vi.spyOn(TestBed.inject(QuestService), 'getPack').mockImplementation(quest =>
      ({ 'The Snitch': 'Sharn', 'Augment Vendor': 'Sharn', 'Lahar': 'Amber Pack' })[quest] ?? null);
    equipped.set(ring('Diamond of Tests', ['Augment Vendor']));
    equipped.set(new Item({ name: 'Amulet of Tests', slot: 'Necklace', type: 'Jewelry', ml: 30, quests: ['Lahar'], crafting: [] }));
    const outline = async () => (await view()).sections.map(section => [section.label, section.groups.map(group => group.label)]);
    const textOrder = () => service.stillNeededText().split(String.fromCharCode(10))
      .filter(line => ['== Sharn ==', '== Amber Pack ==', 'The Snitch', 'Augment Vendor', 'Lahar'].includes(line));
    expect(await outline()).toEqual([['Amber Pack', ['Lahar']], ['Sharn', ['Augment Vendor', 'The Snitch']]]);

    service.arrangePacks(['Sharn', 'Amber Pack']);
    service.arrangeQuests(['The Snitch', 'Augment Vendor']);

    expect(await outline()).toEqual([['Sharn', ['The Snitch', 'Augment Vendor']], ['Amber Pack', ['Lahar']]]);
    expect((await view()).arranged).toBe(true);
    expect(TestBed.inject(ShoppingProgressStore).order).toEqual({ packs: ['Sharn', 'Amber Pack'], quests: ['The Snitch', 'Augment Vendor'] });
    expect(textOrder()).toEqual(['== Sharn ==', 'The Snitch', 'Augment Vendor', '== Amber Pack ==', 'Lahar']);

    service.resetOrder();
    expect(await outline()).toEqual([['Amber Pack', ['Lahar']], ['Sharn', ['Augment Vendor', 'The Snitch']]]);
    expect((await view()).arranged).toBe(false);
  });

  it('groups the list by quest, and writes the still-needed text', async () => {
    expect((await groups()).map(group => group.label)).toEqual(['The Snitch', 'Augment Vendor']);
    expect(service.stillNeededText()).toContain('Augment Vendor');
    expect(service.stillNeededText().split(String.fromCharCode(10))[0]).toBe('Still needed for my build (2):');
  });
});
