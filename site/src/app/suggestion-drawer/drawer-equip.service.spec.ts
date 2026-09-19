import { TestBed } from '@angular/core/testing';

import { AnalyticsService } from '../analytics.service';
import { EquippedService } from '../equipped.service';
import { Item } from '../item';
import { DrawerEquipService } from './drawer-equip.service';
import { SuggestionDrawerService } from './suggestion-drawer.service';

describe('DrawerEquipService', () => {
  it('equips the item, reports its source, and closes the drawer', () => {
    const equipped = jasmine.createSpyObj<EquippedService>('EquippedService', ['set']);
    const analytics = jasmine.createSpyObj<AnalyticsService>('AnalyticsService', ['track']);
    const drawer = jasmine.createSpyObj<SuggestionDrawerService>('SuggestionDrawerService', ['close']);
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

    expect(equipped.set).toHaveBeenCalledOnceWith(item);
    expect(analytics.track).toHaveBeenCalledOnceWith('planner_equip_item', {
      equip_source: 'set_preview',
      slot: 'Ring1',
      crafted: false
    });
    expect(drawer.close).toHaveBeenCalledTimes(1);
  });
});
