import { inject, Injectable } from '@angular/core';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

import { CRAFTING_SLOTS_FRAGMENT, isCraftingSlotsFragment } from '../../build/crafting-slots-link';
import { AnalyticsService } from '../../shared/analytics.service';
import { EquippedService } from '../equipped.service';
import { FragmentViewService } from '../fragment-view';

/** What opened the crafting slots view: the Equipment panel's switch, or a URL saying it's open. */
export type CraftingSlotsEntryPoint = 'switch' | 'url';

/**
 * Whether the Equipment panel shows every crafting slot on the equipped gear,
 * grouped by type, in place of the gear cards. The URL's fragment says so
 * (see crafting-slots-link.ts and FragmentViewService), and Back returns to
 * the cards.
 */
@Injectable({ providedIn: 'root' })
export class CraftingSlotsViewService extends FragmentViewService<CraftingSlotsEntryPoint> {
  private readonly equipped = inject(EquippedService);
  private readonly analytics = inject(AnalyticsService);
  private readonly openings: Subscription;

  constructor() {
    super(CRAFTING_SLOTS_FRAGMENT, isCraftingSlotsFragment);
    // However it opens - the switch, a reload, Forward - it's the Equipment
    // panel's view: on a phone, that's the tab to be on.
    this.openings = this.isOpen$.pipe(filter(Boolean)).subscribe(() => {
      this.equipped.setActiveMainTab('equipment');
      this.analytics.track('open_crafting_slots', { from: this.openedFrom });
    });
  }

  override ngOnDestroy(): void {
    this.openings.unsubscribe();
    super.ngOnDestroy();
  }
}
