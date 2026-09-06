import { Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';
import { Subscription } from 'rxjs';

import { EquippedService, VisibleSetBonus } from '../equipped.service';
import { Item } from '../item';
import { Affix } from '../affix';
import { AffixUiService } from '../affix-ui.service';
import { SuggestionDrawerService } from '../suggestion-drawer/suggestion-drawer.service';

interface TrackedEquipmentSlotDisplay {
  slot: string;
  item: Item | null;
  suppliedCount: number;
}

interface TrackedEquipmentSetDisplay {
  setName: string;
  suppliedCount: number;
}

@Component({
  selector: 'app-tracked-equipment-sidebar',
  templateUrl: './tracked-equipment-sidebar.component.html',
  standalone: false
})
export class TrackedEquipmentSidebarComponent implements OnDestroy {
  @Input() suppliedAffixCounts = new Map<string, number>();
  @Input() suppliedSetAffixCounts = new Map<string, number>();
  @Input() highlightedSlots = new Set<string>();
  @Input() highlightedSets = new Set<string>();
  @Input() collapsed = false;
  @Output() collapsedChange = new EventEmitter<boolean>();

  selectedSlot: string | null = null;
  hoveredSlot: string | null = null;
  hoveredSet: string | null = null;
  recentlyEquippedSlot: string | null = null;
  private equippedEventsSubscription: Subscription;
  private setBonusesSubscription: Subscription;
  private visibleSetBonuses: VisibleSetBonus[] = [];
  private recentlyEquippedTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    public equipped: EquippedService,
    public affixUi: AffixUiService,
    private suggestionDrawer: SuggestionDrawerService
  ) {
    this.equippedEventsSubscription = this.equipped.getEquippedItemEvents().subscribe(event => {
      this.showRecentlyEquippedSlot(event.slot);
    });
    this.setBonusesSubscription = this.equipped.getVisibleSetBonusesObservable().subscribe(bonuses => {
      this.visibleSetBonuses = bonuses;
    });
  }

  ngOnDestroy() {
    this.equippedEventsSubscription.unsubscribe();
    this.setBonusesSubscription.unsubscribe();
    if (this.recentlyEquippedTimeout) {
      clearTimeout(this.recentlyEquippedTimeout);
    }
  }

  toggle() {
    this.collapsed = !this.collapsed;
    if (this.collapsed) {
      this.selectedSlot = null;
      this.hoveredSlot = null;
      this.hoveredSet = null;
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

  getActiveSetDisplays(): TrackedEquipmentSetDisplay[] {
    return Array.from(this.suppliedSetAffixCounts.entries())
      .map(([setName, suppliedCount]) => ({ setName, suppliedCount }))
      .sort((a, b) => a.setName.localeCompare(b.setName));
  }

  isHighlightedSet(setName: string): boolean {
    return this.highlightedSets.has(setName);
  }

  previewSet(setName: string | null) {
    this.hoveredSet = setName;
  }

  clearPreviewSet(setName: string | null) {
    if (this.hoveredSet === setName) {
      this.hoveredSet = null;
    }
  }

  getFocusedSetBonus(): VisibleSetBonus | null {
    if (this.collapsed || !this.hoveredSet) {
      return null;
    }

    return this.visibleSetBonuses.find(bonus => bonus.setName === this.hoveredSet) || null;
  }

  getSetAffixValue(affix: Affix): string {
    return this.affixUi.getAffixValue(affix);
  }

  getClassForSetAffix(affix: Affix, eligible: boolean): string {
    return eligible ? this.affixUi.getClassForAffix(affix) : 'DisabledSetBonus';
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
