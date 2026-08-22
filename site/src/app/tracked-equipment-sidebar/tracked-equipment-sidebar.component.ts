import { Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';
import { Subscription } from 'rxjs';

import { EquippedService } from '../equipped.service';
import { Item } from '../item';
import { SuggestionDrawerService } from '../suggestion-drawer/suggestion-drawer.service';

interface TrackedEquipmentSlotDisplay {
  slot: string;
  item: Item | null;
  suppliedCount: number;
}

@Component({
  selector: 'app-tracked-equipment-sidebar',
  templateUrl: './tracked-equipment-sidebar.component.html',
  standalone: false
})
export class TrackedEquipmentSidebarComponent implements OnDestroy {
  @Input() suppliedAffixCounts = new Map<string, number>();
  @Input() highlightedSlots = new Set<string>();
  @Input() collapsed = false;
  @Output() collapsedChange = new EventEmitter<boolean>();

  selectedSlot: string | null = null;
  hoveredSlot: string | null = null;
  recentlyEquippedSlot: string | null = null;
  private equippedEventsSubscription: Subscription;
  private recentlyEquippedTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    public equipped: EquippedService,
    private suggestionDrawer: SuggestionDrawerService
  ) {
    this.equippedEventsSubscription = this.equipped.getEquippedItemEvents().subscribe(event => {
      this.showRecentlyEquippedSlot(event.slot);
    });
  }

  ngOnDestroy() {
    this.equippedEventsSubscription.unsubscribe();
    if (this.recentlyEquippedTimeout) {
      clearTimeout(this.recentlyEquippedTimeout);
    }
  }

  toggle() {
    this.collapsed = !this.collapsed;
    if (this.collapsed) {
      this.selectedSlot = null;
      this.hoveredSlot = null;
    }
    this.collapsedChange.emit(this.collapsed);
  }

  getEquippedSlots(): TrackedEquipmentSlotDisplay[] {
    const slots = [];
    for (const [slot, item] of this.equipped.getSlotsSnapshot().entries()) {
      slots.push({
        slot,
        item: item && item.isValid() ? item : null,
        suppliedCount: this.suppliedAffixCounts.get(slot) || 0
      });
    }
    return slots;
  }

  getFocusedItem(): Item | null {
    if (!this.focusedSlot || this.focusedSlot === 'Set') {
      return null;
    }

    const item = this.equipped.getSlotsSnapshot().get(this.focusedSlot);
    return item && item.isValid() ? item : null;
  }

  showSuggestedItems(slot: string) {
    if (this.isSlotDisabled(slot)) {
      return;
    }

    this.suggestionDrawer.openSlot(slot);
  }

  clearSlot(slot: string, event?: Event) {
    event?.stopPropagation();
    if (this.isSlotDisabled(slot)) {
      return;
    }

    this.equipped.clearSlot(slot);
    if (this.selectedSlot === slot) {
      this.selectedSlot = null;
    }
    if (this.hoveredSlot === slot) {
      this.hoveredSlot = null;
    }
  }

  isSlotDisabled(slot: string): boolean {
    return slot === 'Offhand' && this.equipped.isOffhandDisabled();
  }

  previewSlot(slot: string | null) {
    this.hoveredSlot = slot;
  }

  clearPreviewSlot(slot: string | null) {
    if (this.hoveredSlot === slot) {
      this.hoveredSlot = null;
    }
  }

  getSidebarItemName(item: Item | null): string {
    if (!item) {
      return 'Empty';
    }

    return item.name
      .replace(/\bLegendary\b/g, 'L.')
      .replace(/\bEpic\b/g, 'E.');
  }

  isRecentlyEquipped(slot: string): boolean {
    return this.recentlyEquippedSlot === slot;
  }

  isHighlightedSlot(slot: string): boolean {
    return this.highlightedSlots.has(slot);
  }

  private showRecentlyEquippedSlot(slot: string) {
    if (this.recentlyEquippedTimeout) {
      clearTimeout(this.recentlyEquippedTimeout);
    }

    this.recentlyEquippedSlot = slot;
    this.recentlyEquippedTimeout = setTimeout(() => {
      this.recentlyEquippedSlot = null;
      this.recentlyEquippedTimeout = null;
    }, 1900);
  }

  get focusedSlot(): string | null {
    return this.selectedSlot || this.hoveredSlot;
  }
}
