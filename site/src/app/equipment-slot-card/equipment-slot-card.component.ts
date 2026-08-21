import { Component, HostBinding, Input, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';

import { AnalyticsService } from '../analytics.service';
import { EquippedService } from '../equipped.service';
import { Item } from '../item';
import { SuggestionDrawerService } from '../suggestion-drawer/suggestion-drawer.service';
import { UserGearService, UserItemLocation } from '../user-gear.service';
import { perfAfterFrames, perfStart } from '../perf-trace';

@Component({
  selector: 'app-equipment-slot-card',
  templateUrl: './equipment-slot-card.component.html',
  styleUrls: ['./equipment-slot-card.component.css'],
  host: {
    class: 'mb-3 card col-sm-12 col-md-6 col-lg-4'
  },
  standalone: false
})
export class EquipmentSlotCardComponent implements OnInit, OnDestroy {
  @Input() slot!: string;
  @Input() recommendedStart = false;

  itemName = '';
  isArtifact = false;
  private slotSubscription?: Subscription;

  constructor(
    public equipped: EquippedService,
    public userGear: UserGearService,
    private analytics: AnalyticsService,
    private suggestionDrawer: SuggestionDrawerService
  ) { }

  @HostBinding('class.recommended-start-slot')
  get isRecommendedStart() {
    return this.recommendedStart;
  }

  @HostBinding('class.disabled-slot')
  get disabledSlotClass() {
    return this.isSlotDisabled();
  }

  @HostBinding('attr.title')
  get hostTitle() {
    return this.getSlotTitle();
  }

  ngOnInit() {
    const slot = this.equipped.getSlot(this.slot);
    this.slotSubscription = slot?.subscribe(item => this.setItem(item));
  }

  ngOnDestroy() {
    this.slotSubscription?.unsubscribe();
  }

  userOwnsItem(): boolean {
    return !!this.itemName && this.userGear.hasItem(this.itemName);
  }

  getUserItemLocations(): UserItemLocation[] | undefined {
    return this.itemName ? this.userGear.getItemLocations(this.itemName) : undefined;
  }

  showSuggestedItems() {
    if (this.isSlotDisabled()) {
      return;
    }

    const done = perfStart('EquipmentSlotCardComponent.showSuggestedItems');
    this.analytics.track('open_item_suggestions', {
      slot: this.slot
    });
    this.suggestionDrawer.openSlot(this.slot);
    done({ slot: this.slot });
    perfAfterFrames('paint after slot suggestions open');
  }

  clearSlot() {
    if (this.isSlotDisabled()) {
      return;
    }

    this.equipped.clearSlot(this.slot);
    this.analytics.track('planner_clear_slot', {
      slot: this.slot
    });
  }

  getClassForSlot() {
    return this.isArtifact ? 'MinorArtifact' : '';
  }

  isSlotDisabled() {
    return this.slot === 'Offhand' && this.equipped.isOffhandDisabled();
  }

  getSlotTitle() {
    if (this.isSlotDisabled()) {
      return 'Offhand unavailable while a two-handed weapon is equipped.';
    }

    if (this.slot === 'Offhand' && this.equipped.isOffhandRuneArmOnly()) {
      return 'Crossbows can use rune arms in the offhand.';
    }

    return '';
  }

  private setItem(item: Item | null) {
    if (item && item.isValid()) {
      this.itemName = item.name;
      this.isArtifact = !!item.artifact;
      return;
    }

    this.itemName = '';
    this.isArtifact = false;
  }
}
