import { TestBed } from '@angular/core/testing';

import { AnalyticsService } from '../shared/analytics.service';
import { EquippedService } from '../planner/equipped.service';
import { Item } from '../gear/item';
import { DrawerEquipService } from './drawer-equip.service';
import { SuggestionDrawerService } from './suggestion-drawer.service';

describe('DrawerEquipService', () => {
  it('equips the item, reports its source, and closes the drawer', () => {
    const equipped = {
      set: vi.fn().mockName('EquippedService.set')
    };
    const analytics = {
      track: vi.fn().mockName('AnalyticsService.track')
    };
    const drawer = {
      close: vi.fn().mockName('SuggestionDrawerService.close')
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: EquippedService, useValue: equipped },
        { provide: AnalyticsService, useValue: analytics },
        { provide: SuggestionDrawerService, useValue: drawer },
      ]
    });

    const item = new Item(null);
    item.name = 'Test Ring';
    item.slot = 'Ring1';
    item.crafting = [];

    TestBed.inject(DrawerEquipService).equip(item, 'set_preview');

    expect(equipped.set).toHaveBeenCalledTimes(1);

    expect(equipped.set).toHaveBeenCalledWith(item);
    expect(analytics.track).toHaveBeenCalledTimes(1);
    expect(analytics.track).toHaveBeenCalledWith('planner_equip_item', {
      equip_source: 'set_preview',
      slot: 'Ring1',
      crafted: false
    });
    expect(drawer.close).toHaveBeenCalledTimes(1);
  });
});
