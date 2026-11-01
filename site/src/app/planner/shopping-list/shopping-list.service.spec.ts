import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { CurrentBuildService } from '../../build/current-build.service';
import { Craftable } from '../../gear/craftable';
import { CraftableOption } from '../../gear/craftable-option';
import { Item } from '../../gear/item';
import { EquippedService } from '../equipped.service';
import { UserGearService } from '../user-gear.service';
import { ShoppingListService } from './shopping-list.service';
import { SHOPPING_PROGRESS_STORAGE_KEY } from './shopping-progress-storage';

const GROUP_MODE_KEY = 'ddo-gear-planner-shopping-list-group-mode';

function ring(augment: string): Item {
  const slot = new Craftable('Colorless Augment Slot', [
    new CraftableOption({ name: 'Diamond of Tests', quests: ['Augment Vendor'] }),
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
  const labels = async () => (await groups()).flatMap(group => group.rows.flatMap(row =>
    [`${row.entry.label}:${row.state}`, ...row.children.map(child => `${child.entry.label}:${child.state}`)]));

  beforeEach(async () => {
    for (const key of [SHOPPING_PROGRESS_STORAGE_KEY, GROUP_MODE_KEY]) {
      localStorage.removeItem(key);
    }
    TestBed.configureTestingModule({});
    service = TestBed.inject(ShoppingListService);
    equipped = TestBed.inject(EquippedService);
    equipped.set(ring('Diamond of Tests'));
    await TestBed.inject(ApplicationRef).whenStable();
  });

  afterEach(() => {
    TestBed.inject(UserGearService).clear();
    for (const key of [SHOPPING_PROGRESS_STORAGE_KEY, GROUP_MODE_KEY]) {
      localStorage.removeItem(key);
    }
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

    service.toggle((await groups())[0].rows[0]);
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

  it('remembers how the list is grouped, and writes the still-needed text grouped by quest', async () => {
    service.setGroupMode('source');
    expect((await groups()).map(group => group.label)).toEqual(['The Snitch', 'Augment Vendor']);
    expect(localStorage.getItem(GROUP_MODE_KEY)).toBe('source');

    service.setGroupMode('slot');
    expect(service.stillNeededText()).toContain('Augment Vendor');
    expect(service.stillNeededText().split(String.fromCharCode(10))[0]).toBe('Still needed for my build (2):');
  });
});
