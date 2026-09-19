import { Component, Input, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';

import { EquippedService, VisibleSetBonus } from '../planner/equipped.service';
import { ExternalAffixEntry } from '../affixes/external-affix';
import { Item } from '../gear/item';
import { AffixUiService } from '../affixes/affix-ui.service';
import { SuggestionDrawerService } from '../suggestion-drawer/suggestion-drawer.service';
import { RECENT_CHANGE_HIGHLIGHT_MS } from '../planner/recent-change-highlight';

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
  @Input() highlightedExternal = false;

  selectedSlot: string | null = null;
  hoveredSlot: string | null = null;
  hoveredSet: string | null = null;
  hoveredExternal = false;
  recentlyEquippedSlot: string | null = null;
  externalAffixes: ExternalAffixEntry[] = [];
  private equippedEventsSubscription: Subscription;
  private setBonusesSubscription: Subscription;
  private externalAffixesSubscription: Subscription;
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
    this.externalAffixesSubscription = this.equipped.getExternalAffixesObservable().subscribe(entries => {
      this.externalAffixes = entries;
    });
  }

  ngOnDestroy() {
    this.equippedEventsSubscription.unsubscribe();
    this.setBonusesSubscription.unsubscribe();
    this.externalAffixesSubscription.unsubscribe();
    if (this.recentlyEquippedTimeout) {
      clearTimeout(this.recentlyEquippedTimeout);
    }
  }

  openFullView() {
    this.equipped.setActiveMainTab('equipment');
  }

  getEquippedSlots(): TrackedEquipmentSlotDisplay[] {
    const slots = [];
    for (const [slot, item] of this.equipped.getSlotsSnapshot().entries()) {
      slots.push({
        slot,
        item,
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
    if (!this.hoveredSet) {
      return null;
    }

    return this.visibleSetBonuses.find(bonus => bonus.setName === this.hoveredSet) || null;
  }

  describeExternalEntry(entry: ExternalAffixEntry): string {
    return this.affixUi.describeExternalAffix(entry);
  }

  removeExternal(id: string, event?: Event) {
    event?.stopPropagation();
    this.equipped.removeExternalAffix(id);
  }

  previewExternal() {
    this.hoveredExternal = true;
  }

  clearPreviewExternal() {
    this.hoveredExternal = false;
  }

  getFocusedItem(): Item | null {
    if (!this.focusedSlot || this.focusedSlot === 'Set') {
      return null;
    }

    return this.equipped.getSlotsSnapshot().get(this.focusedSlot) ?? null;
  }

  showSuggestedItems(slot: string) {
    if (this.equipped.isSlotDisabled(slot)) {
      return;
    }

    this.suggestionDrawer.openSlot(slot);
  }

  clearSlot(slot: string, event?: Event) {
    event?.stopPropagation();
    if (this.equipped.isSlotDisabled(slot)) {
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
    }, RECENT_CHANGE_HIGHLIGHT_MS);
  }

  get focusedSlot(): string | null {
    return this.selectedSlot || this.hoveredSlot;
  }
}
