import { Component, OnInit, ChangeDetectionStrategy, AfterViewInit, AfterViewChecked } from '@angular/core';
import { GearDbService } from '../gear-db.service';
import { EquippedService, VisibleSetBonus } from '../equipped.service';
import { Affix } from '../affix';
import { AffixRank } from '../affix-rank.enum';
import { AffixUiService } from '../affix-ui.service';
import { Clipboard } from '../clipboard';
import { UserGearService, UserItemLocation } from '../user-gear.service';
import { AnalyticsService } from '../analytics.service';
import { perfAfterFrames, perfStart } from '../perf-trace';
import { SuggestionDrawerService } from '../suggestion-drawer/suggestion-drawer.service';

@Component({
    selector: 'app-gear-list',
    templateUrl: './gear-list.component.html',
    styleUrls: ['./gear-list.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class GearListComponent implements OnInit, AfterViewInit, AfterViewChecked {
  itemNameMap: Map<string, string>;
  itemArtifactMap: Map<string, boolean>;

  constructor(
    public gearList: GearDbService,
    public equipped: EquippedService,
    public userGear: UserGearService,
    private affixUi: AffixUiService,
    private analytics: AnalyticsService,
    private suggestionDrawer: SuggestionDrawerService
  ) {
    this.itemNameMap = new Map<string, string>();
    this.itemArtifactMap = new Map<string, boolean>();
  }
  userOwnsItem(slot: string): boolean {
    const itemName = this.getItemName(slot);
    return !!itemName && this.userGear.hasItem(itemName);
  }

  getUserItemLocations(slot: string): UserItemLocation[] | undefined {
    const itemName = this.getItemName(slot);
    return itemName ? this.userGear.getItemLocations(itemName) : undefined;
  }

  visibleSetBonuses: Array<VisibleSetBonus> = [];
  private loggedInitialViewChecked = false;

  ngOnInit() {
    const done = perfStart('GearListComponent.ngOnInit');
    let slotSubscriptionCount = 0;
    for (const item of this.equipped.getSlots().values()) {
      slotSubscriptionCount++;
      item.subscribe(newItem => {
        if (newItem) {
          this.itemNameMap.set(newItem.slot, newItem.name);
          this.itemArtifactMap.set(newItem.slot, !!newItem.artifact);
        }
      });
    }

    this.equipped.getVisibleSetBonusesObservable().subscribe(setBonuses => {
      this.visibleSetBonuses = setBonuses;
    });
    done({ slotSubscriptionCount });
  }

  ngAfterViewInit() {
    const done = perfStart('GearListComponent.ngAfterViewInit');
    done({
      slotCount: this.gearList.getSlots().length,
      activeSetBonusCount: this.visibleSetBonuses.length
    });
    perfAfterFrames('paint after gear list view init');
  }

  ngAfterViewChecked() {
    if (this.loggedInitialViewChecked) {
      return;
    }

    this.loggedInitialViewChecked = true;
    const done = perfStart('GearListComponent.ngAfterViewChecked.first');
    done({
      itemNameCount: this.itemNameMap.size,
      activeSetBonusCount: this.visibleSetBonuses.length
    });
  }

  showSuggestedItems(slot: string) {
    if (this.isSlotDisabled(slot)) {
      return;
    }

    const done = perfStart('GearListComponent.showSuggestedItems');
    this.analytics.track('open_item_suggestions', {
      slot
    });
    this.suggestionDrawer.openSlot(slot);
    done({ slot });
    perfAfterFrames('paint after slot suggestions open');
  }

  showItemsInSet(setName: string) {
    this.analytics.track('open_set_items', {
      source: 'active_set'
    });
    this.suggestionDrawer.openSet(setName);
  }

  getItemName(slot: string) {
    const itemName = this.itemNameMap.get(slot);
    if (itemName) {
      return itemName;
    }

    return '';
  }

  getAffixValue(affix: Affix) {
    return this.affixUi.getAffixValue(affix);
  }

  getClassForAffix(affix: Affix) {
    return this.affixUi.getClassForAffix(affix);
  }

  getClassForSetBonusAffix(affix: Affix, eligible: boolean) {
    if (!eligible) {
      return 'DisabledSetBonus';
    }

    return this.getClassForAffix(affix);
  }

  getAffixTooltip(affix: Affix): string {
    return this.affixUi.getAffixTooltip(affix);
  }

  getSetBonusTooltip(eligible: boolean, threshold: number, pieces: number, affix: Affix): string {
    if (!eligible) {
      return `Need ${threshold} set items (currently have ${pieces})`;
    }

    return this.getAffixTooltip(affix);
  }

  getClassForSlot(slot: string) {
    if (this.isMinorArtifact(slot)) {
      return 'MinorArtifact';
    }
    return '';
  }

  isMinorArtifact(slot: string) {
    return !!this.itemArtifactMap.get(slot);
  }

  isSlotDisabled(slot: string) {
    return slot === 'Offhand' && this.equipped.isOffhandDisabled();
  }

  getSlotTitle(slot: string) {
    if (this.isSlotDisabled(slot)) {
      return 'Offhand unavailable while a two-handed weapon is equipped.';
    }

    if (slot === 'Offhand' && this.equipped.isOffhandRuneArmOnly()) {
      return 'Crossbows can use rune arms in the offhand.';
    }

    return '';
  }

  copyGearToClipboard() {
    Clipboard.copy(this.equipped.getGearDescription());
    this.analytics.track('copy_build', {
      equipped_slot_count: this.getEquippedSlotCount()
    });
  }

  clearSlot(slot: string) {
    if (this.isSlotDisabled(slot)) {
      return;
    }

    this.equipped.clearSlot(slot);
    this.analytics.track('planner_clear_slot', {
      slot
    });
  }

  getAllGear() {
    const allGear = [];
    for (const slot of this.gearList.getSlots()) {
      allGear.push(...this.gearList.getGearBySlot(slot));
    }
    return allGear;
  }

  onGlobalItemSelected = (item: any) => {
    if (item) {
      let actualItem: any = item;
      if (item.original) {
        // This is a synonym match, find the actual item by name
        const allGear = this.getAllGear();
        actualItem = allGear.find(g => g.name === item.original);
        if (!actualItem) {
          console.log('Could not find item with name:', item.original);
          return;
        }
      } else if (!item.slot) {
        // Not an Item object, maybe a fake object
        console.log('Invalid item selected:', item);
        return;
      }
      if (!this.equipped.canEquip(actualItem)) {
        return;
      }
      this.equipped.set(actualItem);
      this.analytics.track('planner_equip_item', {
        equip_source: 'global_search',
        slot: actualItem.slot
      });
    }
  }

  globalResultFormatter = (item: any) => {
    if (item.slot) {
      const current = this.equipped.getSlotsSnapshot().get(item.slot)?.name;
      return item.name + ' (' + item.slot + ')' + (current ? ' (replaces ' + current + ')' : '');
    }
    return item.name;
  }

  private getEquippedSlotCount() {
    return Array.from(this.equipped.getSlotsSnapshot().values()).filter(item => item && item.isValid()).length;
  }

  isBuildEmpty() {
    return this.getEquippedSlotCount() === 0;
  }
}
