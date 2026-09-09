import { Component, OnInit, Input, ChangeDetectionStrategy } from '@angular/core';

import { GearDbService, SetBonusThreshold } from '../gear-db.service';
import { EquippedService } from '../equipped.service';
import { Item } from '../item';
import { Affix } from '../affix';
import { AffixUiService } from '../affix-ui.service';
import { AnalyticsService } from '../analytics.service';
import { SuggestionDrawerService } from '../suggestion-drawer/suggestion-drawer.service';

@Component({
    selector: 'app-items-in-set',
    templateUrl: './items-in-set.component.html',
    styleUrls: ['./items-in-set.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ItemsInSetComponent implements OnInit {
  @Input() setName!: string;

  matches!: Array<Item>;
  lockedMatches!: Array<Item>;
  setBonusTiers: Array<SetBonusThreshold> = [];
  equippedPieces = 0;
  previewItem: Item | null = null;
  previewItems: Item[] = [];
  previewIndex = -1;

  constructor(
    public gearDB: GearDbService,
    public equipped: EquippedService,
    private affixUi: AffixUiService,
    private analytics: AnalyticsService,
    private suggestionDrawer: SuggestionDrawerService
  ) { }

  ngOnInit() {
    this.matches = [];
    this.lockedMatches = [];

    this.equippedPieces = this.equipped.getActiveSets().get(this.setName) || 0;
    this.setBonusTiers = this.gearDB.getSetBonusThresholdDetails(this.setName, this.equippedPieces);

    const matchingGear = this.equipped.getCompatibleGear(this.gearDB.findGearInSet(this.setName));
    for (const item of matchingGear) {
      if (this.equipped.getUnlockedSlots().has(item.slot)) {
        this.matches.push(item);
      } else {
        this.lockedMatches.push(item);
      }
    }

    this.matches = this._sortBySlot(this.matches);
    this.lockedMatches = this._sortBySlot(this.lockedMatches);
  }

  _sortBySlot(array: Array<Item>) {
    return array.sort((a, b) =>
      a.slot.localeCompare(b.slot));
  }

  getSetAffixValue(affix: Affix): string {
    return this.affixUi.getAffixValue(affix);
  }

  getClassForSetAffix(affix: Affix, eligible: boolean): string {
    return eligible ? this.affixUi.getClassForAffix(affix) : 'DisabledSetBonus';
  }

  getSetBonusTooltip(tier: SetBonusThreshold): string {
    return tier.eligible
      ? `Active — ${tier.threshold} of ${this.setName} equipped`
      : `Needs ${tier.threshold} set items (currently ${this.equippedPieces})`;
  }

  equipItem(item: Item) {
    if (!this.equipped.canEquip(item)) {
      return;
    }

    this.equipped.set(item);
    this.analytics.track('planner_equip_item', {
      equip_source: 'set_modal',
      slot: item.slot
    });
    this.suggestionDrawer.close();
  }

  showItemPreview(item: Item, items: Item[] = [], index = -1) {
    this.previewItems = items.slice();
    this.previewIndex = index >= 0
      ? index
      : this.previewItems.findIndex(candidate => this.isSameItem(candidate, item));
    this.setPreviewItem(item);
  }

  private setPreviewItem(item: Item) {
    this.previewItem = new Item(item);
  }

  closeItemPreview() {
    this.previewItem = null;
    this.previewItems = [];
    this.previewIndex = -1;
  }

  showPreviousPreviewItem() {
    if (!this.canShowPreviousPreviewItem()) {
      return;
    }

    this.previewIndex -= 1;
    this.setPreviewItem(this.previewItems[this.previewIndex]);
  }

  showNextPreviewItem() {
    if (!this.canShowNextPreviewItem()) {
      return;
    }

    this.previewIndex += 1;
    this.setPreviewItem(this.previewItems[this.previewIndex]);
  }

  canShowPreviousPreviewItem(): boolean {
    return this.previewIndex > 0;
  }

  canShowNextPreviewItem(): boolean {
    return this.previewIndex >= 0 && this.previewIndex < this.previewItems.length - 1;
  }

  isPreviewingItem(item: Item): boolean {
    return !!this.previewItem && this.isSameItem(this.previewItem, item);
  }

  private isSameItem(left: Item, right: Item): boolean {
    return left.name === right.name && left.slot === right.slot && left.ml === right.ml;
  }

  equipPreviewItem() {
    if (!this.previewItem || !this.equipped.canEquip(this.previewItem)) {
      return;
    }

    const itemToEquip = new Item(this.previewItem);
    this.equipped.set(itemToEquip);
    this.analytics.track('planner_equip_item', {
      equip_source: 'set_preview',
      slot: itemToEquip.slot
    });
    this.suggestionDrawer.close();
  }

  get canGoBack(): boolean {
    return this.suggestionDrawer.canGoBack;
  }

  goBack() {
    this.suggestionDrawer.back();
  }

  close() {
    this.suggestionDrawer.close();
  }
}
