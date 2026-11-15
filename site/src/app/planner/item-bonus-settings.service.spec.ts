import { TestBed } from '@angular/core/testing';

import { ItemBonusKind } from '../gear/item-bonus';
import { ItemBonusSettingsService } from './item-bonus-settings.service';

describe('ItemBonusSettingsService', () => {
  const storageKey = 'ddo-gear-planner-item-bonus-kinds';
  const create = () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(ItemBonusSettingsService);
  };

  beforeEach(() => localStorage.removeItem(storageKey));

  it('starts with every system off', () => {
    const service = create();

    expect([...service.getEnabledKindsSnapshot()]).toEqual([]);
    expect(service.isEnabled('mythic')).toBe(false);
  });

  it('switches systems on and off one at a time, in a fixed order', () => {
    const service = create();
    const seen: ItemBonusKind[][] = [];
    service.getEnabledKinds().subscribe(kinds => seen.push([...kinds]));

    service.setEnabled('curse', true);
    service.setEnabled('mythic', true);
    service.setEnabled('curse', false);

    expect(seen).toEqual([[], ['curse'], ['mythic', 'curse'], ['mythic']]);
  });

  it('says nothing when a system is set to what it already is', () => {
    const service = create();
    let emissions = 0;
    service.getEnabledKinds().subscribe(() => emissions++);

    service.setEnabled('reaper', false);

    expect(emissions).toBe(1);
  });

  it('remembers the choice for the next visit', () => {
    create().setEnabled('reaper', true);

    expect(create().isEnabled('reaper')).toBe(true);
    expect(create().isEnabled('mythic')).toBe(false);
  });

  it('ignores a stored value it does not know', () => {
    localStorage.setItem(storageKey, 'reaper,epic,');

    expect([...create().getEnabledKindsSnapshot()]).toEqual(['reaper']);
  });
});
